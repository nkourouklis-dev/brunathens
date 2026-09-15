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

const PICKUP_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const PICKUP_PAST_TOLERANCE_MS = 5 * 60 * 1000;
const PICKUP_MAX_AHEAD_MS = 3 * 60 * 60 * 1000;

// null/empty = "Άμεσα". Otherwise: ISO timestamp with timezone, a real calendar date,
// no earlier than 5 minutes ago and no later than 3 hours from now.
export function parsePickupTime(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return { pickupTime: null };

  const match = typeof value === 'string' ? PICKUP_ISO_PATTERN.exec(value) : null;
  if (!match) return { error: 'Invalid pickup time' };

  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const time = Date.parse(value);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || Number.isNaN(time)) {
    return { error: 'Invalid pickup time' };
  }

  if (time < now - PICKUP_PAST_TOLERANCE_MS || time > now + PICKUP_MAX_AHEAD_MS) {
    return { error: 'Pickup time out of range' };
  }

  return { pickupTime: new Date(time).toISOString() };
}

const MAX_ORDER_ITEMS = 20;
const MAX_ITEM_QUANTITY = 20;
const MAX_COMMENT_LENGTH = 200;

// Accepts `items: [{ productId, quantity, selectedOptions }]`, or the legacy single
// `productId` + `selectedOptions` body from clients that still run the old bundle.
export async function parseOrderItems(env, payload) {
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : payload.productId ? [{ productId: payload.productId, quantity: payload.selectedOptions?.quantity ?? 1, selectedOptions: payload.selectedOptions }] : [];

  if (!rawItems.length || rawItems.length > MAX_ORDER_ITEMS) return { error: 'Invalid order items' };

  const items = [];
  for (const rawItem of rawItems) {
    const productId = Number(rawItem?.productId);
    const quantity = Number(rawItem?.quantity ?? 1);
    const options = rawItem?.selectedOptions && typeof rawItem.selectedOptions === 'object' && !Array.isArray(rawItem.selectedOptions)
      ? rawItem.selectedOptions
      : {};

    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      return { error: 'Invalid order items' };
    }

    items.push({
      productId,
      quantity,
      selectedOptions: {
        size: String(options.size || ''),
        sugar: String(options.sugar || ''),
        extras: Array.isArray(options.extras) ? options.extras.slice(0, 10).map(String) : [],
        comments: String(options.comments || '').trim().slice(0, MAX_COMMENT_LENGTH),
        quantity,
      },
    });
  }

  const productIds = [...new Set(items.map((item) => item.productId))];
  const found = await env.DB.prepare(
    `SELECT id FROM products WHERE active = 1 AND id IN (${productIds.map(() => '?').join(',')})`,
  ).bind(...productIds).all();
  if (found.results.length !== productIds.length) return { error: 'Unknown product' };

  return { items };
}

// Orders newest first, each with its `items`. Orders without order_items rows
// (created before migration 0012) fall back to their single product.
export async function loadOrders(env, { customerId = null, orderId = null, limit = 100 } = {}) {
  const filters = [];
  const binds = [];
  if (customerId) { filters.push('o.customer_id = ?'); binds.push(customerId); }
  if (orderId) { filters.push('o.id = ?'); binds.push(orderId); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const selectIds = `SELECT o.id FROM orders o ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`;

  const [orders, items] = await env.DB.batch([
    env.DB.prepare(
      `SELECT o.*, c.name AS customer_name, p.name AS product_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN products p ON p.id = o.product_id
       WHERE o.id IN (${selectIds})
       ORDER BY o.created_at DESC, o.id DESC`,
    ).bind(...binds, limit),
    env.DB.prepare(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.selected_options, p.name AS product_name, p.image AS product_image
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (${selectIds})
       ORDER BY oi.id`,
    ).bind(...binds, limit),
  ]);

  const itemsByOrder = new Map();
  for (const item of items.results) {
    const orderItems = itemsByOrder.get(item.order_id) || [];
    orderItems.push({ ...item, selected_options: normalizeOptions(item.selected_options) });
    itemsByOrder.set(item.order_id, orderItems);
  }

  return orders.results.map((order) => {
    const selectedOptions = normalizeOptions(order.selected_options);
    return {
      ...order,
      selected_options: selectedOptions,
      items: itemsByOrder.get(order.id) || [{
        id: null,
        order_id: order.id,
        product_id: order.product_id,
        product_name: order.product_name,
        quantity: Number(selectedOptions.quantity) || 1,
        selected_options: selectedOptions,
      }],
    };
  });
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

function formatItemsSummary(items = []) {
  return items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ');
}

function formatPickupForPush(pickupTime) {
  if (!pickupTime) return 'Άμεσα';
  const time = new Date(pickupTime).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Athens' });
  return `Παραλαβή ${time}`;
}

export async function sendOrderPushes(env, order) {
  const subscriptions = await env.DB.prepare('SELECT id, endpoint, keys_json FROM push_subscriptions').all();
  await deliverPushes(env, 'push_subscriptions', subscriptions.results, {
    title: 'BRUN',
    body: `Νέα παραγγελία: ${order.customer_name} · ${formatItemsSummary(order.items)} · ${formatPickupForPush(order.pickup_time)}`,
    url: '/admin',
    tag: `brun-order-${order.id}`,
  });
}

export async function sendCustomerReadyPush(env, order) {
  const subscriptions = await env.DB.prepare(
    'SELECT id, endpoint, keys_json FROM customer_push_subscriptions WHERE customer_id = ?',
  ).bind(order.customer_id).all();
  await deliverPushes(env, 'customer_push_subscriptions', subscriptions.results, {
    title: 'BRUN · Έτοιμο ☕',
    body: `${formatItemsSummary(order.items)} σε περιμένει στο bar.`,
    url: '/',
    tag: `brun-ready-${order.id}`,
  });
}

async function deliverPushes(env, table, subscriptions, message) {
  if (!env.VAPID_PRIVATE_KEY || !subscriptions.length) return;

  const applicationServerKeys = await getApplicationServerKeys(env);
  const payload = JSON.stringify(message);

  await Promise.all(subscriptions.map(async (subscription) => {
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
        await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(subscription.id).run();
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'push_delivery_failed', subscriptionId: subscription.id, message: error.message }));
    }
  }));
}
