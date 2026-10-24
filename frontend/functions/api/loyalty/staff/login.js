import { jsonResponse, readJson, handler, HttpError, pinLookup, signStaffToken, rateLimit, clientIp } from '../../../_lib/loyalty.js';

const TOKEN_DAYS = 30;

// Barista sign-in with a personal 6-digit PIN (the owner keeps using /api/admin/login).
export const onRequestPost = handler(async ({ request, env }) => {
  if (!env.ADMIN_ACCESS_KEY) throw new HttpError(503, 'Admin access is not configured');
  const pin = String((await readJson(request)).pin || '').trim();
  if (!await rateLimit(env, `pin:${clientIp(request)}`, 10, 900)) throw new HttpError(429, 'Too many attempts');
  if (!/^\d{6}$/.test(pin)) throw new HttpError(401, 'Wrong PIN');

  const staff = await env.DB.prepare('SELECT id, name FROM loyalty_staff WHERE pin_lookup = ? AND active = 1')
    .bind(await pinLookup(env, pin)).first();
  if (!staff) throw new HttpError(401, 'Wrong PIN');

  const token = await signStaffToken(env, {
    role: 'barista',
    staffId: staff.id,
    exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400,
  });
  return jsonResponse({ token, name: staff.name, role: 'barista' });
});
