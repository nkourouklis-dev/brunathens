// Βασικά εργαλεία: κρυπτογράφηση, HTTP, cookies, rate limit, email. Χωρίς καμία γνώση για επιχειρήσεις.

const encoder = new TextEncoder();

export const CARD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // χωρίς 0/O/1/I/L
const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

// ---------- σφάλματα & απαντήσεις ----------

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(error) {
  if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
  console.error(JSON.stringify({ event: 'server_error', message: error?.message, stack: error?.stack }));
  return json({ error: 'Server error' }, 500);
}

export async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

// ---------- κωδικοποίηση & κρυπτογράφηση ----------

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
  const limit = 256 - (256 % alphabet.length); // rejection sampling: ομοιόμορφη κατανομή
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

// Το μυστικό κλειδί της πλατφόρμας. Υπογράφει QR, PIN και cookies. ΜΗΝ το αλλάξεις μετά το λανσάρισμα.
export function appSecret(env) {
  const secret = env.LOYALTY_SECRET || env.APP_SECRET;
  if (!secret || String(secret).length < 16) throw new HttpError(500, 'LOYALTY_SECRET is not configured');
  return String(secret);
}

// ---------- κωδικοί πρόσβασης (PBKDF2) ----------

const PBKDF2_ITERATIONS = 100_000; // όριο του Workers runtime

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false;
  const hash = await pbkdf2(String(password), fromBase64Url(salt), Number(iterations));
  return timingSafeEqual(toBase64Url(hash), expected);
}

// ---------- χρόνος ----------

export function nowIso(date = new Date()) {
  return date.toISOString();
}

export function inDays(days) {
  return nowIso(new Date(Date.now() + days * 86_400_000));
}

export function isoToMs(value) {
  if (!value) return 0;
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`;
  return Date.parse(normalized) || 0;
}

// ---------- είσοδος χρήστη ----------

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

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ''));
}

// Αναγνωστικό χρώμα κειμένου πάνω σε φόντο #rrggbb.
export function contrastColor(hex) {
  const value = String(hex || '#000000').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) || 0);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff';
}

export function hexToRgb(hex) {
  const value = String(hex || '#000000').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) || 0);
}

// ---------- cookies ----------

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function cookieHeader(request, name, value, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

// ---------- rate limit ----------

// Παράθυρο σταθερού μεγέθους. Επιστρέφει true όσο ο καλών είναι μέσα στο όριο.
export async function rateLimit(env, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  ).bind(key, now, now - windowSeconds).first();
  return (row?.count ?? 1) <= limit;
}

export async function requireRate(env, key, limit, windowSeconds) {
  if (!await rateLimit(env, key, limit, windowSeconds)) throw new HttpError(429, 'Too many attempts');
}

// ---------- email (Resend) ----------

export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.LOYALTY_EMAIL_FROM);
}

export async function sendEmail(env, { to, subject, html, text, fromName }) {
  const from = fromName ? `${String(fromName).replace(/[<>"]/g, '')} <${String(env.LOYALTY_EMAIL_FROM).replace(/^.*<|>$/g, '')}>` : env.LOYALTY_EMAIL_FROM;
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
