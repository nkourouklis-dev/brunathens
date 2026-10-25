import {
  readJson, handler, HttpError, normalizeEmail, sha256Hex, nowIso, startSession, getSettings, publicMember,
  timingSafeEqual, getMemberById, rateLimit, clientIp, requireTenant,
} from '../../../_lib/loyalty.js';

const MAX_ATTEMPTS = 5;

export const onRequestPost = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const payload = await readJson(request);
  const email = normalizeEmail(payload.email);
  const code = String(payload.code || '').replace(/\D/g, '');
  if (!email || code.length !== 6) throw new HttpError(400, 'Invalid code');
  if (!await rateLimit(env, `verify-ip:${tenant.slug}:${clientIp(request)}`, 30, 3600)) throw new HttpError(429, 'Too many attempts');

  const member = await env.DB.prepare('SELECT id FROM loyalty_members WHERE tenant_id = ? AND email = ? AND deleted_at IS NULL').bind(tenant.id, email).first();
  const entry = member && await env.DB.prepare(
    'SELECT * FROM loyalty_login_codes WHERE member_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1',
  ).bind(member.id, nowIso()).first();
  if (!entry || entry.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'Invalid code');

  if (!timingSafeEqual(entry.code_hash, await sha256Hex(`${member.id}:${code}`))) {
    await env.DB.prepare('UPDATE loyalty_login_codes SET attempts = attempts + 1 WHERE id = ?').bind(entry.id).run();
    throw new HttpError(400, 'Invalid code');
  }

  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE loyalty_login_codes SET used_at = ? WHERE id = ?').bind(now, entry.id),
    env.DB.prepare('UPDATE loyalty_members SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(now, member.id),
  ]);

  const cookie = await startSession(env, request, tenant, member.id);
  const settings = await getSettings(env, tenant);
  const fresh = await getMemberById(env, member.id, tenant.id);
  return new Response(JSON.stringify({ member: publicMember(fresh, settings) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  });
});
