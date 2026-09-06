import { jsonResponse, readJson, normalizeOptions, isAdminRequest, sendOrderPushes } from '../_lib/shared.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = Number(url.searchParams.get('customerId'));

  if (customerId) {
    const result = await env.DB.prepare(
      `SELECT o.*, p.name AS product_name, c.name AS customer_name
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN customers c ON c.id = o.customer_id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
    ).bind(customerId).all();

    return jsonResponse({
      orders: result.results.map((order) => ({
        ...order,
        selected_options: normalizeOptions(order.selected_options),
      })),
    });
  }

  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  const result = await env.DB.prepare(
    `SELECT o.*, p.name AS product_name, c.name AS customer_name
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN customers c ON c.id = o.customer_id
     ORDER BY o.created_at DESC`,
  ).all();

  return jsonResponse({
    orders: result.results.map((order) => ({
      ...order,
      selected_options: normalizeOptions(order.selected_options),
    })),
  }, 200);
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;
  const payload = await readJson(request);
  const customerId = Number(payload.customerId);
  const productId = Number(payload.productId);

  if (!customerId || !productId) {
    return jsonResponse({ error: 'Missing customer or product' }, 400);
  }

  const result = await env.DB.prepare(
    'INSERT INTO orders (customer_id, product_id, selected_options, status) VALUES (?, ?, ?, ?)',
  ).bind(customerId, productId, JSON.stringify(payload.selectedOptions || {}), 'sent').run();

  const order = await env.DB.prepare(
    `SELECT o.*, p.name AS product_name, c.name AS customer_name
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ?`,
  ).bind(result.meta.last_row_id).first();

  waitUntil(sendOrderPushes(env, order));
  return jsonResponse({ order }, 200);
}
