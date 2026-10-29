// Google Wallet: κάρτα επιβράβευσης ανά επιχείρηση (loyalty class) + ενημέρωση πόντων σε κάθε αλλαγή.
//
// Secrets (Cloudflare Pages → Settings → Variables and secrets):
//   GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_KEY

import { formatCardNumber, toBase64Url } from './core.js';
import { rewardProgress, staticQrToken } from './members.js';
import { pemToDer } from './apple-pass.js';

const encoder = new TextEncoder();
const API = 'https://walletobjects.googleapis.com/walletobjects/v1';

export function googleWalletConfigured(env) {
  return Boolean(env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_EMAIL && env.GOOGLE_WALLET_SA_KEY);
}

const classId = (env, business) => `${env.GOOGLE_WALLET_ISSUER_ID}.biz_${business.id}`;
const objectId = (env, member) => `${env.GOOGLE_WALLET_ISSUER_ID}.member_${member.public_id}`;

function loyaltyClass(env, business, origin) {
  return {
    id: classId(env, business),
    issuerName: business.name,
    programName: `${business.name} · Κάρτα`,
    programLogo: {
      sourceUri: { uri: `${origin}/api/b/${business.slug}/icon.png?size=512&v=${business.logo_version}` },
      contentDescription: { defaultValue: { language: 'el', value: business.name } },
    },
    hexBackgroundColor: business.color,
    reviewStatus: 'UNDER_REVIEW',
    countryCode: 'GR',
  };
}

function pointsFields(business, member, rewards) {
  const progress = rewardProgress(member.points, rewards);
  const unit = member.points === 1 ? business.unit_one : business.unit_many;
  const bodyText = progress.availableCount > 0
    ? `Έτοιμο: ${progress.rewards.filter((reward) => reward.affordable).map((reward) => reward.name).slice(0, 3).join(', ')}. Δείξε το QR στο ταμείο.`
    : progress.next ? `${progress.next.name}: σε ${progress.next.remaining} ${business.unit_many}` : 'Δείξε το QR στο ταμείο σε κάθε επίσκεψη.';
  return {
    loyaltyPoints: { label: unit, balance: { int: member.points } },
    textModulesData: [{
      id: 'next',
      header: progress.availableCount > 0 ? 'Σε περιμένει δώρο' : 'Επόμενο δώρο',
      body: bodyText,
    }],
  };
}

async function loyaltyObject(env, business, member, rewards, origin) {
  return {
    id: objectId(env, member),
    classId: classId(env, business),
    state: 'ACTIVE',
    accountId: formatCardNumber(member.card_number),
    accountName: member.name,
    barcode: { type: 'QR_CODE', value: await staticQrToken(env, member), alternateText: formatCardNumber(member.card_number) },
    linksModuleData: { uris: [{ uri: `${origin}/b/${business.slug}`, description: 'Η κάρτα σου online', id: 'app' }] },
    ...pointsFields(business, member, rewards),
  };
}

async function signRs256(env, claims) {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.GOOGLE_WALLET_SA_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${body}`)));
  return `${header}.${body}.${toBase64Url(signature)}`;
}

// Το JWT κουβαλά την κλάση και το αντικείμενο: η Google τα δημιουργεί όταν ο πελάτης πατήσει «Αποθήκευση».
export async function googleSaveUrl(env, business, member, rewards, origin) {
  const jwt = await signRs256(env, {
    iss: env.GOOGLE_WALLET_SA_EMAIL,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [origin],
    payload: {
      loyaltyClasses: [loyaltyClass(env, business, origin)],
      loyaltyObjects: [await loyaltyObject(env, business, member, rewards, origin)],
    },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let tokenCache = null;

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token;
  const assertion = await signRs256(env, {
    iss: env.GOOGLE_WALLET_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  if (!response.ok) throw new Error(`Google token ${response.status}`);
  const data = await response.json();
  tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return tokenCache.token;
}

async function patch(env, path, body) {
  const response = await fetch(`${API}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 404 σημαίνει ότι ο πελάτης (ή η επιχείρηση) δεν έχει ακόμα αποθηκευμένη κάρτα.
  if (!response.ok && response.status !== 404) {
    console.error(JSON.stringify({ event: 'google_wallet_update_failed', path, status: response.status, body: (await response.text()).slice(0, 300) }));
  }
}

// Καλείται μετά από κάθε αλλαγή πόντων.
export async function pushGoogleWalletUpdate(env, business, member, rewards, { deleted = false } = {}) {
  if (!googleWalletConfigured(env)) return;
  try {
    const body = deleted ? { state: 'INACTIVE' } : { accountName: member.name, ...pointsFields(business, member, rewards) };
    await patch(env, `loyaltyObject/${encodeURIComponent(objectId(env, member))}`, body);
  } catch (error) {
    console.error(JSON.stringify({ event: 'google_wallet_update_failed', message: error.message }));
  }
}

// Καλείται όταν αλλάζει το branding (όνομα/χρώμα/λογότυπο) ώστε να ενημερωθούν οι κάρτες που υπάρχουν ήδη.
export async function pushGoogleClassUpdate(env, business, origin) {
  if (!googleWalletConfigured(env)) return;
  try {
    const { id: _id, reviewStatus: _status, ...fields } = loyaltyClass(env, business, origin);
    await patch(env, `loyaltyClass/${encodeURIComponent(classId(env, business))}`, fields);
  } catch (error) {
    console.error(JSON.stringify({ event: 'google_wallet_class_failed', message: error.message }));
  }
}
