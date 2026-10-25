import { jsonResponse, readJson, handler, HttpError, requireSuper, ownerKeyHash, randomString } from '../../../_lib/loyalty.js';

// Platform operator: switch a business off/on, or issue a new owner key (the old one stops working).
export const onRequestPatch = handler(async ({ request, env, params }) => {
  await requireSuper(env, request);
  const id = Number(params.id);
  const payload = await readJson(request);
  const tenant = await env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  if (!tenant) throw new HttpError(404, 'Business not found');

  if ('active' in payload) {
    await env.DB.prepare('UPDATE tenants SET active = ? WHERE id = ?').bind(payload.active ? 1 : 0, id).run();
  }
  let ownerKey;
  if (payload.resetOwnerKey === true) {
    ownerKey = [0, 1, 2, 3].map(() => randomString(4)).join('-');
    await env.DB.prepare('UPDATE tenants SET owner_key_hash = ? WHERE id = ?').bind(await ownerKeyHash(env, ownerKey.replace(/-/g, '')), id).run();
  }
  return jsonResponse({ ok: true, ...(ownerKey ? { ownerKey } : {}) });
});

// Platform operator only: permanently deletes a business and everything under it. The slug must be sent back as confirmation.
export const onRequestDelete = handler(async ({ request, env, params }) => {
  await requireSuper(env, request);
  const id = Number(params.id);
  const payload = await readJson(request);
  const tenant = await env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  if (!tenant) throw new HttpError(404, 'Business not found');
  if (payload.confirm !== tenant.slug) throw new HttpError(400, 'Confirmation does not match');

  const members = '(SELECT id FROM loyalty_members WHERE tenant_id = ?)';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM loyalty_apple_registrations WHERE serial_number IN (SELECT public_id FROM loyalty_members WHERE tenant_id = ?)`).bind(id),
    env.DB.prepare(`DELETE FROM loyalty_sessions WHERE member_id IN ${members}`).bind(id),
    env.DB.prepare(`DELETE FROM loyalty_login_codes WHERE member_id IN ${members}`).bind(id),
    env.DB.prepare('DELETE FROM loyalty_transactions WHERE tenant_id = ?').bind(id),
    env.DB.prepare('DELETE FROM loyalty_members WHERE tenant_id = ?').bind(id),
    env.DB.prepare('DELETE FROM loyalty_staff WHERE tenant_id = ?').bind(id),
    env.DB.prepare('DELETE FROM loyalty_settings WHERE tenant_id = ?').bind(id),
    env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id),
  ]);
  return jsonResponse({ ok: true });
});
