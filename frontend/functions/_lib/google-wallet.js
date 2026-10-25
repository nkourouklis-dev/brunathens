// Google Wallet loyalty card: "Save to Google Wallet" link + live points updates.
//
// Secrets (Cloudflare Pages → Settings → Variables and secrets):
//   GOOGLE_WALLET_ISSUER_ID   numeric Issuer ID from pay.google.com/business/console
//   GOOGLE_WALLET_SA_EMAIL    service account email (…@….iam.gserviceaccount.com)
//   GOOGLE_WALLET_SA_KEY      the service account's private_key (PEM) from its JSON key file

import { formatCardNumber, rewardsAvailable, staticQrToken, toBase64Url, displayProgress } from './loyalty.js';
import { pemToDer } from './apple-pass.js';

const encoder = new TextEncoder();
const API = 'https://walletobjects.googleapis.com/walletobjects/v1';

export function googleWalletConfigured(env) {
  return Boolean(env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_EMAIL && env.GOOGLE_WALLET_SA_KEY);
}

const classId = (env, tenant) => `${env.GOOGLE_WALLET_ISSUER_ID}.kerasma_${tenant.slug.replace(/-/g, '_')}`;
const objectId = (env, member) => `${env.GOOGLE_WALLET_ISSUER_ID}.member_${member.public_id}`;

function loyaltyClass(env, tenant, origin) {
  return {
    id: classId(env, tenant),
    issuerName: tenant.name,
    programName: `${tenant.name} Κάρτα`,
    programLogo: { sourceUri: { uri: `${origin}/api/loyalty/logo?t=${tenant.slug}` }, contentDescription: { defaultValue: { language: 'el', value: tenant.name } } },
    hexBackgroundColor: tenant.color,
    reviewStatus: 'UNDER_REVIEW',
    countryCode: 'GR',
  };
}

function pointsFields(member, settings) {
  const available = rewardsAvailable(member, settings);
  const progress = member.points % settings.points_per_reward;
  const left = settings.points_per_reward - progress;
  return {
    loyaltyPoints: { label: 'Πόντοι', balance: { string: `${displayProgress(member, settings)}/${settings.points_per_reward}` } },
    secondaryLoyaltyPoints: { label: 'Δώρα', balance: { int: available } },
    textModulesData: [{
      id: 'next',
      header: available > 0 ? 'Σε περιμένει' : 'Επόμενο δώρο',
      body: available > 0 ? `${available} × ${settings.reward_name}. Δείξε το QR στο ταμείο.` : `Σε ${left} ${left === 1 ? 'πόντο' : 'πόντους'}: ${settings.reward_name}`,
    }],
  };
}

async function loyaltyObject(env, tenant, member, settings, origin) {
  return {
    id: objectId(env, member),
    classId: classId(env, tenant),
    state: 'ACTIVE',
    accountId: formatCardNumber(member.card_number),
    accountName: member.name,
    barcode: { type: 'QR_CODE', value: await staticQrToken(env, member), alternateText: formatCardNumber(member.card_number) },
    linksModuleData: { uris: [{ uri: `${origin}/${tenant.slug}`, description: 'Η κάρτα σου online', id: 'app' }] },
    ...pointsFields(member, settings),
  };
}

async function signRs256(env, claims) {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.GOOGLE_WALLET_SA_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${body}`)));
  return `${header}.${body}.${toBase64Url(signature)}`;
}

// The JWT carries the class and the object, so Google creates both when the customer taps "Save".
export async function googleSaveUrl(env, tenant, member, settings, origin) {
  const jwt = await signRs256(env, {
    iss: env.GOOGLE_WALLET_SA_EMAIL,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [origin],
    payload: {
      loyaltyClasses: [loyaltyClass(env, tenant, origin)],
      loyaltyObjects: [await loyaltyObject(env, tenant, member, settings, origin)],
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

// Called after every points change. A 404 just means the customer never saved the card.
export async function pushGoogleWalletUpdate(env, member, settings, { deleted = false } = {}) {
  if (!googleWalletConfigured(env)) return;
  try {
    const body = deleted ? { state: 'INACTIVE' } : { accountName: member.name, ...pointsFields(member, settings) };
    const response = await fetch(`${API}/loyaltyObject/${encodeURIComponent(objectId(env, member))}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok && response.status !== 404) {
      console.error(JSON.stringify({ event: 'google_wallet_update_failed', status: response.status, body: (await response.text()).slice(0, 300) }));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'google_wallet_update_failed', message: error.message }));
  }
}
