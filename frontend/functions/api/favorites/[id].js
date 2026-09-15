import { jsonResponse, readJson } from '../../_lib/shared.js';

// A customer removes one of their favorites. The device id must match the
// customer, so nobody can delete someone else's favorites.
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const favoriteId = Number(params.id);
  const payload = await readJson(request);
  const customerId = Number(payload.customerId);
  const deviceId = String(payload.deviceId || '').trim();

  if (!favoriteId || !customerId || !deviceId) {
    return jsonResponse({ error: 'Favorite not found' }, 404);
  }

  const result = await env.DB.prepare(
    `DELETE FROM favorites
     WHERE id = ? AND customer_id = (SELECT id FROM customers WHERE id = ? AND device_id = ?)`,
  ).bind(favoriteId, customerId, deviceId).run();

  if (!result.meta.changes) {
    return jsonResponse({ error: 'Favorite not found' }, 404);
  }

  return jsonResponse({ success: true }, 200);
}
