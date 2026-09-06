import { jsonResponse, readJson, isAdminRequest } from '../../../_lib/shared.js';

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  const orderId = Number(params.id);
  const payload = await readJson(request);
  const status = String(payload.status || '').trim();

  if (!orderId || !status) {
    return jsonResponse({ error: 'Invalid order id or status' }, 400);
  }

  await env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, orderId).run();
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  return jsonResponse({ order }, 200);
}
