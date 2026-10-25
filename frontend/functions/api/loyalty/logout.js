import { handler, endSession, requireTenant } from '../../_lib/loyalty.js';

export const onRequestPost = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const cookie = await endSession(env, request, tenant);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } });
});
