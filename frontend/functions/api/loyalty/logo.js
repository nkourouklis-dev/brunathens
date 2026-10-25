import { handler, requireTenant, fromBase64Url } from '../../_lib/loyalty.js';

// Public image of a business's logo (used by Google Wallet and as the app icon). Stored as a PNG data URL.
export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(tenant.logo || '');
  if (match) {
    return new Response(fromBase64Url(match[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }
  if (tenant.logo?.startsWith('/')) return Response.redirect(new URL(tenant.logo, request.url).toString(), 302);
  return new Response(null, { status: 404 });
});
