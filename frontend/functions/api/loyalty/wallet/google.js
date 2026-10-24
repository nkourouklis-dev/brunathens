import { jsonResponse, handler, HttpError, requireMember, getSettings } from '../../../_lib/loyalty.js';
import { googleWalletConfigured, googleSaveUrl } from '../../../_lib/google-wallet.js';

export const onRequestGet = handler(async ({ request, env }) => {
  if (!googleWalletConfigured(env)) throw new HttpError(503, 'Google Wallet not configured');
  const member = await requireMember(env, request);
  const settings = await getSettings(env);
  return jsonResponse({ url: await googleSaveUrl(env, member, settings, new URL(request.url).origin) });
});
