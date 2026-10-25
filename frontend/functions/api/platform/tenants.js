import {
  jsonResponse, readJson, handler, HttpError, requireSuper, cleanText, isValidSlug, ownerKeyHash, randomString,
} from '../../_lib/loyalty.js';

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
    createdAt: tenant.created_at,
  };
}

export const onRequestGet = handler(async ({ request, env }) => {
  await requireSuper(env, request);
  const rows = await env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM loyalty_members m WHERE m.tenant_id = t.id AND m.deleted_at IS NULL) AS members
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

  const ownerKey = [0, 1, 2, 3].map(() => randomString(4)).join('-');
  try {
    const tenant = await env.DB.prepare(
      `INSERT INTO tenants (slug, name, icon, owner_key_hash) VALUES (?, ?, ?, ?) RETURNING *`,
    ).bind(slug, name, icon, await ownerKeyHash(env, ownerKey.replace(/-/g, ''))).first();
    return jsonResponse({ tenant: row(tenant), ownerKey }, 201);
  } catch (error) {
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'Slug in use');
    throw error;
  }
});
