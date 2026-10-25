import { jsonResponse, readJson, handler, HttpError, requireStaff, requireTenant, getSettings, cleanText } from '../../../_lib/loyalty.js';

const RULES = {
  points_per_reward: (value) => Number.isInteger(value) && value >= 2 && value <= 50,
  max_points_per_scan: (value) => Number.isInteger(value) && value >= 1 && value <= 20,
  scan_cooldown_seconds: (value) => Number.isInteger(value) && value >= 0 && value <= 3600,
};

const UPSERT = 'INSERT INTO loyalty_settings (tenant_id, key, value) VALUES (?, ?, ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value';

export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  await requireStaff(env, request, tenant, { ownerOnly: true });
  return jsonResponse({ settings: await getSettings(env, tenant) });
});

export const onRequestPut = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  await requireStaff(env, request, tenant, { ownerOnly: true });
  const payload = await readJson(request);
  const statements = [];
  for (const [key, valid] of Object.entries(RULES)) {
    if (!(key in payload)) continue;
    const value = Number(payload[key]);
    if (!valid(value)) throw new HttpError(400, 'Invalid setting', { key });
    statements.push(env.DB.prepare(UPSERT).bind(tenant.id, key, String(value)));
  }
  if ('reward_name' in payload) {
    const name = cleanText(payload.reward_name, 40);
    if (!name) throw new HttpError(400, 'Invalid setting', { key: 'reward_name' });
    statements.push(env.DB.prepare(UPSERT).bind(tenant.id, 'reward_name', name));
  }
  if (statements.length) await env.DB.batch(statements);
  return jsonResponse({ settings: await getSettings(env, tenant) });
});
