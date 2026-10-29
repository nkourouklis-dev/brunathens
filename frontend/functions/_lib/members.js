// Πελάτες: κάρτες, sessions, QR, εισιτήρια σάρωσης. Κάθε συνάρτηση δουλεύει ΜΟΝΟ μέσα στην επιχείρηση που της δίνεις.
import {
  CARD_ALPHABET, HttpError, appSecret, cookieHeader, formatCardNumber, hmac, inDays, nowIso, randomString, randomToken,
  readCookie, sha256Hex, timingSafeEqual,
} from './core.js';

const SESSION_DAYS = 365;
export const QR_TTL_SECONDS = 120;
const SCAN_TICKET_TTL_SECONDS = 5 * 60;

export const memberCookieName = (business) => `kc_${business.slug}`;

// ---------- αναζήτηση ----------

export function getMemberById(env, businessId, id) {
  return env.DB.prepare('SELECT * FROM members WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, businessId).first();
}

export function getMemberByPublicId(env, businessId, publicId) {
  return env.DB.prepare('SELECT * FROM members WHERE public_id = ? AND business_id = ? AND deleted_at IS NULL').bind(String(publicId), businessId).first();
}

export function getMemberByEmail(env, businessId, email) {
  return env.DB.prepare('SELECT * FROM members WHERE business_id = ? AND email = ? AND deleted_at IS NULL').bind(businessId, email).first();
}

// Για το Apple Wallet: ο πελάτης βρίσκεται από το serial (public_id) και δίνει πίσω και την επιχείρησή του.
export function getMemberBySerial(env, publicId) {
  return env.DB.prepare('SELECT * FROM members WHERE public_id = ? AND deleted_at IS NULL').bind(String(publicId)).first();
}

// ---------- εγγραφή ----------

export async function createMember(env, business, { name, email, marketingOptIn }) {
  const now = nowIso();
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = randomString(20);
    const cardNumber = randomString(8, CARD_ALPHABET);
    const welcome = business.welcome_points;
    try {
      const statements = [
        env.DB.prepare(
          `INSERT INTO members (business_id, public_id, card_number, name, email, points, lifetime_points, terms_accepted_at, marketing_opt_in, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, ?7, ?7)`,
        ).bind(business.id, publicId, cardNumber, name, email, welcome, now, marketingOptIn ? 1 : 0),
      ];
      if (welcome > 0) {
        statements.push(env.DB.prepare(
          `INSERT INTO transactions (business_id, member_id, delta, kind, team_name, note, created_at)
           VALUES (?1, (SELECT id FROM members WHERE public_id = ?2), ?3, 'welcome', 'Κερδίσετο', 'Πόντοι καλωσορίσματος', ?4)`,
        ).bind(business.id, publicId, welcome, now));
      }
      await env.DB.batch(statements);
      return await getMemberByPublicId(env, business.id, publicId);
    } catch (error) {
      const message = String(error.message);
      if (/UNIQUE/i.test(message) && /email/i.test(message)) throw new HttpError(409, 'Email already registered');
      if (!/UNIQUE/i.test(message)) throw error;
      // σύγκρουση public_id / card_number: δοκιμάζουμε ξανά με νέες τυχαίες τιμές
    }
  }
  throw new Error('Could not allocate a card number');
}

export function checkJoinAllowed(business, code) {
  if (business.signup_mode === 'closed') throw new HttpError(403, 'Signup closed');
  if (business.signup_mode === 'code' && !timingSafeEqual(String(code || ''), business.join_code)) throw new HttpError(403, 'Invalid join code');
}

// ---------- παρουσίαση ----------

// Πόντοι → πρόοδος προς το επόμενο δώρο. Το «επόμενο» είναι το φθηνότερο δώρο που δεν έχει ακόμα κερδηθεί.
export function rewardProgress(points, rewards) {
  const active = rewards.filter((reward) => reward.active !== false).sort((a, b) => a.cost - b.cost);
  const items = active.map((reward) => ({ ...reward, affordable: points >= reward.cost, remaining: Math.max(0, reward.cost - points) }));
  const next = items.find((reward) => !reward.affordable) || null;
  const target = next ? next.cost : (items.length ? items[0].cost : 0);
  return {
    rewards: items,
    next: next ? { id: next.id, name: next.name, cost: next.cost, remaining: next.remaining } : null,
    target,
    filled: target ? Math.min(points, target) : 0,
    availableCount: items.filter((reward) => reward.affordable).length,
  };
}

export function publicMember(member, rewards) {
  const progress = rewardProgress(member.points, rewards);
  return {
    name: member.name,
    email: member.email,
    cardNumber: formatCardNumber(member.card_number),
    points: member.points,
    lifetimePoints: member.lifetime_points,
    visits: member.visits,
    rewardsRedeemed: member.rewards_redeemed,
    marketingOptIn: Boolean(member.marketing_opt_in),
    emailVerified: Boolean(member.email_verified_at),
    createdAt: member.created_at,
    updatedAt: member.updated_at,
    progress,
  };
}

// Τι βλέπει το ταμείο για έναν πελάτη.
export function memberForTeam(member, rewards) {
  const progress = rewardProgress(member.points, rewards);
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    cardNumber: formatCardNumber(member.card_number),
    points: member.points,
    lifetimePoints: member.lifetime_points,
    visits: member.visits,
    rewardsRedeemed: member.rewards_redeemed,
    lastEarnAt: member.last_earn_at,
    createdAt: member.created_at,
    rewards: progress.rewards,
    availableCount: progress.availableCount,
  };
}

export async function recentTransactions(env, businessId, memberId, limit = 20) {
  const rows = await env.DB.prepare(
    'SELECT id, delta, kind, reward_name, created_at FROM transactions WHERE business_id = ? AND member_id = ? ORDER BY id DESC LIMIT ?',
  ).bind(businessId, memberId, limit).all();
  return rows.results.map((row) => ({ id: row.id, delta: row.delta, kind: row.kind, rewardName: row.reward_name || '', createdAt: row.created_at }));
}

// ---------- sessions πελάτη ----------

export async function startMemberSession(env, request, business, memberId) {
  const token = randomToken(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM member_sessions WHERE member_id = ? AND expires_at < ?').bind(memberId, nowIso()),
    env.DB.prepare('INSERT INTO member_sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), memberId, inDays(SESSION_DAYS)),
  ]);
  return cookieHeader(request, memberCookieName(business), token, SESSION_DAYS * 86400);
}

export async function endMemberSession(env, request, business) {
  const token = readCookie(request, memberCookieName(business));
  if (token) await env.DB.prepare('DELETE FROM member_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return cookieHeader(request, memberCookieName(business), '', 0);
}

export async function getSessionMember(env, request, business) {
  const token = readCookie(request, memberCookieName(business));
  if (!token || token.length > 100) return null;
  return env.DB.prepare(
    `SELECT m.* FROM member_sessions s JOIN members m ON m.id = s.member_id
     WHERE s.token_hash = ? AND m.business_id = ? AND s.expires_at > ? AND m.deleted_at IS NULL`,
  ).bind(await sha256Hex(token), business.id, nowIso()).first();
}

export async function requireMember(env, request, business) {
  const member = await getSessionMember(env, request, business);
  if (!member) throw new HttpError(401, 'Not signed in');
  return member;
}

// ---------- QR ----------
// Στην εφαρμογή (ανανεώνεται, λήγει σε 2′):  KT:R:<publicId>:<exp>:<nonce>:<sig>
// Στο Wallet (σταθερό):                       KT:S:<publicId>:<qrVersion>:<sig>
// Χειροκίνητα: ο 8ψήφιος αριθμός κάρτας.

export async function rotatingQrToken(env, member) {
  const exp = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
  const nonce = randomString(10);
  const sig = await hmac(appSecret(env), `R|${member.public_id}|${exp}|${nonce}`, 16);
  return { token: `KT:R:${member.public_id}:${exp}:${nonce}:${sig}`, expiresAt: exp * 1000 };
}

export async function staticQrToken(env, member) {
  const sig = await hmac(appSecret(env), `S|${member.public_id}|${member.qr_version}`, 16);
  return `KT:S:${member.public_id}:${member.qr_version}:${sig}`;
}

// Μετατρέπει ό,τι σκανάρισε ή πληκτρολόγησε το ταμείο σε πελάτη της ΙΔΙΑΣ επιχείρησης + μοναδικό «id σάρωσης».
export async function resolveScannedCode(env, business, rawCode) {
  const code = String(rawCode || '').trim().slice(0, 200);
  const secret = appSecret(env);

  if (code.startsWith('KT:R:')) {
    const [, , publicId, exp, nonce, sig] = code.split(':');
    const expected = await hmac(secret, `R|${publicId}|${exp}|${nonce}`, 16);
    if (!sig || !timingSafeEqual(sig, expected)) throw new HttpError(400, 'Invalid code');
    if (Number(exp) * 1000 < Date.now()) throw new HttpError(400, 'Code expired');
    const member = await getMemberByPublicId(env, business.id, publicId);
    if (!member) throw new HttpError(404, 'Member not found');
    return { member, ticketId: `r:${nonce}`, source: 'app' };
  }

  if (code.startsWith('KT:S:')) {
    const [, , publicId, version, sig] = code.split(':');
    const expected = await hmac(secret, `S|${publicId}|${version}`, 16);
    if (!sig || !timingSafeEqual(sig, expected)) throw new HttpError(400, 'Invalid code');
    const member = await getMemberByPublicId(env, business.id, publicId);
    if (!member) throw new HttpError(404, 'Member not found');
    if (String(member.qr_version) !== version) throw new HttpError(400, 'Code replaced');
    return { member, ticketId: `s:${randomString(12)}`, source: 'wallet' };
  }

  const cardNumber = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cardNumber.length !== 8) throw new HttpError(400, 'Invalid code');
  const member = await env.DB.prepare('SELECT * FROM members WHERE card_number = ? AND business_id = ? AND deleted_at IS NULL').bind(cardNumber, business.id).first();
  if (!member) throw new HttpError(404, 'Member not found');
  return { member, ticketId: `m:${randomString(12)}`, source: 'manual' };
}

// Το «εισιτήριο» δένει τις κινήσεις πόντων με μια πραγματική σάρωση: δεν δίνονται πόντοι σε τυχαίο id.
export async function issueScanTicket(env, business, memberId, ticketId) {
  const exp = Math.floor(Date.now() / 1000) + SCAN_TICKET_TTL_SECONDS;
  const body = `${memberId}.${ticketId}.${exp}`;
  return `${body}.${await hmac(appSecret(env), `T|${business.id}|${body}`, 16)}`;
}

export async function verifyScanTicket(env, business, ticket) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 4) throw new HttpError(400, 'Invalid scan');
  const [memberId, ticketId, exp, sig] = parts;
  const expected = await hmac(appSecret(env), `T|${business.id}|${memberId}.${ticketId}.${exp}`, 16);
  if (!timingSafeEqual(sig, expected)) throw new HttpError(400, 'Invalid scan');
  if (Number(exp) * 1000 < Date.now()) throw new HttpError(400, 'Scan expired');
  return { memberId: Number(memberId), ticketId };
}
