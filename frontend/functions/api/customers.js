import { jsonResponse, readJson } from '../_lib/shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await readJson(request);
  const name = String(payload.name || '').trim();
  const deviceId = String(payload.deviceId || '').trim();

  if (!name || !deviceId) {
    return jsonResponse({ error: 'Name and device id are required' }, 400);
  }

  let customer = await env.DB.prepare('SELECT * FROM customers WHERE device_id = ? LIMIT 1').bind(deviceId).first();
  if (!customer) {
    const result = await env.DB.prepare(
      'INSERT INTO customers (name, device_id) VALUES (?, ?)',
    ).bind(name, deviceId).run();
    customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(result.meta.last_row_id).first();
  } else {
    await env.DB.prepare('UPDATE customers SET name = ? WHERE id = ?').bind(name, customer.id).run();
    customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer.id).first();
  }

  return jsonResponse({ customer }, 200);
}
