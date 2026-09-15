import { jsonResponse, readJson } from '../_lib/shared.js';

// A customer's device subscribes to "your order is ready" notifications.
// The device id must match the customer, so nobody can subscribe to someone else's orders.
export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await readJson(request);
  const customerId = Number(payload.customerId);
  const deviceId = String(payload.deviceId || '').trim();
  const endpoint = String(payload.subscription?.endpoint || '').trim();
  const keys = payload.subscription?.keys;

  if (!customerId || !deviceId || !endpoint || !keys?.p256dh || !keys?.auth) {
    return jsonResponse({ error: 'Invalid push subscription' }, 400);
  }

  const customer = await env.DB.prepare('SELECT id FROM customers WHERE id = ? AND device_id = ?').bind(customerId, deviceId).first();
  if (!customer) {
    return jsonResponse({ error: 'Unknown customer' }, 403);
  }

  await env.DB.prepare(
    `INSERT INTO customer_push_subscriptions (customer_id, endpoint, keys_json) VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET customer_id = excluded.customer_id, keys_json = excluded.keys_json`,
  ).bind(customerId, endpoint, JSON.stringify(keys)).run();

  return jsonResponse({ success: true }, 201);
}
