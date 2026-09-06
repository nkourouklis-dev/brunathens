import { jsonResponse, readJson, isAdminRequest } from '../_lib/shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  const payload = await readJson(request);
  const endpoint = String(payload.endpoint || '').trim();
  const keys = payload.keys;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return jsonResponse({ error: 'Invalid push subscription' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, keys_json) VALUES (?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json`,
  ).bind(endpoint, JSON.stringify(keys)).run();

  return jsonResponse({ success: true }, 201);
}
