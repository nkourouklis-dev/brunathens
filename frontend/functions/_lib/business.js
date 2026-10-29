// Επιχειρήσεις: αναζήτηση, branding, λογότυπο, δώρα, ρυθμίσεις.
import { ICON_KEYS, DEFAULT_ICON, DEFAULT_REWARD_ICON, RESERVED_SLUGS, SLUG_PATTERN, LIMITS } from '../../shared/constants.js';
import { HttpError, cleanText, contrastColor, fromBase64Url, hexToRgb, isHexColor, nowIso, randomString, normalizeEmail } from './core.js';

export const BUSINESS_COLUMNS = `id, slug, name, tagline, icon, color, (logo IS NOT NULL) AS has_logo, logo_version,
  unit_one, unit_many, card_style, points_per_visit, max_points_per_scan, scan_cooldown_seconds, welcome_points,
  signup_mode, join_code, legal_name, legal_address, legal_vat, contact_email, contact_phone, status, created_at, updated_at`;

const JOIN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

// ---------- slug ----------

const GREEK_TO_LATIN = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

export function slugify(text) {
  const plain = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return plain
    .replace(/[α-ω]/g, (character) => GREEK_TO_LATIN[character] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

export function validateSlug(slug) {
  const value = String(slug || '').trim().toLowerCase();
  if (!SLUG_PATTERN.test(value) || RESERVED_SLUGS.includes(value)) throw new HttpError(400, 'Invalid slug');
  return value;
}

// ---------- ανάγνωση ----------

export async function getBusinessBySlug(env, slug) {
  const value = String(slug || '').toLowerCase();
  if (!SLUG_PATTERN.test(value)) return null;
  return env.DB.prepare(`SELECT ${BUSINESS_COLUMNS} FROM businesses WHERE slug = ?`).bind(value).first();
}

export async function getBusinessById(env, id) {
  return env.DB.prepare(`SELECT ${BUSINESS_COLUMNS} FROM businesses WHERE id = ?`).bind(id).first();
}

// Για δημόσιες σελίδες: μια ανενεργή (suspended) επιχείρηση δεν υπάρχει.
export async function requireActiveBusiness(env, slug) {
  const business = await getBusinessBySlug(env, slug);
  if (!business || business.status !== 'active') throw new HttpError(404, 'Business not found');
  return business;
}

export async function listRewards(env, businessId, { includeInactive = false } = {}) {
  const rows = await env.DB.prepare(
    `SELECT id, name, description, cost, icon, active, sort_order FROM rewards
     WHERE business_id = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY cost, sort_order, id`,
  ).bind(businessId).all();
  return rows.results.map((row) => ({
    id: row.id, name: row.name, description: row.description || '', cost: row.cost, icon: row.icon, active: Boolean(row.active),
  }));
}

export function walletAvailability(env) {
  return {
    apple: Boolean(env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID && env.APPLE_PASS_CERT_PEM && env.APPLE_PASS_KEY_PEM && env.APPLE_WWDR_CERT_PEM),
    google: Boolean(env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_EMAIL && env.GOOGLE_WALLET_SA_KEY),
  };
}

// Ό,τι μπορεί να δει οποιοσδήποτε για μια επιχείρηση (σελίδα πελάτη).
export function publicBusiness(business, rewards, env) {
  return {
    slug: business.slug,
    name: business.name,
    tagline: business.tagline || '',
    icon: business.icon,
    color: business.color,
    textColor: contrastColor(business.color),
    hasLogo: Boolean(business.has_logo),
    logoVersion: business.logo_version,
    unitOne: business.unit_one,
    unitMany: business.unit_many,
    cardStyle: business.card_style,
    signupMode: business.signup_mode,
    welcomePoints: business.welcome_points,
    rewards: rewards.filter((reward) => reward.active),
    wallet: walletAvailability(env),
    legal: {
      name: business.legal_name || '',
      address: business.legal_address || '',
      vat: business.legal_vat || '',
      email: business.contact_email || '',
      phone: business.contact_phone || '',
    },
  };
}

// Ό,τι βλέπει η ομάδα (ρυθμίσεις).
export function teamBusiness(business, rewards, env) {
  return {
    ...publicBusiness(business, rewards, env),
    rewards,
    pointsPerVisit: business.points_per_visit,
    maxPointsPerScan: business.max_points_per_scan,
    scanCooldownSeconds: business.scan_cooldown_seconds,
    joinCode: business.join_code,
    status: business.status,
  };
}

// Στοιχεία που χρειάζονται οι κανόνες πόντων (στον πελάτη και στο ταμείο).
export function pointsRules(business) {
  return {
    pointsPerVisit: business.points_per_visit,
    maxPointsPerScan: business.max_points_per_scan,
    scanCooldownSeconds: business.scan_cooldown_seconds,
    welcomePoints: business.welcome_points,
  };
}

// ---------- δημιουργία ----------

export async function createBusiness(env, { name, slug, tagline = '', color, icon, contactEmail = '' }) {
  const cleanName = cleanText(name, LIMITS.nameLength);
  if (cleanName.length < 2) throw new HttpError(400, 'Name required');
  const finalSlug = validateSlug(slug || slugify(cleanName));
  const finalIcon = ICON_KEYS.includes(icon) ? icon : DEFAULT_ICON;
  const finalColor = isHexColor(color) ? String(color).toLowerCase() : '#1f2937';
  const now = nowIso();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO businesses (slug, name, tagline, icon, color, join_code, contact_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(finalSlug, cleanName, cleanText(tagline, LIMITS.taglineLength) || null, finalIcon, finalColor, randomString(8, JOIN_ALPHABET), normalizeEmail(contactEmail) || null, now, now).first();
    return getBusinessById(env, row.id);
  } catch (error) {
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'Slug taken');
    throw error;
  }
}

export async function availableSlug(env, base) {
  const root = slugify(base) || 'business';
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? root : `${root.slice(0, 28)}-${attempt + 1}`;
    if (!SLUG_PATTERN.test(candidate) || RESERVED_SLUGS.includes(candidate)) continue;
    const taken = await env.DB.prepare('SELECT 1 FROM businesses WHERE slug = ?').bind(candidate).first();
    if (!taken) return candidate;
  }
  return `${root.slice(0, 22)}-${randomString(5)}`;
}

// ---------- ρυθμίσεις ----------

function intInRange(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, 'Invalid setting', { field });
  return number;
}

// Δέχεται μόνο τα πεδία που στάλθηκαν. Επιστρέφει true αν άλλαξε το branding (για ενημέρωση Wallet).
export async function updateBusinessSettings(env, business, payload) {
  const sets = [];
  const binds = [];
  let brandingChanged = false;
  const put = (column, value) => { sets.push(`${column} = ?`); binds.push(value); };
  const has = (key) => Object.prototype.hasOwnProperty.call(payload, key);

  if (has('name')) {
    const name = cleanText(payload.name, LIMITS.nameLength);
    if (name.length < 2) throw new HttpError(400, 'Name required');
    put('name', name); brandingChanged = true;
  }
  if (has('tagline')) { put('tagline', cleanText(payload.tagline, LIMITS.taglineLength) || null); }
  if (has('icon')) {
    if (!ICON_KEYS.includes(payload.icon)) throw new HttpError(400, 'Invalid setting', { field: 'icon' });
    put('icon', payload.icon); brandingChanged = true;
  }
  if (has('color')) {
    if (!isHexColor(payload.color)) throw new HttpError(400, 'Invalid setting', { field: 'color' });
    put('color', String(payload.color).toLowerCase()); brandingChanged = true;
  }
  if (has('unitOne')) put('unit_one', cleanText(payload.unitOne, LIMITS.unitLength) || 'πόντος');
  if (has('unitMany')) put('unit_many', cleanText(payload.unitMany, LIMITS.unitLength) || 'πόντοι');
  if (has('cardStyle')) {
    if (!['stamps', 'points'].includes(payload.cardStyle)) throw new HttpError(400, 'Invalid setting', { field: 'cardStyle' });
    put('card_style', payload.cardStyle);
  }
  if (has('pointsPerVisit')) put('points_per_visit', intInRange(payload.pointsPerVisit, 1, 100, 'pointsPerVisit'));
  if (has('maxPointsPerScan')) put('max_points_per_scan', intInRange(payload.maxPointsPerScan, 1, 1000, 'maxPointsPerScan'));
  if (has('scanCooldownSeconds')) put('scan_cooldown_seconds', intInRange(payload.scanCooldownSeconds, 0, 86400, 'scanCooldownSeconds'));
  if (has('welcomePoints')) put('welcome_points', intInRange(payload.welcomePoints, 0, 100, 'welcomePoints'));
  if (has('signupMode')) {
    if (!['open', 'code', 'closed'].includes(payload.signupMode)) throw new HttpError(400, 'Invalid setting', { field: 'signupMode' });
    put('signup_mode', payload.signupMode);
  }
  for (const [key, column, max] of [
    ['legalName', 'legal_name', 120], ['legalAddress', 'legal_address', 200], ['legalVat', 'legal_vat', 30], ['contactPhone', 'contact_phone', 30],
  ]) {
    if (has(key)) put(column, cleanText(payload[key], max) || null);
  }
  if (has('contactEmail')) {
    const email = payload.contactEmail ? normalizeEmail(payload.contactEmail) : '';
    if (payload.contactEmail && !email) throw new HttpError(400, 'Invalid email');
    put('contact_email', email || null);
  }
  if (has('logo')) {
    if (payload.logo === null || payload.logo === '') {
      put('logo', null);
    } else {
      put('logo', validateLogoDataUrl(payload.logo));
    }
    sets.push('logo_version = logo_version + 1');
    brandingChanged = true;
  }

  if (!sets.length) return { brandingChanged: false };
  sets.push('updated_at = ?');
  binds.push(nowIso());
  await env.DB.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, business.id).run();
  return { brandingChanged };
}

export async function rotateJoinCode(env, businessId) {
  const code = randomString(8, JOIN_ALPHABET);
  await env.DB.prepare('UPDATE businesses SET join_code = ?, updated_at = ? WHERE id = ?').bind(code, nowIso(), businessId).run();
  return code;
}

// ---------- λογότυπο ----------

const LOGO_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

function sniffImage(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return '';
}

// Επιτρέπονται μόνο PNG/JPEG/WebP (ποτέ SVG: μπορεί να περιέχει script). Ελέγχουμε και τα πρώτα bytes.
export function validateLogoDataUrl(value) {
  const match = LOGO_PATTERN.exec(String(value || ''));
  if (!match) throw new HttpError(400, 'Invalid logo');
  let bytes;
  try { bytes = fromBase64Url(match[2].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')); } catch { throw new HttpError(400, 'Invalid logo'); }
  if (bytes.length > LIMITS.logoBytes) throw new HttpError(413, 'Logo too large');
  if (sniffImage(bytes) !== match[1]) throw new HttpError(400, 'Invalid logo');
  return String(value);
}

export async function loadLogo(env, businessId) {
  const row = await env.DB.prepare('SELECT logo FROM businesses WHERE id = ?').bind(businessId).first();
  const match = LOGO_PATTERN.exec(row?.logo || '');
  if (!match) return null;
  const bytes = fromBase64Url(match[2].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  return { type: match[1], bytes };
}

// ---------- εικονίδιο PNG (όταν δεν υπάρχει λογότυπο) ----------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// Ομοιόμορφο PNG με το χρώμα της επιχείρησης και ένα στρογγυλό «σήμα» στη μέση (ανοιχτό/σκούρο ανάλογα με το χρώμα).
export async function solidIconPng(color, size = 192) {
  const [r, g, b] = hexToRgb(color);
  const text = contrastColor(color) === '#ffffff' ? [255, 255, 255] : [17, 17, 17];
  const raw = new Uint8Array(size * (1 + size * 3));
  const centre = (size - 1) / 2;
  const radius = size * 0.26;
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const inside = (x - centre) ** 2 + (y - centre) ** 2 <= radius ** 2;
      const colour = inside ? text : [r, g, b];
      raw.set(colour, row + 1 + x * 3);
    }
  }
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 2, 0, 0, 0], 8);
  const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const parts = [signature, pngChunk('IHDR', header), pngChunk('IDAT', compressed), pngChunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}

// ---------- δώρα ----------

export function parseRewardInput(payload) {
  const name = cleanText(payload.name, LIMITS.rewardNameLength);
  if (name.length < 2) throw new HttpError(400, 'Name required');
  return {
    name,
    description: cleanText(payload.description, LIMITS.rewardDescriptionLength) || null,
    cost: intInRange(payload.cost, 1, 100000, 'cost'),
    icon: ICON_KEYS.includes(payload.icon) ? payload.icon : DEFAULT_REWARD_ICON,
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}
