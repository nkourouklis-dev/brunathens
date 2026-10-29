// Διαχείριση πλατφόρμας: δημιουργία επιχειρήσεων, πρόσκληση ιδιοκτήτη, αναστολή. Μόνο για τον διαχειριστή (PLATFORM_ADMIN_KEY).
import {
  HttpError, clientIp, cleanText, cookieHeader, hashPassword, json, normalizeEmail, readJson, requireRate,
} from '../core.js';
import {
  PLATFORM_COOKIE, createInvitation, isPlatformRequest, platformLogin, requirePlatform, startTeamSession, validatePassword,
} from '../auth.js';
import { availableSlug, createBusiness, getBusinessById, listRewards, validateSlug } from '../business.js';

async function platformBusinesses(env) {
  const rows = await env.DB.prepare(
    `SELECT b.id, b.slug, b.name, b.icon, b.color, b.status, b.signup_mode, b.created_at, (b.logo IS NOT NULL) AS has_logo, b.logo_version,
            (SELECT COUNT(*) FROM members m WHERE m.business_id = b.id AND m.deleted_at IS NULL) AS members,
            (SELECT COUNT(*) FROM team_members t WHERE t.business_id = b.id AND t.active = 1) AS team,
            (SELECT COUNT(*) FROM team_members t WHERE t.business_id = b.id AND t.role = 'owner' AND t.active = 1) AS owners,
            (SELECT MAX(created_at) FROM transactions x WHERE x.business_id = b.id) AS last_activity
     FROM businesses b ORDER BY b.created_at DESC`,
  ).all();
  return rows.results.map((row) => ({
    id: row.id, slug: row.slug, name: row.name, icon: row.icon, color: row.color, status: row.status, signupMode: row.signup_mode,
    hasLogo: Boolean(row.has_logo), logoVersion: row.logo_version, createdAt: row.created_at,
    members: row.members, team: row.team, owners: row.owners, lastActivity: row.last_activity,
  }));
}

export async function handlePlatform(ctx, segments) {
  const { env, request, method } = ctx;
  const [first, second, third] = segments;

  if (method === 'POST' && first === 'login') {
    const { key } = await readJson(request);
    return json({ ok: true }, 200, { 'Set-Cookie': await platformLogin(env, request, key) });
  }

  if (method === 'POST' && first === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(request, PLATFORM_COOKIE, '', 0) });
  }

  if (method === 'GET' && first === 'me') {
    return json({ authenticated: await isPlatformRequest(env, request), selfSignup: env.SELF_SIGNUP === '1' });
  }

  if (first !== 'businesses') return null;
  await requirePlatform(env, request);

  if (method === 'GET' && !second) return json({ businesses: await platformBusinesses(env) });

  // Νέα επιχείρηση + πρόσκληση ιδιοκτήτη (link μίας χρήσης, 7 μέρες).
  if (method === 'POST' && !second) {
    const payload = await readJson(request);
    const business = await createBusiness(env, {
      name: payload.name,
      slug: payload.slug ? validateSlug(payload.slug) : await availableSlug(env, payload.name),
      tagline: payload.tagline,
      color: payload.color,
      icon: payload.icon,
      contactEmail: payload.contactEmail,
    });
    const invitation = await createInvitation(env, { business, role: 'owner', label: payload.ownerName });
    return json({
      business: { id: business.id, slug: business.slug, name: business.name },
      inviteUrl: `${ctx.url.origin}/invite/${invitation.token}`,
      businesses: await platformBusinesses(env),
    }, 201);
  }

  const business = second ? await getBusinessById(env, Number(second)) : null;
  if (!business) throw new HttpError(404, 'Business not found');

  // Νέο link ιδιοκτήτη (π.χ. ξεχάστηκε ή έληξε το πρώτο).
  if (method === 'POST' && third === 'invite-owner') {
    const invitation = await createInvitation(env, { business, role: 'owner' });
    return json({ inviteUrl: `${ctx.url.origin}/invite/${invitation.token}` });
  }

  if (method === 'PATCH' && !third) {
    const { status } = await readJson(request);
    if (!['active', 'suspended'].includes(status)) throw new HttpError(400, 'Invalid setting');
    await env.DB.prepare('UPDATE businesses SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), business.id).run();
    return json({ businesses: await platformBusinesses(env) });
  }

  // Είσοδος υποστήριξης: ανοίγει το περιβάλλον του πρώτου ιδιοκτήτη, ώστε ο διαχειριστής να βοηθήσει στη ρύθμιση.
  if (method === 'POST' && third === 'open') {
    const owner = await env.DB.prepare(
      "SELECT id, name, role FROM team_members WHERE business_id = ? AND role = 'owner' AND active = 1 ORDER BY id LIMIT 1",
    ).bind(business.id).first();
    if (!owner) throw new HttpError(409, 'No owner yet');
    return json({ slug: business.slug }, 200, { 'Set-Cookie': await startTeamSession(env, request, business, owner) });
  }

  if (method === 'DELETE' && !third) {
    const { confirm } = await readJson(request);
    if (confirm !== business.slug) throw new HttpError(400, 'Confirmation required');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM apple_registrations WHERE serial_number IN (SELECT public_id FROM members WHERE business_id = ?)').bind(business.id),
      env.DB.prepare('DELETE FROM businesses WHERE id = ?').bind(business.id),
    ]);
    return json({ businesses: await platformBusinesses(env) });
  }

  if (method === 'GET' && third === 'rewards') return json({ rewards: await listRewards(env, business.id, { includeInactive: true }) });

  return null;
}

// Δημόσια δημιουργία επιχείρησης (μόνο αν SELF_SIGNUP=1): ο ιδιοκτήτης ορίζει email + κωδικό και μπαίνει κατευθείαν.
export async function handleSignup(ctx) {
  const { env, request, method } = ctx;
  if (method !== 'POST') return null;
  if (env.SELF_SIGNUP !== '1') throw new HttpError(403, 'Signup disabled');
  await requireRate(env, `signup-ip:${clientIp(request)}`, 3, 3600);

  const payload = await readJson(request);
  const ownerName = cleanText(payload.ownerName, 60);
  const email = normalizeEmail(payload.email);
  if (ownerName.length < 2) throw new HttpError(400, 'Name required');
  if (!email) throw new HttpError(400, 'Invalid email');
  const passwordHash = await hashPassword(validatePassword(payload.password));

  const business = await createBusiness(env, {
    name: payload.businessName, slug: await availableSlug(env, payload.businessName), contactEmail: email,
  });
  const owner = await env.DB.prepare(
    "INSERT INTO team_members (business_id, name, role, email, password_hash) VALUES (?, ?, 'owner', ?, ?) RETURNING id, name, role",
  ).bind(business.id, ownerName, email, passwordHash).first();
  return json({ slug: business.slug }, 201, { 'Set-Cookie': await startTeamSession(env, request, business, owner) });
}
