import { handler, requireTenant } from '../../_lib/loyalty.js';

// Web app manifest for one business, so "Add to home screen" installs that business's card (or its counter with ?admin=1).
export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const admin = new URL(request.url).searchParams.has('admin');
  const start = `/${tenant.slug}${admin ? '/admin' : ''}`;
  const icon = `/api/loyalty/logo?t=${tenant.slug}`;
  const manifest = {
    name: admin ? `${tenant.name} · Ταμείο` : tenant.name,
    short_name: admin ? `${tenant.name} Ταμείο`.slice(0, 20) : tenant.name.slice(0, 14),
    description: `Κάρτα επιβράβευσης ${tenant.name}`,
    start_url: start,
    scope: start,
    id: start,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'el',
    icons: tenant.logo
      ? [
        { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
      ]
      : [],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' },
  });
});
