// Ο κεντρικός router του API. Όλα τα endpoints περνούν από εδώ (/api/...).
//
//   /api/b/<slug>/...          επιχείρηση: δημόσια στοιχεία, πελάτης (κάρτα), ομάδα (ταμείο/διαχείριση) — routes/business.js
//   /api/invite/<token>/...    πρόσκληση ομάδας                                                       — routes/invite.js
//   /api/platform/...          διαχειριστής πλατφόρμας                                                — routes/platform.js
//   /api/signup                δημιουργία επιχείρησης (αν SELF_SIGNUP=1)                              — routes/platform.js
//   /api/wallet/apple-ws/...   Apple Wallet web service                                               — routes/apple-ws.js
import { HttpError, errorResponse, json } from '../_lib/core.js';
import { handleBusiness } from '../_lib/routes/business.js';
import { handleInvite } from '../_lib/routes/invite.js';
import { handlePlatform, handleSignup } from '../_lib/routes/platform.js';
import { handleAppleWs } from '../_lib/routes/apple-ws.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Προστασία CSRF: τα cookies είναι SameSite=Lax και επιπλέον απορρίπτουμε αιτήματα αλλαγής από άλλο site.
function assertSameOrigin(request) {
  if (SAFE_METHODS.has(request.method)) return;
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request blocked');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-site request blocked');
}

export async function onRequest({ request, env, params, waitUntil }) {
  try {
    const segments = (Array.isArray(params.path) ? params.path : String(params.path || '').split('/')).filter(Boolean);
    const [head, ...rest] = segments;
    const ctx = { request, env, waitUntil, url: new URL(request.url), method: request.method };

    // Το Apple Wallet δεν στέλνει Origin/cookies: ταυτοποιείται με δικό του token.
    if (head === 'wallet' && rest[0] === 'apple-ws') return await handleAppleWs(ctx, rest.slice(1));

    assertSameOrigin(request);

    let response = null;
    if (head === 'b') response = await handleBusiness(ctx, rest);
    else if (head === 'invite') response = await handleInvite(ctx, rest);
    else if (head === 'platform') response = await handlePlatform(ctx, rest);
    else if (head === 'signup') response = await handleSignup(ctx, rest);
    else if (head === 'health') response = json({ ok: true });

    return response || json({ error: 'Not found' }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
