import { handler, endSession } from '../../_lib/loyalty.js';

export const onRequestPost = handler(async ({ request, env }) => {
  const cookie = await endSession(env, request);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } });
});
