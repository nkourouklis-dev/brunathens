import { jsonResponse, readJson, parsePickupTime, parseOrderItems, loadOrders, isAdminRequest, sendOrderPushes } from '../_lib/shared.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = Number(url.searchParams.get('customerId'));

  if (customerId) {
    return jsonResponse({ orders: await loadOrders(env, { customerId, limit: 30 }) });
  }

  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  return jsonResponse({ orders: await loadOrders(env, { limit: 150 }) }, 200);
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;
  const payload = await readJson(request);
  const customerId = Number(payload.customerId);

  if (!customerId) {
    return jsonResponse({ error: 'Missing customer' }, 400);
  }

  const { pickupTime, error: pickupError } = parsePickupTime(payload.pickupTime);
  if (pickupError) {
    return jsonResponse({ error: pickupError }, 400);
  }

  const { items, error: itemsError } = await parseOrderItems(env, payload);
  if (itemsError) {
    return jsonResponse({ error: itemsError }, 400);
  }

  const customer = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first();
  if (!customer) {
    return jsonResponse({ error: 'Unknown customer' }, 400);
  }

  // orders.product_id / selected_options mirror the first item so older readers keep working.
  const [firstItem] = items;
  const results = await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO orders (customer_id, product_id, selected_options, pickup_time, status) VALUES (?, ?, ?, ?, ?)',
    ).bind(customerId, firstItem.productId, JSON.stringify(firstItem.selectedOptions), pickupTime, 'sent'),
    ...items.map((item) => env.DB.prepare(
      'INSERT INTO order_items (order_id, product_id, selected_options, quantity) VALUES ((SELECT MAX(id) FROM orders WHERE customer_id = ?), ?, ?, ?)',
    ).bind(customerId, item.productId, JSON.stringify(item.selectedOptions), item.quantity)),
  ]);

  const [order] = await loadOrders(env, { orderId: results[0].meta.last_row_id, limit: 1 });
  waitUntil(sendOrderPushes(env, order));
  return jsonResponse({ order }, 200);
}
