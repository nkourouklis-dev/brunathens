import { jsonResponse, handler, HttpError, requireMember, requireTenant, getSettings } from '../../../_lib/loyalty.js';
import { googleWalletConfigured, googleSaveUrl } from '../../../_lib/google-wallet.js';

export const onRequestGet = handler(async ({ request, env }) => {
  if (!googleWalletConfigured(env)) throw new HttpError(503, 'Google Wallet not configured');
  const tenant = await requireTenant(env, request);
  const member = await requireMember(env, request, tenant);
  const settings = await getSettings(env, tenant);
  return jsonResponse({ url: await googleSaveUrl(env, tenant, member, settings, new URL(request.url).origin) });
});
