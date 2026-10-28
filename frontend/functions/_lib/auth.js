// Ταυτοποίηση: ομάδα επιχείρησης (owner/manager/staff), διαχειριστής πλατφόρμας, προσκλήσεις.
import {
  HttpError, appSecret, clientIp, cookieHeader, hashPassword, hmac, inDays, isoToMs, nowIso, normalizeEmail, cleanText,
  randomToken, readCookie, requireRate, sha256Hex, timingSafeEqual, toBase64Url, fromBase64Url, verifyPassword,
} from './core.js';

const TEAM_SESSION_DAYS = 30;
const PLATFORM_SESSION_HOURS = 12;
const INVITATION_DAYS = 7;
const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };

export const teamCookieName = (business) => `kt_${business.slug}`;
export const PLATFORM_COOKIE = 'kt_platform';

// ---------- ομάδα: sessions ----------

export async function startTeamSession(env, request, business, member) {
  const token = randomToken(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM team_sessions WHERE member_id = ? AND expires_at < ?').bind(member.id, nowIso()),
    env.DB.prepare('INSERT INTO team_sessions (token_hash, member_id, business_id, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), member.id, business.id, inDays(TEAM_SESSION_DAYS)),
    env.DB.prepare('UPDATE team_members SET last_login_at = ? WHERE id = ?').bind(nowIso(), member.id),
  ]);
  return cookieHeader(request, teamCookieName(business), token, TEAM_SESSION_DAYS * 86400);
}

export async function endTeamSession(env, request, business) {
  const token = readCookie(request, teamCookieName(business));
  if (token) await env.DB.prepare('DELETE FROM team_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return cookieHeader(request, teamCookieName(business), '', 0);
}

export async function getTeamIdentity(env, request, business) {
  const token = readCookie(request, teamCookieName(business));
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `SELECT t.id, t.name, t.role, t.email FROM team_sessions s
     JOIN team_members t ON t.id = s.member_id
     WHERE s.token_hash = ? AND s.business_id = ? AND t.business_id = ? AND t.active = 1 AND s.expires_at > ?`,
  ).bind(await sha256Hex(token), business.id, business.id, nowIso()).first();
  return row ? { id: row.id, name: row.name, role: row.role, email: row.email } : null;
}

// Ελάχιστος ρόλος: 'staff' (ταμείο), 'manager', 'owner'. Η διαχειριστής πλατφόρμας δεν μπαίνει εδώ: χρησιμοποιεί «άνοιγμα ως ιδιοκτήτης».
export async function requireTeam(env, request, business, minRole = 'staff') {
  if (business.status !== 'active') throw new HttpError(403, 'Business suspended');
  const identity = await getTeamIdentity(env, request, business);
  if (!identity) throw new HttpError(401, 'Admin authorization required');
  if (ROLE_RANK[identity.role] < ROLE_RANK[minRole]) throw new HttpError(403, 'Not allowed');
  return identity;
}

export const canManageRole = (actorRole, targetRole) => ROLE_RANK[actorRole] > ROLE_RANK[targetRole] || actorRole === 'owner';

// ---------- ομάδα: σύνδεση ----------

export async function pinLookup(env, business, pin) {
  return hmac(appSecret(env), `PIN|${business.id}|${pin}`, 32);
}

export function validatePin(value) {
  const pin = String(value || '').trim();
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'PIN must be 6 digits');
  return pin;
}

export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Password too short');
  return password;
}

export async function loginWithPin(env, request, business, rawPin) {
  const ip = clientIp(request);
  await requireRate(env, `pin-ip:${business.id}:${ip}`, 10, 900);
  await requireRate(env, `pin-biz:${business.id}`, 60, 900);
  const pin = String(rawPin || '').trim();
  if (!/^\d{6}$/.test(pin)) throw new HttpError(401, 'Wrong PIN');
  const member = await env.DB.prepare(
    'SELECT id, name, role FROM team_members WHERE business_id = ? AND pin_lookup = ? AND active = 1',
  ).bind(business.id, await pinLookup(env, business, pin)).first();
  if (!member) throw new HttpError(401, 'Wrong PIN');
  return member;
}

export async function loginWithPassword(env, request, business, rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  const ip = clientIp(request);
  await requireRate(env, `login-ip:${business.id}:${ip}`, 10, 900);
  if (email) await requireRate(env, `login-email:${business.id}:${email}`, 10, 900);
  const member = email
    ? await env.DB.prepare('SELECT id, name, role, password_hash FROM team_members WHERE business_id = ? AND email = ? AND active = 1').bind(business.id, email).first()
    : null;
  // Ίδιος χρόνος απάντησης είτε υπάρχει ο χρήστης είτε όχι.
  const ok = await verifyPassword(String(password || ''), member?.password_hash || 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if (!member || !ok) throw new HttpError(401, 'Wrong email or password');
  return member;
}

// ---------- διαχειριστής πλατφόρμας ----------

export function platformKey(env) {
  return env.PLATFORM_ADMIN_KEY || env.ADMIN_ACCESS_KEY || '';
}

export async function platformLogin(env, request, key) {
  const expected = platformKey(env);
  if (!expected) throw new HttpError(503, 'Platform admin not configured');
  await requireRate(env, `platform-ip:${clientIp(request)}`, 8, 900);
  if (!timingSafeEqual(String(key || ''), expected)) throw new HttpError(401, 'Wrong key');
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + PLATFORM_SESSION_HOURS * 3600 })));
  const token = `${payload}.${await hmac(appSecret(env), `PLATFORM|${payload}`, 32)}`;
  return cookieHeader(request, PLATFORM_COOKIE, token, PLATFORM_SESSION_HOURS * 3600);
}

export async function isPlatformRequest(env, request) {
  if (!platformKey(env)) return false;
  const token = readCookie(request, PLATFORM_COOKIE);
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  try {
    const expected = await hmac(appSecret(env), `PLATFORM|${payload}`, 32);
    if (!timingSafeEqual(signature, expected)) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return Number(exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function requirePlatform(env, request) {
  if (!await isPlatformRequest(env, request)) throw new HttpError(401, 'Platform authorization required');
}

// ---------- προσκλήσεις ----------

export async function createInvitation(env, { business, role, label = '', createdBy = null }) {
  const token = randomToken(24);
  const expiresAt = inDays(INVITATION_DAYS);
  const row = await env.DB.prepare(
    `INSERT INTO invitations (business_id, role, label, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(business.id, role, cleanText(label, 60) || null, await sha256Hex(token), createdBy, expiresAt).first();
  return { id: row.id, token, expiresAt };
}

function invitationStatus(row) {
  if (row.revoked_at) return 'revoked';
  if (row.used_at) return 'used';
  if (isoToMs(row.expires_at) < Date.now()) return 'expired';
  return 'pending';
}

export async function listInvitations(env, businessId) {
  const rows = await env.DB.prepare(
    `SELECT i.id, i.role, i.label, i.expires_at, i.used_at, i.revoked_at, i.created_at, t.name AS used_by_name
     FROM invitations i LEFT JOIN team_members t ON t.id = i.used_by
     WHERE i.business_id = ? ORDER BY i.id DESC LIMIT 50`,
  ).bind(businessId).all();
  return rows.results.map((row) => ({
    id: row.id, role: row.role, label: row.label || '', status: invitationStatus(row),
    expiresAt: row.expires_at, usedByName: row.used_by_name || '', createdAt: row.created_at,
  }));
}

export async function revokeInvitation(env, businessId, invitationId) {
  const result = await env.DB.prepare(
    'UPDATE invitations SET revoked_at = ? WHERE id = ? AND business_id = ? AND used_at IS NULL AND revoked_at IS NULL',
  ).bind(nowIso(), invitationId, businessId).run();
  if (!result.meta?.changes) throw new HttpError(404, 'Invitation not found');
}

export async function findInvitation(env, token) {
  const value = String(token || '');
  if (value.length < 20 || value.length > 100) return null;
  const row = await env.DB.prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(await sha256Hex(value)).first();
  if (!row || invitationStatus(row) !== 'pending') return null;
  return row;
}

// Χρησιμοποιεί την πρόσκληση: δημιουργεί το μέλος της ομάδας. Η πρόσκληση «δεσμεύεται» πρώτη, ώστε να μη δουλέψει δύο φορές.
export async function acceptInvitation(env, invitation, business, payload) {
  const name = cleanText(payload.name, 60);
  if (name.length < 2) throw new HttpError(400, 'Name required');

  let email = null;
  let passwordHash = null;
  let pinHash = null;
  if (invitation.role === 'staff') {
    pinHash = await pinLookup(env, business, validatePin(payload.pin));
  } else {
    email = normalizeEmail(payload.email);
    if (!email) throw new HttpError(400, 'Invalid email');
    passwordHash = await hashPassword(validatePassword(payload.password));
  }

  const claim = await env.DB.prepare(
    `UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
  ).bind(nowIso(), invitation.id, nowIso()).run();
  if (!claim.meta?.changes) throw new HttpError(410, 'Invitation unavailable');

  try {
    const member = await env.DB.prepare(
      `INSERT INTO team_members (business_id, name, role, email, password_hash, pin_lookup) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, role`,
    ).bind(business.id, name, invitation.role, email, passwordHash, pinHash).first();
    await env.DB.prepare('UPDATE invitations SET used_by = ? WHERE id = ?').bind(member.id, invitation.id).run();
    return member;
  } catch (error) {
    await env.DB.prepare('UPDATE invitations SET used_at = NULL WHERE id = ?').bind(invitation.id).run();
    if (/UNIQUE/i.test(error.message) && /pin/i.test(error.message)) throw new HttpError(409, 'PIN in use');
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'Email taken');
    throw error;
  }
}

// ---------- ομάδα: διαχείριση ----------

export async function listTeam(env, businessId) {
  const rows = await env.DB.prepare(
    `SELECT id, name, role, email, (pin_lookup IS NOT NULL) AS has_pin, active, last_login_at, created_at
     FROM team_members WHERE business_id = ? ORDER BY active DESC, CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, id`,
  ).bind(businessId).all();
  return rows.results.map((row) => ({
    id: row.id, name: row.name, role: row.role, email: row.email || '', hasPin: Boolean(row.has_pin),
    active: Boolean(row.active), lastLoginAt: row.last_login_at, createdAt: row.created_at,
  }));
}

export async function updateTeamMember(env, business, actor, memberId, payload) {
  const target = await env.DB.prepare('SELECT id, role, active FROM team_members WHERE id = ? AND business_id = ?').bind(memberId, business.id).first();
  if (!target) throw new HttpError(404, 'Member not found');
  if (target.id === actor.id) throw new HttpError(403, 'Not allowed');
  if (!canManageRole(actor.role, target.role) || (actor.role !== 'owner' && target.role !== 'staff')) throw new HttpError(403, 'Not allowed');

  const sets = [];
  const binds = [];
  if (typeof payload.active === 'boolean') { sets.push('active = ?'); binds.push(payload.active ? 1 : 0); }
  if (payload.name !== undefined) {
    const name = cleanText(payload.name, 60);
    if (name.length < 2) throw new HttpError(400, 'Name required');
    sets.push('name = ?'); binds.push(name);
  }
  if (payload.pin !== undefined) {
    if (target.role !== 'staff') throw new HttpError(400, 'PIN only for staff');
    sets.push('pin_lookup = ?'); binds.push(await pinLookup(env, business, validatePin(payload.pin)));
  }
  if (!sets.length) return;
  try {
    await env.DB.prepare(`UPDATE team_members SET ${sets.join(', ')} WHERE id = ? AND business_id = ?`).bind(...binds, memberId, business.id).run();
  } catch (error) {
    if (/UNIQUE/i.test(error.message)) throw new HttpError(409, 'PIN in use');
    throw error;
  }
  if (payload.active === false || payload.pin !== undefined) {
    await env.DB.prepare('DELETE FROM team_sessions WHERE member_id = ?').bind(memberId).run();
  }
}

export async function changeOwnPassword(env, business, actor, currentPassword, newPassword) {
  const row = await env.DB.prepare('SELECT password_hash FROM team_members WHERE id = ? AND business_id = ?').bind(actor.id, business.id).first();
  if (!row?.password_hash) throw new HttpError(400, 'No password set');
  if (!await verifyPassword(String(currentPassword || ''), row.password_hash)) throw new HttpError(401, 'Wrong email or password');
  await env.DB.prepare('UPDATE team_members SET password_hash = ? WHERE id = ?').bind(await hashPassword(validatePassword(newPassword)), actor.id).run();
}
