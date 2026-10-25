// Shared helpers for the loyalty card: crypto, sessions, members, QR tokens, staff auth, rate limits.
import { jsonResponse, signAdminToken } from './shared.js';

export { jsonResponse };

const encoder = new TextEncoder();
const sessionCookieName = (tenant) => `kerdiseto_${tenant.slug}`;
const SESSION_DAYS = 365;
export const QR_TTL_SECONDS = 120;
const SCAN_TICKET_TTL_SECONDS = 5 * 60;
const CARD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

// ---------- encoding & crypto ----------

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomString(length, alphabet = ID_ALPHABET) {
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % alphabet.length);
  let result = '';
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) result += alphabet[byte % alphabet.length];
    }
  }
  return result;
}

export function randomToken(byteLength = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const hmacKeys = new Map();
async function hmacKey(secret) {
  if (!hmacKeys.has(secret)) {
    hmacKeys.set(secret, crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  }
  return hmacKeys.get(secret);
}

export async function hmac(secret, message, bytes = 32) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message));
  return toBase64Url(new Uint8Array(signature).slice(0, bytes));
}

export function timingSafeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function loyaltySecret(env) {
  if (env.LOYALTY_SECRET) return env.LOYALTY_SECRET;
  if (env.ADMIN_ACCESS_KEY) return `loyalty:${env.ADMIN_ACCESS_KEY}`;
  throw new Error('LOYALTY_SECRET is not configured');
}

export function nowIso(date = new Date()) {
  return date.toISOString();
}

export function isoToMs(value) {
  if (!value) return 0;
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`;
  return Date.parse(normalized) || 0;
}

// ---------- request helpers ----------

export async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : '';
}

export function cleanText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function formatCardNumber(cardNumber) {
  return `${cardNumber.slice(0, 4)}-${cardNumber.slice(4)}`;
}

// ---------- settings ----------

export const DEFAULT_SETTINGS = {
  points_per_reward: 10,
  max_points_per_scan: 5,
  scan_cooldown_seconds: 60,
  reward_name: 'Δωρεάν δώρο',
};

export async function getSettings(env, tenant) {
  const rows = await env.DB.prepare('SELECT key, value FROM loyalty_settings WHERE tenant_id = ?').bind(tenant.id).all();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows.results) {
    if (!(row.key in settings)) continue;
    settings[row.key] = typeof DEFAULT_SETTINGS[row.key] === 'number' ? Number(row.value) || DEFAULT_SETTINGS[row.key] : row.value;
  }
  if (!Number.isFinite(settings.scan_cooldown_seconds)) settings.scan_cooldown_seconds = DEFAULT_SETTINGS.scan_cooldown_seconds;
  return settings;
}

// ---------- rate limiting ----------

// Fixed window counter. Returns true while the caller is within `limit` hits per `windowSeconds`.
export async function rateLimit(env, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO loyalty_rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  ).bind(key, now, now - windowSeconds).first();
  return (row?.count ?? 1) <= limit;
}

// ---------- members ----------

export function rewardsAvailable(member, settings) {
  return Math.floor(member.points / settings.points_per_reward);
}

// Stamps to show on the card: a full card (10/10) while a reward is waiting, otherwise the points towards the next one.
export function displayProgress(member, settings) {
  const progress = member.points % settings.points_per_reward;
  return progress === 0 && member.points > 0 ? settings.points_per_reward : progress;
}

export function publicMember(member, settings) {
  const perReward = settings.points_per_reward;
  const progress = member.points % perReward;
  return {
    name: member.name,
    email: member.email,
    cardNumber: formatCardNumber(member.card_number),
    points: member.points,
    lifetimePoints: member.lifetime_points,
    rewardsRedeemed: member.rewards_redeemed,
    rewardsAvailable: rewardsAvailable(member, settings),
    progress: displayProgress(member, settings),
    pointsToNextReward: perReward - progress,
    favoriteDrink: member.favorite_drink || '',
    marketingOptIn: Boolean(member.marketing_opt_in),
    emailVerified: Boolean(member.email_verified_at),
    createdAt: member.created_at,
    updatedAt: member.updated_at,
  };
}

// What the barista/owner sees about a member.
export function memberForStaff(member, settings) {
  return {
    id: member.id,
    name: member.name,
    cardNumber: formatCardNumber(member.card_number),
    points: member.points,
    progress: displayProgress(member, settings),
    rewardsAvailable: rewardsAvailable(member, settings),
    lifetimePoints: member.lifetime_points,
    rewardsRedeemed: member.rewards_redeemed,
    favoriteDrink: member.favorite_drink || '',
    lastEarnAt: member.last_earn_at,
    createdAt: member.created_at,
  };
}

export async function createMember(env, tenant, { name, email, favoriteDrink, marketingOptIn }) {
  const now = nowIso();
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = randomString(20);
    const cardNumber = randomString(8, CARD_ALPHABET);
    try {
      return await env.DB.prepare(
        `INSERT INTO loyalty_members (tenant_id, public_id, card_number, name, email, favorite_drink, terms_accepted_at, marketing_opt_in, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(tenant.id, publicId, cardNumber, name, email, favoriteDrink || null, now, marketingOptIn ? 1 : 0, now, now).first();
    } catch (error) {
      if (/UNIQUE/i.test(error.message) && /email/i.test(error.message)) throw new HttpError(409, 'Email already registered');
      if (!/UNIQUE/i.test(error.message)) throw error;
      // public_id / card_number collision: try again with new random values
    }
  }
  throw new Error('Could not allocate a card number');
}

export async function getMemberById(env, id, tenantId) {
  return env.DB.prepare('SELECT * FROM loyalty_members WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL').bind(id, tenantId).first();
}

export async function getMemberByPublicId(env, publicId, tenantId) {
  return env.DB.prepare('SELECT * FROM loyalty_members WHERE public_id = ? AND tenant_id = ? AND deleted_at IS NULL').bind(publicId, tenantId).first();
}

export async function recentTransactions(env, memberId, limit = 20) {
  const rows = await env.DB.prepare(
    `SELECT id, delta, kind, created_at, reverses_id FROM loyalty_transactions WHERE member_id = ? ORDER BY id DESC LIMIT ?`,
  ).bind(memberId, limit).all();
  return rows.results.map((row) => ({ id: row.id, delta: row.delta, kind: row.kind, createdAt: row.created_at }));
}

// ---------- sessions (customer) ----------

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function errorResponse(error) {
  if (error instanceof HttpError) return jsonResponse({ error: error.message, ...error.extra }, error.status);
  console.error(JSON.stringify({ event: 'loyalty_error', message: error.message, stack: error.stack }));
  return jsonResponse({ error: 'Server error' }, 500);
}

// Wraps a handler so thrown HttpErrors become JSON responses.
export function handler(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function isSecureRequest(request) {
  return new URL(request.url).protocol === 'https:';
}

export function sessionCookie(request, tenant, token, maxAgeSeconds) {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${sessionCookieName(tenant)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function startSession(env, request, tenant, memberId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM loyalty_sessions WHERE member_id = ? AND expires_at < ?').bind(memberId, nowIso()),
    env.DB.prepare('INSERT INTO loyalty_sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(token), memberId, nowIso(expires)),
  ]);
  return sessionCookie(request, tenant, token, SESSION_DAYS * 86400);
}

export async function endSession(env, request, tenant) {
  const token = readCookie(request, sessionCookieName(tenant));
  if (token) await env.DB.prepare('DELETE FROM loyalty_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return sessionCookie(request, tenant, '', 0);
}

export async function getSessionMember(env, request, tenant) {
  const token = readCookie(request, sessionCookieName(tenant));
  if (!token || token.length > 100) return null;
  return env.DB.prepare(
    `SELECT m.* FROM loyalty_sessions s JOIN loyalty_members m ON m.id = s.member_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND m.tenant_id = ? AND m.deleted_at IS NULL`,
  ).bind(await sha256Hex(token), nowIso(), tenant.id).first();
}

export async function requireMember(env, request, tenant) {
  const member = await getSessionMember(env, request, tenant);
  if (!member) throw new HttpError(401, 'Not signed in');
  return member;
}

// ---------- QR codes ----------
// Rotating (in the app):  KRS:R:<publicId>:<expUnix>:<nonce>:<sig>
// Static (in Wallet):     KRS:S:<publicId>:<qrVersion>:<sig>
// Manual:                 the 8-character card number (dash optional)

export async function rotatingQrToken(env, member) {
  const exp = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
  const nonce = randomString(10);
  const sig = await hmac(loyaltySecret(env), `R|${member.public_id}|${exp}|${nonce}`, 16);
  return { token: `KRS:R:${member.public_id}:${exp}:${nonce}:${sig}`, expiresAt: exp * 1000 };
}

export async function staticQrToken(env, member) {
  const sig = await hmac(loyaltySecret(env), `S|${member.public_id}|${member.qr_version}`, 16);
  return `KRS:S:${member.public_id}:${member.qr_version}:${sig}`;
}

// Resolves whatever the barista scanned or typed into a member plus a one-time ticket id.
export async function resolveScannedCode(env, tenant, rawCode) {
  const code = String(rawCode || '').trim();
  const secret = loyaltySecret(env);

  if (code.startsWith('KRS:R:')) {
    const [, , publicId, exp, nonce, sig] = code.split(':');
    const expected = await hmac(secret, `R|${publicId}|${exp}|${nonce}`, 16);
    if (!sig || !timingSafeEqual(sig, expected)) throw new HttpError(400, 'Invalid code');
    if (Number(exp) * 1000 < Date.now()) throw new HttpError(400, 'Code expired');
    const member = await getMemberByPublicId(env, publicId, tenant.id);
    if (!member) throw new HttpError(404, 'Member not found');
    return { member, ticketId: `r:${nonce}`, source: 'app' };
  }

  if (code.startsWith('KRS:S:')) {
    const [, , publicId, version, sig] = code.split(':');
    const expected = await hmac(secret, `S|${publicId}|${version}`, 16);
    if (!sig || !timingSafeEqual(sig, expected)) throw new HttpError(400, 'Invalid code');
    const member = await getMemberByPublicId(env, publicId, tenant.id);
    if (!member) throw new HttpError(404, 'Member not found');
    if (String(member.qr_version) !== version) throw new HttpError(400, 'Code replaced');
    return { member, ticketId: `s:${randomString(12)}`, source: 'wallet' };
  }

  const cardNumber = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cardNumber.length !== 8) throw new HttpError(400, 'Invalid code');
  const member = await env.DB.prepare('SELECT * FROM loyalty_members WHERE card_number = ? AND tenant_id = ? AND deleted_at IS NULL').bind(cardNumber, tenant.id).first();
  if (!member) throw new HttpError(404, 'Member not found');
  return { member, ticketId: `m:${randomString(12)}`, source: 'manual' };
}

// A ticket ties earn/redeem calls to a real scan, so points can't be given to an arbitrary member id.
export async function issueScanTicket(env, memberId, ticketId) {
  const exp = Math.floor(Date.now() / 1000) + SCAN_TICKET_TTL_SECONDS;
  const body = `${memberId}.${ticketId}.${exp}`;
  return `${body}.${await hmac(loyaltySecret(env), `T|${body}`, 16)}`;
}

export async function verifyScanTicket(env, ticket) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 4) throw new HttpError(400, 'Invalid scan');
  const [memberId, ticketId, exp, sig] = parts;
  const expected = await hmac(loyaltySecret(env), `T|${memberId}.${ticketId}.${exp}`, 16);
  if (!timingSafeEqual(sig, expected)) throw new HttpError(400, 'Invalid scan');
  if (Number(exp) * 1000 < Date.now()) throw new HttpError(400, 'Scan expired');
  return { memberId: Number(memberId), ticketId };
}

// ---------- tenants & staff (admin) auth ----------
// Every request names its business: header X-Tenant (API calls) or ?t= (links that open in a new tab).
// Tokens are signed with LOYALTY_SECRET and carry the tenant: { role: 'owner' | 'barista', tenantId, staffId? }.
// The platform operator (ADMIN_ACCESS_KEY) gets { role: 'super' }, which may act as owner of any business.

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const isValidSlug = (slug) => SLUG_PATTERN.test(slug);

export async function requireTenant(env, request) {
  const slug = String(request.headers.get('X-Tenant') || new URL(request.url).searchParams.get('t') || '').toLowerCase();
  if (!isValidSlug(slug)) throw new HttpError(404, 'Business not found');
  const tenant = await env.DB.prepare('SELECT * FROM tenants WHERE slug = ? AND active = 1').bind(slug).first();
  if (!tenant) throw new HttpError(404, 'Business not found');
  return tenant;
}

export function publicTenant(tenant) {
  return {
    slug: tenant.slug,
    name: tenant.name,
    tagline: tenant.tagline || '',
    icon: tenant.icon,
    color: tenant.color,
    logo: tenant.logo || '',
    legal: { name: tenant.legal_name || '', address: tenant.legal_address || '', vat: tenant.legal_vat || '', email: tenant.contact_email || '' },
  };
}

export async function ownerKeyHash(env, key) {
  return hmac(loyaltySecret(env), `OWNER|${key}`, 32);
}

export async function pinLookup(env, tenant, pin) {
  return hmac(loyaltySecret(env), `PIN|${tenant.slug}|${pin}`, 32);
}

export async function signStaffToken(env, payload) {
  return signAdminToken(payload, loyaltySecret(env));
}

async function verifyToken(env, request) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  const expected = await signAdminToken(payload, loyaltySecret(env));
  return timingSafeEqual(expected, token) ? payload : null;
}

export async function getStaffIdentity(env, request, tenant) {
  const payload = await verifyToken(env, request);
  if (!payload) return null;
  if (payload.role === 'super') return { role: 'owner', staffId: null, name: 'Πλατφόρμα', super: true };
  if (payload.tenantId !== tenant.id) return null;

  if (payload.role === 'barista') {
    const staff = await env.DB.prepare('SELECT id, name FROM loyalty_staff WHERE id = ? AND tenant_id = ? AND active = 1').bind(payload.staffId, tenant.id).first();
    return staff ? { role: 'barista', staffId: staff.id, name: staff.name } : null;
  }
  if (payload.role === 'owner') return { role: 'owner', staffId: null, name: 'Ιδιοκτήτης' };
  return null;
}

export async function requireStaff(env, request, tenant, { ownerOnly = false } = {}) {
  const identity = await getStaffIdentity(env, request, tenant);
  if (!identity) throw new HttpError(401, 'Admin authorization required');
  if (ownerOnly && identity.role !== 'owner') throw new HttpError(403, 'Owner only');
  return identity;
}

export async function requireSuper(env, request) {
  const payload = await verifyToken(env, request);
  if (payload?.role !== 'super') throw new HttpError(401, 'Platform authorization required');
}

// ---------- email ----------

export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.LOYALTY_EMAIL_FROM);
}

export async function sendEmail(env, { to, subject, html, text, fromName }) {
  const address = /<([^>]+)>/.exec(env.LOYALTY_EMAIL_FROM)?.[1] || env.LOYALTY_EMAIL_FROM;
  const from = fromName ? `${fromName.replace(/[<>"]/g, '')} <${address}>` : env.LOYALTY_EMAIL_FROM;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'email_failed', status: response.status, body: (await response.text()).slice(0, 300) }));
    throw new HttpError(502, 'Email failed');
  }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
