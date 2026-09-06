import { jsonResponse, isAdminRequest } from '../../_lib/shared.js';

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!await isAdminRequest(request, env)) {
    return jsonResponse({ error: 'Admin authorization required' }, 401);
  }

  const orderId = Number(params.id);
  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
  return jsonResponse({ success: true }, 200);
}
