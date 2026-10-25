// Apple Wallet (.pkpass) builder for Cloudflare: zip + PKCS#7 detached signature with WebCrypto only.
//
// Secrets (Cloudflare Pages → Settings → Variables and secrets):
//   APPLE_PASS_TYPE_ID     e.g. pass.com.example.loyalty
//   APPLE_TEAM_ID          10-character Team ID from developer.apple.com
//   APPLE_PASS_CERT_PEM    the Pass Type ID certificate (PEM)
//   APPLE_PASS_KEY_PEM     its private key (PEM, PKCS#8 or PKCS#1, unencrypted)
//   APPLE_WWDR_CERT_PEM    Apple WWDR intermediate certificate, G4 (PEM)
// Optional, for instant updates on the iPhone (otherwise: pull down on the pass to refresh):
//   APPLE_APNS_KEY_P8, APPLE_APNS_KEY_ID

import { HttpError, formatCardNumber, hmac, loyaltySecret, rewardsAvailable, staticQrToken, toBase64Url, isoToMs, displayProgress } from './loyalty.js';

const encoder = new TextEncoder();

export function appleWalletConfigured(env) {
  return Boolean(env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID && env.APPLE_PASS_CERT_PEM && env.APPLE_PASS_KEY_PEM && env.APPLE_WWDR_CERT_PEM);
}

export async function appleAuthToken(env, publicId) {
  return hmac(loyaltySecret(env), `APPLE|${publicId}`, 24);
}

export function passLastModified(member) {
  return Math.floor(isoToMs(member.updated_at) / 1000);
}

// ---------- pass content ----------

function rgb(hex) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex || '')?.[1] || '2b2b2b';
  return `rgb(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)})`;
}

// Every pass needs the business's own PNG logo (uploaded by the owner as a PNG data URL).
function passImages(tenant) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(tenant.logo || '');
  if (match) {
    return Object.fromEntries(['logo.png', 'logo@2x.png', 'logo@3x.png', 'icon.png', 'icon@2x.png', 'icon@3x.png'].map((name) => [name, match[1]]));
  }
  throw new HttpError(503, 'Upload a PNG logo first');
}

export async function buildPassJson(env, tenant, member, settings, origin) {
  const available = rewardsAvailable(member, settings);
  const progress = member.points % settings.points_per_reward;
  const left = settings.points_per_reward - progress;

  return {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_ID,
    serialNumber: member.public_id,
    teamIdentifier: env.APPLE_TEAM_ID,
    organizationName: tenant.name,
    description: `Κάρτα επιβράβευσης ${tenant.name}`,
    logoText: '',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(220, 220, 220)',
    backgroundColor: rgb(tenant.color),
    webServiceURL: `${origin}/api/loyalty/wallet/apple-ws`,
    authenticationToken: await appleAuthToken(env, member.public_id),
    sharingProhibited: true,
    storeCard: {
      headerFields: [
        { key: 'points', label: 'ΠΟΝΤΟΙ', value: `${displayProgress(member, settings)}/${settings.points_per_reward}`, changeMessage: 'Οι πόντοι σου: %@' },
      ],
      primaryFields: [
        { key: 'name', label: 'ΜΕΛΟΣ', value: member.name },
      ],
      secondaryFields: [
        {
          key: 'rewards',
          label: available === 1 ? 'ΣΕ ΠΕΡΙΜΕΝΕΙ' : 'ΔΩΡΑ',
          value: available > 0 ? `${available} × ${settings.reward_name}` : `Σε ${left} ${left === 1 ? 'πόντο' : 'πόντους'}`,
          changeMessage: '%@',
        },
      ],
      auxiliaryFields: [
        { key: 'card', label: 'ΚΑΡΤΑ', value: formatCardNumber(member.card_number) },
      ],
      backFields: [
        { key: 'how', label: 'Πώς λειτουργεί', value: `Δείξε το QR στο ταμείο σε κάθε επίσκεψη. Κάθε ${settings.points_per_reward} πόντοι = ${settings.reward_name}.` },
        { key: 'total', label: 'Συνολικοί πόντοι', value: String(member.lifetime_points) },
        { key: 'redeemed', label: 'Δώρα που πήρες', value: String(member.rewards_redeemed) },
        { key: 'app', label: 'Η κάρτα σου online', value: `${origin}/${tenant.slug}`, attributedValue: `<a href="${origin}/${tenant.slug}">Άνοιγμα</a>` },
        { key: 'refresh', label: 'Ενημέρωση', value: 'Αν οι πόντοι δεν φαίνονται ενημερωμένοι, σύρε προς τα κάτω σε αυτή την πλευρά της κάρτας.' },
      ],
    },
    barcodes: [
      { format: 'PKBarcodeFormatQR', message: await staticQrToken(env, member), messageEncoding: 'iso-8859-1', altText: formatCardNumber(member.card_number) },
    ],
  };
}

export async function buildPkpass(env, tenant, member, settings, origin) {
  const passJson = await buildPassJson(env, tenant, member, settings, origin);
  const files = { 'pass.json': encoder.encode(JSON.stringify(passJson)) };
  for (const [name, base64] of Object.entries(passImages(tenant))) files[name] = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const manifest = {};
  for (const [name, bytes] of Object.entries(files)) manifest[name] = await digestHex('SHA-1', bytes);
  files['manifest.json'] = encoder.encode(JSON.stringify(manifest));
  files.signature = await signDetached(files['manifest.json'], {
    certPem: env.APPLE_PASS_CERT_PEM,
    keyPem: env.APPLE_PASS_KEY_PEM,
    chainPems: [env.APPLE_WWDR_CERT_PEM],
  });

  return zipStore(files);
}

async function digestHex(algorithm, bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ---------- PEM / DER ----------

export function pemToDer(pem) {
  const base64 = String(pem).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function pemLabel(pem) {
  return /-----BEGIN ([^-]+)-----/.exec(String(pem))?.[1] || '';
}

function concat(...arrays) {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function derLength(length) {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function tlv(tag, ...contents) {
  const body = concat(...contents);
  return concat(Uint8Array.of(tag), derLength(body.length), body);
}

const seq = (...items) => tlv(0x30, ...items);
const set = (...items) => tlv(0x31, ...items);
const octet = (bytes) => tlv(0x04, bytes);
const derNull = () => Uint8Array.of(0x05, 0x00);
const integer = (value) => tlv(0x02, Uint8Array.of(value));

function oid(dotted) {
  const parts = dotted.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk = [];
    let value = part;
    do {
      chunk.unshift(value & 0x7f);
      value = Math.floor(value / 128);
    } while (value > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i] |= 0x80;
    bytes.push(...chunk);
  }
  return tlv(0x06, Uint8Array.from(bytes));
}

function utcTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, encoder.encode(text));
}

// Reads one TLV at `offset`; returns { tag, start (of value), end, total (incl. header) }.
function readTlv(bytes, offset) {
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset + 2 + i];
    header += count;
  }
  return { tag, start: offset + header, end: offset + header + length, headerStart: offset };
}

// Raw DER of the certificate's issuer Name and serialNumber INTEGER.
function issuerAndSerial(certDer) {
  const cert = readTlv(certDer, 0);
  const tbs = readTlv(certDer, cert.start);
  let cursor = tbs.start;
  let field = readTlv(certDer, cursor);
  if (field.tag === 0xa0) { // [0] version
    cursor = field.end;
    field = readTlv(certDer, cursor);
  }
  const serial = certDer.slice(field.headerStart, field.end);
  cursor = field.end;
  const signatureAlg = readTlv(certDer, cursor);
  const issuer = readTlv(certDer, signatureAlg.end);
  return { issuer: certDer.slice(issuer.headerStart, issuer.end), serial };
}

async function importRsaKey(keyPem) {
  let der = pemToDer(keyPem);
  if (pemLabel(keyPem) === 'RSA PRIVATE KEY') {
    // PKCS#1 → PKCS#8
    der = seq(integer(0), seq(oid('1.2.840.113549.1.1.1'), derNull()), octet(der));
  }
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_RSA = '1.2.840.113549.1.1.1';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

function compareBytes(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

// CMS SignedData, detached content, SHA-256 + RSA, signer cert plus chain embedded.
export async function signDetached(content, { certPem, keyPem, chainPems = [], signingTime = new Date() }) {
  const certDer = pemToDer(certPem);
  const chainDer = chainPems.filter(Boolean).map(pemToDer);
  const key = await importRsaKey(keyPem);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));

  const attributes = [
    seq(oid(OID_CONTENT_TYPE), set(oid(OID_DATA))),
    seq(oid(OID_SIGNING_TIME), set(utcTime(signingTime))),
    seq(oid(OID_MESSAGE_DIGEST), set(octet(digest))),
  ].sort(compareBytes); // DER SET OF ordering

  const signedAttrsForSignature = tlv(0x31, ...attributes);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, signedAttrsForSignature));
  const { issuer, serial } = issuerAndSerial(certDer);
  const sha256Alg = seq(oid(OID_SHA256), derNull());

  const signerInfo = seq(
    integer(1),
    seq(issuer, serial),
    sha256Alg,
    tlv(0xa0, ...attributes),
    seq(oid(OID_RSA), derNull()),
    octet(signature),
  );

  const signedData = seq(
    integer(1),
    set(sha256Alg),
    seq(oid(OID_DATA)),
    tlv(0xa0, certDer, ...chainDer),
    set(signerInfo),
  );

  return seq(oid(OID_SIGNED_DATA), tlv(0xa0, signedData));
}

// ---------- ZIP (stored, no compression) ----------

const CRC_TABLE = (() => {
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
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    localParts.push(new Uint8Array(local.buffer), nameBytes, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(central.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralBytes = concat(...centralParts);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, centralParts.length / 2, true);
  end.setUint16(10, centralParts.length / 2, true);
  end.setUint32(12, centralBytes.length, true);
  end.setUint32(16, offset, true);

  return concat(...localParts, centralBytes, new Uint8Array(end.buffer));
}

// ---------- APNs: tell iPhones that a pass changed ----------

let apnsJwtCache = null;

async function apnsJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwtCache && apnsJwtCache.iat > now - 40 * 60) return apnsJwtCache.token;
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: env.APPLE_APNS_KEY_ID })));
  const claims = toBase64Url(encoder.encode(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now })));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.APPLE_APNS_KEY_P8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)));
  const token = `${header}.${claims}.${toBase64Url(signature)}`;
  apnsJwtCache = { token, iat: now };
  return token;
}

export async function pushApplePassUpdate(env, member) {
  if (!appleWalletConfigured(env) || !env.APPLE_APNS_KEY_P8 || !env.APPLE_APNS_KEY_ID) return;
  const registrations = await env.DB.prepare('SELECT device_library_id, push_token FROM loyalty_apple_registrations WHERE serial_number = ?')
    .bind(member.public_id).all();
  if (!registrations.results.length) return;

  const jwt = await apnsJwt(env);
  await Promise.all(registrations.results.map(async (registration) => {
    try {
      const response = await fetch(`https://api.push.apple.com/3/device/${registration.push_token}`, {
        method: 'POST',
        headers: { authorization: `bearer ${jwt}`, 'apns-topic': env.APPLE_PASS_TYPE_ID, 'apns-push-type': 'background', 'apns-priority': '5' },
        body: '{}',
      });
      if (response.status === 410) {
        await env.DB.prepare('DELETE FROM loyalty_apple_registrations WHERE device_library_id = ? AND serial_number = ?')
          .bind(registration.device_library_id, member.public_id).run();
      } else if (!response.ok) {
        console.error(JSON.stringify({ event: 'apns_failed', status: response.status, body: (await response.text()).slice(0, 200) }));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'apns_failed', message: error.message }));
    }
  }));
}
