import { handler, requireMember, requireTenant, rotatingQrToken, formatCardNumber } from '../../_lib/loyalty.js';

// Short-lived QR for the in-app card. The app refreshes it before it expires.
export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const member = await requireMember(env, request, tenant);
  const { token, expiresAt } = await rotatingQrToken(env, member);
  return new Response(JSON.stringify({ token, expiresAt, cardNumber: formatCardNumber(member.card_number) }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
