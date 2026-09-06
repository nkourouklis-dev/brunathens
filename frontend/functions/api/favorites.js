import { jsonResponse, readJson, normalizeOptions } from '../_lib/shared.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const customerId = Number(url.searchParams.get('customerId'));

  if (!customerId) {
    return jsonResponse({ favorites: [] }, 200);
  }

  const favorites = await env.DB.prepare(
    `SELECT f.id, f.customer_id, f.product_id, f.label, f.selected_options, p.name AS product_name
     FROM favorites f
     JOIN products p ON p.id = f.product_id
     WHERE f.customer_id = ?
     ORDER BY f.created_at DESC`,
  ).bind(customerId).all();

  return jsonResponse({
    favorites: favorites.results.map((favorite) => ({
      ...favorite,
      selected_options: normalizeOptions(favorite.selected_options),
    })),
  }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await readJson(request);
  const customerId = Number(payload.customerId);
  const productId = Number(payload.productId);
  const label = String(payload.label || '').trim();

  if (!customerId || !productId || !label) {
    return jsonResponse({ error: 'Missing customer, product or label' }, 400);
  }

  await env.DB.prepare(
    'INSERT INTO favorites (customer_id, product_id, label, selected_options) VALUES (?, ?, ?, ?)',
  ).bind(customerId, productId, label, JSON.stringify(payload.selectedOptions || {})).run();

  return jsonResponse({ success: true }, 200);
}
