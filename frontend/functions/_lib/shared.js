import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto';

const VAPID_PUBLIC_KEY = 'BMtcf-LV0JtZz6INjs897aGIRCqY6jbbMBSLklyipLp59SzXAR7J9kwOt87lMWTusoWFFbpAduU36WmJ-gLjUEE';

// JSON response χωρίς CORS headers — same-origin πλέον (Pages + Functions στο ίδιο domain)
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function normalizeOptions(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getApplicationServerKeys(env) {
  const publicBytes = base64UrlToBytes(VAPID_PUBLIC_KEY);
  const privateBytes = base64UrlToBytes(env.VAPID_PRIVATE_KEY);
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicBytes.slice(1, 33)),
      y: toBase64Url(publicBytes.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    [],
  );
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicBytes.slice(1, 33)),
      y: toBase64Url(publicBytes.slice(33, 65)),
      d: toBase64Url(privateBytes),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );

  return new ApplicationServerKeys(publicKey, privateKey);
}

export async function signAdminToken(payload, secret) {
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function isAdminRequest(request, env) {
  if (!env.ADMIN_ACCESS_KEY) return false;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;
    const expectedToken = await signAdminToken(payload, env.ADMIN_ACCESS_KEY);
    return expectedToken === token;
  } catch {
    return false;
  }
}

export async function sendOrderPushes(env, order) {
  if (!env.VAPID_PRIVATE_KEY) return;

  const subscriptions = await env.DB.prepare('SELECT id, endpoint, keys_json FROM push_subscriptions').all();
  if (!subscriptions.results.length) return;

  const applicationServerKeys = await getApplicationServerKeys(env);
  const payload = JSON.stringify({
    title: 'BRUN',
    body: `Νέα παραγγελία: ${order.customer_name} - ${order.product_name}`,
    url: '/?admin=true',
  });

  await Promise.all(subscriptions.results.map(async (subscription) => {
    try {
      const target = {
        endpoint: subscription.endpoint,
        keys: JSON.parse(subscription.keys_json),
      };
      const request = await generatePushHTTPRequest({
        applicationServerKeys,
        payload,
        target,
        adminContact: 'mailto:owner@brunathens.pages.dev',
        ttl: 300,
        urgency: 'high',
      });
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      });

      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'push_delivery_failed', subscriptionId: subscription.id, message: error.message }));
    }
  }));
}
