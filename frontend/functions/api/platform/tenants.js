import {
  jsonResponse, readJson, handler, HttpError, requireSuper, cleanText, isValidSlug, ownerKeyHash, randomString,
} from '../../_lib/loyalty.js';

const MAX_LOGO_CHARS = 400_000;

const RULES = {
  points_per_reward: (value) => Number.isInteger(value) && value >= 2 && value <= 50,
  max_points_per_scan: (value) => Number.isInteger(value) && value >= 1 && value <= 20,
  scan_cooldown_seconds: (value) => Number.isInteger(value) && value >= 0 && value <= 3600,
};

const SINCE_30D = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')";

const RESERVED = new Set(['api', 'admin', 'platform', 'assets', 'privacy', 'login', 'static', 'www', 'kerdiseto', 'wallet']);

function row(tenant) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    icon: tenant.icon,
    color: tenant.color,
    active: Boolean(tenant.active),
    members: tenant.members ?? 0,
    newMembers30d: tenant.new_members_30d ?? 0,
    pointsOutstanding: tenant.points_outstanding ?? 0,
    pointsGiven30d: tenant.points_given_30d ?? 0,
    rewards30d: tenant.rewards_30d ?? 0,
    rewardsTotal: tenant.rewards_total ?? 0,
    activeMembers30d: tenant.active_members_30d ?? 0,
    lastActivityAt: tenant.last_activity_at ?? null,
    createdAt: tenant.created_at,
  };
}

export const onRequestGet = handler(async ({ request, env }) => {
  await requireSuper(env, request);
  const rows = await env.DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM loyalty_members m WHERE m.tenant_id = t.id AND m.deleted_at IS NULL) AS members,
       (SELECT COUNT(*) FROM loyalty_members m WHERE m.tenant_id = t.id AND m.deleted_at IS NULL AND m.created_at >= ${SINCE_30D}) AS new_members_30d,
       (SELECT COALESCE(SUM(m.points), 0) FROM loyalty_members m WHERE m.tenant_id = t.id AND m.deleted_at IS NULL) AS points_outstanding,
       (SELECT COALESCE(SUM(x.delta), 0) FROM loyalty_transactions x WHERE x.tenant_id = t.id AND x.kind = 'earn' AND x.created_at >= ${SINCE_30D}) AS points_given_30d,
       (SELECT COUNT(*) FROM loyalty_transactions x WHERE x.tenant_id = t.id AND x.kind = 'redeem' AND x.created_at >= ${SINCE_30D}) AS rewards_30d,
       (SELECT COUNT(*) FROM loyalty_transactions x WHERE x.tenant_id = t.id AND x.kind = 'redeem') AS rewards_total,
       (SELECT COUNT(DISTINCT x.member_id) FROM loyalty_transactions x WHERE x.tenant_id = t.id AND x.kind = 'earn' AND x.created_at >= ${SINCE_30D}) AS active_members_30d,
       (SELECT MAX(x.created_at) FROM loyalty_transactions x WHERE x.tenant_id = t.id) AS last_activity_at
     FROM tenants t ORDER BY t.id`,
  ).all();
  return jsonResponse({ tenants: rows.results.map(row) });
});

// Creates a business and returns its owner key once. Only a hash is stored.
export const onRequestPost = handler(async ({ request, env }) => {
  await requireSuper(env, request);
  const payload = await readJson(request);
  const slug = String(payload.slug || '').trim().toLowerCase();
  const name = cleanText(payload.name, 40);
  const icon = String(payload.icon || 'star');
  if (!isValidSlug(slug) || RESERVED.has(slug)) throw new HttpError(400, 'Invalid slug');
  if (!name) throw new HttpError(400, 'Name required');
  if (!/^[a-z][a-z-]{1,24}$/.test(icon)) throw new HttpError(400, 'Invalid icon');

  const color = String(payload.color || '#2b2b2b');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new HttpError(400, 'Invalid colour');
  const logo = String(payload.logo || '');
  if (logo && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > MAX_LOGO_CHARS)) throw new HttpError(400, 'Logo must be a PNG under 300 KB');

  // Reward rules; anything left out keeps the platform default.
  const settings = [];
  for (const [key, valid] of Object.entries(RULES)) {
    if (payload[key] === undefined || payload[key] === '') continue;
    const value = Number(payload[key]);
    if (!valid(value)) throw new HttpError(400, 'Invalid setting', { key });
    settings.push([key, String(value)]);
  }
  if (payload.reward_name) {
    const rewardName = cleanText(payload.reward_name, 40);
    if (!rewardName) throw new HttpError(400, 'Invalid setting', { key: 'reward_name' });
    settings.push(['reward_name', rewardName]);
  }

  const ownerKey = [0, 1, 2, 3].map(() => randomString(4)).join('-');
  try {
    const tenant = await env.DB.prepare(
      `INSERT INTO tenants (slug, name, tagline, icon, color, logo, legal_name, legal_address, legal_vat, contact_email, owner_key_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).bind(
      slug, name, cleanText(payload.tagline, 80) || null, icon, color, logo || null,
      cleanText(payload.legalName, 120) || null, cleanText(payload.legalAddress, 160) || null,
      cleanText(payload.legalVat, 20) || null, cleanText(payload.contactEmail, 120) || null,
      await ownerKeyHash(env, ownerKey.replace(/-/g, '')),
    ).first();
    if (settings.length) {
      await env.DB.batch(settings.map(([key, value]) => env.DB.prepare('INSERT INTO loyalty_settings (tenant_id, key, value) VALUES (?, ?, ?)').bind(tenant.id, key, value)));
    }
    return jsonResponse({ tenant: row(tenant), ownerKey }, 201);
  } catch (error) {
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'Slug in use');
    throw error;
  }
});
