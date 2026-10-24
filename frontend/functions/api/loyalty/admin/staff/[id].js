import { jsonResponse, readJson, handler, HttpError, requireStaff, cleanText, pinLookup } from '../../../../_lib/loyalty.js';

// Owner: rename, change PIN, or (de)activate a barista. Deactivation signs them out at once.
export const onRequestPatch = handler(async ({ request, env, params }) => {
  await requireStaff(env, request, { ownerOnly: true });
  const id = Number(params.id);
  const payload = await readJson(request);
  const sets = [];
  const binds = [];
  if ('name' in payload) {
    const name = cleanText(payload.name, 40);
    if (!name) throw new HttpError(400, 'Name required');
    sets.push('name = ?');
    binds.push(name);
  }
  if ('active' in payload) {
    sets.push('active = ?');
    binds.push(payload.active ? 1 : 0);
  }
  if ('pin' in payload) {
    const pin = String(payload.pin || '').trim();
    if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'PIN must be 6 digits');
    sets.push('pin_lookup = ?');
    binds.push(await pinLookup(env, pin));
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  try {
    const row = await env.DB.prepare(`UPDATE loyalty_staff SET ${sets.join(', ')} WHERE id = ? RETURNING id, name, active, created_at`)
      .bind(...binds, id).first();
    if (!row) throw new HttpError(404, 'Staff not found');
    return jsonResponse({ staff: { id: row.id, name: row.name, active: Boolean(row.active), createdAt: row.created_at } });
  } catch (error) {
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'PIN in use');
    throw error;
  }
});
