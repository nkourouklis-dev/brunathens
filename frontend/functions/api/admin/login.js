import { jsonResponse, readJson, signAdminToken } from '../../_lib/shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const payload = await readJson(request);

  if (!env.ADMIN_ACCESS_KEY) {
    return jsonResponse({ error: 'Admin access is not configured' }, 503);
  }
  if (String(payload.key || '').trim() !== env.ADMIN_ACCESS_KEY) {
    return jsonResponse({ error: 'Λάθος κωδικός διαχείρισης' }, 401);
  }

  const token = await signAdminToken(
    { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    env.ADMIN_ACCESS_KEY,
  );
  return jsonResponse({ token }, 200);
}
