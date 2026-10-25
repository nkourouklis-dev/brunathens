import { jsonResponse, readJson, handler, HttpError, requireStaff, requireTenant, cleanText, pinLookup } from '../../../_lib/loyalty.js';

export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  await requireStaff(env, request, tenant, { ownerOnly: true });
  const rows = await env.DB.prepare('SELECT id, name, active, created_at FROM loyalty_staff WHERE tenant_id = ? ORDER BY active DESC, name').bind(tenant.id).all();
  return jsonResponse({ staff: rows.results.map((row) => ({ id: row.id, name: row.name, active: Boolean(row.active), createdAt: row.created_at })) });
});

// Owner adds a barista. PINs are 6 digits and unique across staff.
export const onRequestPost = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  await requireStaff(env, request, tenant, { ownerOnly: true });
  const payload = await readJson(request);
  const name = cleanText(payload.name, 40);
  const pin = String(payload.pin || '').trim();
  if (!name) throw new HttpError(400, 'Name required');
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'PIN must be 6 digits');
  try {
    const row = await env.DB.prepare('INSERT INTO loyalty_staff (tenant_id, name, pin_lookup) VALUES (?, ?, ?) RETURNING id, name, active, created_at')
      .bind(tenant.id, name, await pinLookup(env, tenant, pin)).first();
    return jsonResponse({ staff: { id: row.id, name: row.name, active: true, createdAt: row.created_at } }, 201);
  } catch (error) {
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'PIN in use');
    throw error;
  }
});
