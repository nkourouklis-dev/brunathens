import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto';

const VAPID_PUBLIC_KEY = 'BA0xW0dY_mEr4Townl-ZKrqTSy1bndukaNQLu4XbYa6S-x2dDUUdPqGAr4SFu5b58t8B5-MhGvRI3v2tkQ-KtRY';

// Origins που επιτρέπονται: production + local dev
const allowedOrigins = [
  'https://brunathens.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// CORS helper — εφαρμόζεται σε ΟΛΑ τα responses (success + error)
function corsHeaders(request = null) {
  const origin = request ? request.headers.get('Origin') : '';
  const allowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeOptions(value) {
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

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signAdminToken(payload, secret) {
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function isAdminRequest(request, env) {
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

async function sendOrderPushes(env, order) {
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

async function getProducts(env) {
  const products = await env.DB.prepare(
    'SELECT id, name, category, active, image FROM products WHERE active = 1 ORDER BY id',
  ).all();

  const productIds = products.results.map((product) => product.id);
  let options = { results: [] };

  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    const stmt = env.DB.prepare(
      `SELECT id, product_id, option_type, option_value, price_delta
       FROM product_options
       WHERE product_id IN (${placeholders})
       ORDER BY product_id, id`,
    );
    options = await stmt.bind(...productIds).all();
  }

  return products.results.map((product) => ({
    ...product,
    options: options.results.filter((option) => option.product_id === product.id),
  }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preflight: απάντησε αμέσως με 204 και τα CORS headers, χωρίς να τρέξει η λογική των routes
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    const segments = path.split('/');

    if (segments[0] === 'api' && segments[1] === 'admin' && segments[2] === 'login' && request.method === 'POST') {
      const payload = await readJson(request);
      if (!env.ADMIN_ACCESS_KEY) return jsonResponse({ error: 'Admin access is not configured' }, 503, request);
      if (String(payload.key || '').trim() !== env.ADMIN_ACCESS_KEY) return jsonResponse({ error: 'Λάθος κωδικός διαχείρισης' }, 401, request);
      const token = await signAdminToken({ exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }, env.ADMIN_ACCESS_KEY);
      return jsonResponse({ token }, 200, request);
    }

    if (segments[0] === 'api' && segments[1] === 'products') {
      if (request.method === 'GET') {
        const products = await getProducts(env);
        return jsonResponse({ products }, 200, request);
      }
    }

    if (segments[0] === 'api' && segments[1] === 'customers') {
      if (request.method === 'POST') {
        const payload = await readJson(request);
        const name = String(payload.name || '').trim();
        const deviceId = String(payload.deviceId || '').trim();

        if (!name || !deviceId) {
          return jsonResponse({ error: 'Name and device id are required' }, 400, request);
        }

        let customer = await env.DB.prepare('SELECT * FROM customers WHERE device_id = ? LIMIT 1').bind(deviceId).first();
        if (!customer) {
          const result = await env.DB.prepare(
            'INSERT INTO customers (name, device_id) VALUES (?, ?)',
          ).bind(name, deviceId).run();
          customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(result.meta.last_row_id).first();
        } else {
          await env.DB.prepare('UPDATE customers SET name = ? WHERE id = ?').bind(name, customer.id).run();
          customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer.id).first();
        }

        return jsonResponse({ customer }, 200, request);
      }
    }

    if (segments[0] === 'api' && segments[1] === 'push-subscriptions') {
      if (request.method === 'POST') {
        if (!await isAdminRequest(request, env)) return jsonResponse({ error: 'Admin authorization required' }, 401, request);
        const payload = await readJson(request);
        const endpoint = String(payload.endpoint || '').trim();
        const keys = payload.keys;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return jsonResponse({ error: 'Invalid push subscription' }, 400, request);
        }

        await env.DB.prepare(
          `INSERT INTO push_subscriptions (endpoint, keys_json) VALUES (?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json`,
        ).bind(endpoint, JSON.stringify(keys)).run();

        return jsonResponse({ success: true }, 201, request);
      }
    }

    if (segments[0] === 'api' && segments[1] === 'favorites') {
      if (request.method === 'GET') {
        const customerId = Number(url.searchParams.get('customerId'));
        if (!customerId) {
          return jsonResponse({ favorites: [] }, 200, request);
        }

        const favorites = await env.DB.prepare(
          `SELECT f.id, f.customer_id, f.product_id, f.label, f.selected_options, p.name AS product_name
           FROM favorites f
           JOIN products p ON p.id = f.product_id
           WHERE f.customer_id = ?
           ORDER BY f.created_at DESC`,
        ).bind(customerId).all();

        return jsonResponse({
          favorites: favorites.results.map((favorite) => ({
            ...favorite,
            selected_options: normalizeOptions(favorite.selected_options),
          })),
        }, 200, request);
      }

      if (request.method === 'POST') {
        const payload = await readJson(request);
        const customerId = Number(payload.customerId);
        const productId = Number(payload.productId);
        const label = String(payload.label || '').trim();

        if (!customerId || !productId || !label) {
          return jsonResponse({ error: 'Missing customer, product or label' }, 400, request);
        }

        await env.DB.prepare(
          'INSERT INTO favorites (customer_id, product_id, label, selected_options) VALUES (?, ?, ?, ?)',
        ).bind(customerId, productId, label, JSON.stringify(payload.selectedOptions || {})).run();

        return jsonResponse({ success: true }, 200, request);
      }
    }

    if (segments[0] === 'api' && segments[1] === 'orders') {
      if (request.method === 'GET') {
        const customerId = Number(url.searchParams.get('customerId'));
        if (customerId) {
          const result = await env.DB.prepare(
            `SELECT o.*, p.name AS product_name, c.name AS customer_name
             FROM orders o
             JOIN products p ON p.id = o.product_id
             JOIN customers c ON c.id = o.customer_id
             WHERE o.customer_id = ?
             ORDER BY o.created_at DESC`,
          ).bind(customerId).all();

          return jsonResponse({
            orders: result.results.map((order) => ({
              ...order,
              selected_options: normalizeOptions(order.selected_options),
            })),
          });
        }

        if (!await isAdminRequest(request, env)) return jsonResponse({ error: 'Admin authorization required' }, 401, request);

        const result = await env.DB.prepare(
          `SELECT o.*, p.name AS product_name, c.name AS customer_name
           FROM orders o
           JOIN products p ON p.id = o.product_id
           JOIN customers c ON c.id = o.customer_id
           ORDER BY o.created_at DESC`,
        ).all();

        return jsonResponse({
          orders: result.results.map((order) => ({
            ...order,
            selected_options: normalizeOptions(order.selected_options),
          })),
        }, 200, request);
      }

      if (request.method === 'POST') {
        const payload = await readJson(request);
        const customerId = Number(payload.customerId);
        const productId = Number(payload.productId);

        if (!customerId || !productId) {
          return jsonResponse({ error: 'Missing customer or product' }, 400, request);
        }

        const result = await env.DB.prepare(
          'INSERT INTO orders (customer_id, product_id, selected_options, status) VALUES (?, ?, ?, ?)',
        ).bind(customerId, productId, JSON.stringify(payload.selectedOptions || {}), 'sent').run();

        const order = await env.DB.prepare(
          `SELECT o.*, p.name AS product_name, c.name AS customer_name
           FROM orders o
           JOIN products p ON p.id = o.product_id
           JOIN customers c ON c.id = o.customer_id
           WHERE o.id = ?`,
        ).bind(result.meta.last_row_id).first();
        ctx.waitUntil(sendOrderPushes(env, order));
        return jsonResponse({ order }, 200, request);
      }
    }

    if (segments[0] === 'api' && segments[1] === 'orders' && segments[2]) {
      const orderId = Number(segments[2]);
      if (!await isAdminRequest(request, env)) return jsonResponse({ error: 'Admin authorization required' }, 401, request);
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
        return jsonResponse({ success: true }, 200, request);
      }
      if (request.method === 'PATCH' && segments[3] === 'status') {
        const payload = await readJson(request);
        const status = String(payload.status || '').trim();

        if (!orderId || !status) {
          return jsonResponse({ error: 'Invalid order id or status' }, 400, request);
        }

        await env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, orderId).run();
        const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
        return jsonResponse({ order }, 200, request);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, request);
  },
};
