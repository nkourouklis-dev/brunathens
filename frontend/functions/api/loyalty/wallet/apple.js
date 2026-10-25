import { handler, HttpError, requireMember, requireTenant, getSettings } from '../../../_lib/loyalty.js';
import { appleWalletConfigured, buildPkpass } from '../../../_lib/apple-pass.js';

// Downloads the member's .pkpass. Safari on iPhone opens it straight in Wallet.
export const onRequestGet = handler(async ({ request, env }) => {
  if (!appleWalletConfigured(env)) throw new HttpError(503, 'Apple Wallet not configured');
  const tenant = await requireTenant(env, request);
  const member = await requireMember(env, request, tenant);
  const settings = await getSettings(env, tenant);
  const pkpass = await buildPkpass(env, tenant, member, settings, new URL(request.url).origin);
  return new Response(pkpass, {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${tenant.slug}.pkpass"`,
      'Cache-Control': 'no-store',
    },
  });
});
