import {
  jsonResponse, readJson, handler, HttpError, ownerKeyHash, signStaffToken, rateLimit, clientIp, requireTenant, timingSafeEqual,
} from '../../../_lib/loyalty.js';

const TOKEN_DAYS = 30;

// The owner of a business signs in with the access key the platform gave them (shown once, stored only as a hash).
export const onRequestPost = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  if (!await rateLimit(env, `owner:${tenant.slug}:${clientIp(request)}`, 10, 900)) throw new HttpError(429, 'Too many attempts');
  // Accept the bare key or a pasted message that contains it (xxxx-xxxx-xxxx-xxxx).
  const raw = String((await readJson(request)).key || '').toLowerCase();
  const key = (raw.match(/[a-z0-9]{4}(?:-[a-z0-9]{4}){3}/)?.[0] ?? raw).replace(/[^a-z0-9]/g, '');
  if (!key || !tenant.owner_key_hash || !timingSafeEqual(await ownerKeyHash(env, key), tenant.owner_key_hash)) {
    throw new HttpError(401, 'Wrong access key');
  }
  const token = await signStaffToken(env, {
    role: 'owner',
    tenantId: tenant.id,
    exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400,
  });
  return jsonResponse({ token, role: 'owner' });
});
