import {
  readJson, handler, HttpError, normalizeEmail, cleanText, createMember, startSession,
  getSettings, publicMember, rateLimit, clientIp,
} from '../../_lib/loyalty.js';

export const onRequestPost = handler(async ({ request, env }) => {
  const payload = await readJson(request);
  const name = cleanText(payload.name, 60);
  const email = normalizeEmail(payload.email);
  const favoriteDrink = cleanText(payload.favoriteDrink, 60);

  if (!name) throw new HttpError(400, 'Name required');
  if (!email) throw new HttpError(400, 'Invalid email');
  if (payload.acceptTerms !== true) throw new HttpError(400, 'Terms required');
  if (!await rateLimit(env, `signup:${clientIp(request)}`, 10, 3600)) throw new HttpError(429, 'Too many attempts');

  const member = await createMember(env, { name, email, favoriteDrink, marketingOptIn: payload.marketingOptIn === true });
  const cookie = await startSession(env, request, member.id);
  const settings = await getSettings(env);

  return new Response(JSON.stringify({ member: publicMember(member, settings) }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  });
});
