// /api/b/<slug>/... — δημόσια στοιχεία επιχείρησης, και διανομή στα routes πελάτη / ομάδας.
import { HttpError, json } from '../core.js';
import { listRewards, loadLogo, publicBusiness, requireActiveBusiness, solidIconPng } from '../business.js';
import { handleCustomer } from './customer.js';
import { handleTeam } from './team.js';

function imageResponse(bytes, type, version) {
  return new Response(bytes, {
    headers: {
      'Content-Type': type,
      // Το ?v=<logoVersion> αλλάζει με κάθε νέο λογότυπο, οπότε επιτρέπεται μακρύ cache.
      'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function manifest(business, { team }) {
  const base = `/b/${business.slug}`;
  const version = business.logo_version;
  return new Response(JSON.stringify({
    name: team ? `${business.name} · Ταμείο` : business.name,
    short_name: business.name.slice(0, 12),
    description: team ? `Ταμείο και διαχείριση για ${business.name}` : `Κάρτα επιβράβευσης ${business.name}`,
    start_url: team ? `${base}/team` : base,
    scope: team ? `${base}/team` : base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: business.color,
    theme_color: business.color,
    lang: 'el',
    icons: [
      { src: `/api/b/${business.slug}/icon.png?size=192&v=${version}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/api/b/${business.slug}/icon.png?size=512&v=${version}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' } });
}

export async function handleBusiness(ctx, segments) {
  const [slug, ...rest] = segments;
  if (!slug) return null;
  const business = await requireActiveBusiness(ctx.env, slug);
  const [first, ...more] = rest;

  if (!first && ctx.method === 'GET') {
    return json({ business: publicBusiness(business, await listRewards(ctx.env, business.id), ctx.env) });
  }

  if (ctx.method === 'GET' && first === 'logo') {
    const logo = await loadLogo(ctx.env, business.id);
    if (!logo) throw new HttpError(404, 'No logo');
    return imageResponse(logo.bytes, logo.type, ctx.url.searchParams.has('v'));
  }

  // Εικονίδιο PNG για PWA/Wallet: το λογότυπο αν είναι PNG, αλλιώς απλό εικονίδιο με το χρώμα της επιχείρησης.
  if (ctx.method === 'GET' && first === 'icon.png') {
    const logo = await loadLogo(ctx.env, business.id);
    if (logo?.type === 'image/png') return imageResponse(logo.bytes, 'image/png', ctx.url.searchParams.has('v'));
    const size = Math.min(512, Math.max(64, Number(ctx.url.searchParams.get('size')) || 192));
    return imageResponse(await solidIconPng(business.color, size), 'image/png', ctx.url.searchParams.has('v'));
  }

  if (ctx.method === 'GET' && first === 'manifest') return manifest(business, { team: false });
  if (ctx.method === 'GET' && first === 'team-manifest') return manifest(business, { team: true });

  if (first === 'team') return handleTeam(ctx, business, more);
  return handleCustomer(ctx, business, rest);
}
