import {
  jsonResponse, readJson, handler, HttpError, requireMember, getSettings, publicMember, recentTransactions,
  cleanText, nowIso, getMemberById, endSession, requireTenant, publicTenant,
} from '../../_lib/loyalty.js';
import { appleWalletConfigured } from '../../_lib/apple-pass.js';
import { googleWalletConfigured, pushGoogleWalletUpdate } from '../../_lib/google-wallet.js';
import { notifyWallets } from '../../_lib/points.js';

export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const member = await requireMember(env, request, tenant);
  const settings = await getSettings(env, tenant);
  return jsonResponse({
    tenant: publicTenant(tenant),
    member: publicMember(member, settings),
    history: await recentTransactions(env, member.id),
    program: { pointsPerReward: settings.points_per_reward, rewardName: settings.reward_name },
    wallet: { apple: appleWalletConfigured(env), google: googleWalletConfigured(env) },
  });
});

export const onRequestPatch = handler(async ({ request, env, waitUntil }) => {
  const tenant = await requireTenant(env, request);
  const member = await requireMember(env, request, tenant);
  const payload = await readJson(request);
  const updates = {};
  if ('name' in payload) {
    updates.name = cleanText(payload.name, 60);
    if (!updates.name) throw new HttpError(400, 'Name required');
  }
  if ('favoriteDrink' in payload) updates.favorite_drink = cleanText(payload.favoriteDrink, 60) || null;
  if ('marketingOptIn' in payload) updates.marketing_opt_in = payload.marketingOptIn === true ? 1 : 0;

  const keys = Object.keys(updates);
  if (keys.length) {
    await env.DB.prepare(`UPDATE loyalty_members SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...keys.map((key) => updates[key]), nowIso(), member.id).run();
  }
  const settings = await getSettings(env, tenant);
  const fresh = await getMemberById(env, member.id, tenant.id);
  if (updates.name) notifyWallets(env, waitUntil, fresh, settings);
  return jsonResponse({ member: publicMember(fresh, settings) });
});

// GDPR erasure: personal data is wiped, the anonymous points history stays for the business's records.
export const onRequestDelete = handler(async ({ request, env, waitUntil }) => {
  const tenant = await requireTenant(env, request);
  const member = await requireMember(env, request, tenant);
  const settings = await getSettings(env, tenant);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE loyalty_members SET name = 'Διαγραμμένο μέλος', email = ?, favorite_drink = NULL, marketing_opt_in = 0,
       qr_version = qr_version + 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(`deleted-${member.id}@invalid`, now, now, member.id),
    env.DB.prepare('DELETE FROM loyalty_sessions WHERE member_id = ?').bind(member.id),
    env.DB.prepare('DELETE FROM loyalty_login_codes WHERE member_id = ?').bind(member.id),
    env.DB.prepare('DELETE FROM loyalty_apple_registrations WHERE serial_number = ?').bind(member.public_id),
  ]);
  const work = pushGoogleWalletUpdate(env, member, settings, { deleted: true });
  if (waitUntil) waitUntil(work);
  const cookie = await endSession(env, request, tenant);
  return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } });
});
