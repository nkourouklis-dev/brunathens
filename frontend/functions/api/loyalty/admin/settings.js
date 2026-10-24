import { jsonResponse, readJson, handler, HttpError, requireStaff, getSettings, cleanText } from '../../../_lib/loyalty.js';

const RULES = {
  points_per_reward: (value) => Number.isInteger(value) && value >= 2 && value <= 50,
  max_points_per_scan: (value) => Number.isInteger(value) && value >= 1 && value <= 20,
  scan_cooldown_seconds: (value) => Number.isInteger(value) && value >= 0 && value <= 3600,
};

export const onRequestGet = handler(async ({ request, env }) => {
  await requireStaff(env, request, { ownerOnly: true });
  return jsonResponse({ settings: await getSettings(env) });
});

export const onRequestPut = handler(async ({ request, env }) => {
  await requireStaff(env, request, { ownerOnly: true });
  const payload = await readJson(request);
  const statements = [];
  for (const [key, valid] of Object.entries(RULES)) {
    if (!(key in payload)) continue;
    const value = Number(payload[key]);
    if (!valid(value)) throw new HttpError(400, 'Invalid setting', { key });
    statements.push(env.DB.prepare('INSERT INTO loyalty_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)));
  }
  if ('reward_name' in payload) {
    const name = cleanText(payload.reward_name, 40);
    if (!name) throw new HttpError(400, 'Invalid setting', { key: 'reward_name' });
    statements.push(env.DB.prepare('INSERT INTO loyalty_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('reward_name', name));
  }
  if (statements.length) await env.DB.batch(statements);
  return jsonResponse({ settings: await getSettings(env) });
});
