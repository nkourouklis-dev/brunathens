import { jsonResponse, readJson, handler, HttpError, signStaffToken, rateLimit, clientIp, timingSafeEqual } from '../../_lib/loyalty.js';

const TOKEN_DAYS = 7;

// The platform operator signs in with ADMIN_ACCESS_KEY to create and manage businesses.
export const onRequestPost = handler(async ({ request, env }) => {
  if (!env.ADMIN_ACCESS_KEY) throw new HttpError(503, 'Platform access is not configured');
  if (!await rateLimit(env, `platform:${clientIp(request)}`, 10, 900)) throw new HttpError(429, 'Too many attempts');
  const key = String((await readJson(request)).key || '').trim();
  if (!key || !timingSafeEqual(key, env.ADMIN_ACCESS_KEY)) throw new HttpError(401, 'Wrong access key');
  const token = await signStaffToken(env, { role: 'super', exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 });
  return jsonResponse({ token });
});
