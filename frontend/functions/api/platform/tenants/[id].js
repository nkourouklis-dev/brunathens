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
