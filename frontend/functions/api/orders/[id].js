import { jsonResponse, isAdminRequest } from '../../_lib/shared.js';

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  const orderId = Number(params.id);
  if (!orderId) {
    return jsonResponse({ error: 'Invalid order id or status' }, 400);
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId),
    env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId),
  ]);
  return jsonResponse({ success: true }, 200);
}
