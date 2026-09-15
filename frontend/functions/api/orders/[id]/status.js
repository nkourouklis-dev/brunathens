import { jsonResponse, readJson, isAdminRequest, loadOrders, sendCustomerReadyPush } from '../../../_lib/shared.js';

// sent → received → ready → completed (cancelled is kept for manual use)
const ALLOWED_STATUSES = new Set(['sent', 'received', 'ready', 'completed', 'cancelled']);

export async function onRequestPatch(context) {
  const { request, env, params, waitUntil } = context;
  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  const orderId = Number(params.id);
  const payload = await readJson(request);
  const status = String(payload.status || '').trim();

  if (!orderId || !ALLOWED_STATUSES.has(status)) {
    return jsonResponse({ error: 'Invalid order id or status' }, 400);
  }

  const current = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first();
  if (!current) {
    return jsonResponse({ error: 'Order not found' }, 404);
  }

  await env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, orderId).run();
  const [order] = await loadOrders(env, { orderId, limit: 1 });

  if (status === 'ready' && current.status !== 'ready') {
    waitUntil(sendCustomerReadyPush(env, order));
  }

  return jsonResponse({ order }, 200);
}
