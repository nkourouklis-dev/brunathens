// /api/b/<slug>/team/... — ταμείο (staff) και διαχείριση (manager / owner) μιας επιχείρησης.
//
//   staff:    login, me, lookup, earn, redeem, undo, activity
//   manager:  members, stats, adjust, staff + invitations (μόνο staff)
//   owner:    settings, rewards, join-code, invitations (όλοι οι ρόλοι), password
import { HttpError, clientIp, emailConfigured, escapeHtml, json, nowIso, readJson, requireRate, sendEmail, normalizeEmail } from '../core.js';
import { ROLE_LABELS } from '../../../shared/constants.js';
import {
  getBusinessById, listRewards, parseRewardInput, pointsRules, rotateJoinCode, teamBusiness, updateBusinessSettings,
} from '../business.js';
import {
  changeOwnPassword, createInvitation, endTeamSession, listInvitations, listTeam, loginWithPassword, loginWithPin, requireTeam, revokeInvitation,
  startTeamSession, updateTeamMember,
} from '../auth.js';
import {
  getMemberById, issueScanTicket, memberForTeam, recentTransactions, resolveScannedCode, verifyScanTicket,
} from '../members.js';
import { adjustPoints, earnPoints, notifyWallets, redeemReward, undoTransaction } from '../points.js';
import { pushGoogleClassUpdate } from '../google-wallet.js';

const MAX_REWARDS = 30;

function likeEscape(text) {
  return String(text).replace(/[\\%_]/g, (character) => `\\${character}`);
}

async function teamMe(env, business, identity) {
  return {
    identity: { id: identity.id, name: identity.name, role: identity.role, email: identity.email || '' },
    business: teamBusiness(business, await listRewards(env, business.id, { includeInactive: true }), env),
    emailEnabled: emailConfigured(env),
  };
}

async function activity(env, business, limit = 40) {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.delta, t.kind, t.reward_name, t.note, t.team_name, t.created_at, t.reverses_id, t.member_id,
            m.name AS member_name, m.card_number,
            EXISTS (SELECT 1 FROM transactions r WHERE r.reverses_id = t.id) AS undone
     FROM transactions t JOIN members m ON m.id = t.member_id
     WHERE t.business_id = ? ORDER BY t.id DESC LIMIT ?`,
  ).bind(business.id, limit).all();
  return rows.results.map((row) => ({
    id: row.id, delta: row.delta, kind: row.kind, rewardName: row.reward_name || '', note: row.note || '', teamName: row.team_name,
    createdAt: row.created_at, memberId: row.member_id, memberName: row.member_name, undone: Boolean(row.undone),
  }));
}

async function stats(env, business) {
  const day = 86_400_000;
  const since = (days) => nowIso(new Date(Date.now() - days * day));
  const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
  const [counts, series, top] = await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM members WHERE business_id = ?1 AND deleted_at IS NULL) AS total,
         (SELECT COUNT(*) FROM members WHERE business_id = ?1 AND deleted_at IS NULL AND created_at >= ?2) AS new7,
         (SELECT COUNT(*) FROM members WHERE business_id = ?1 AND deleted_at IS NULL AND created_at >= ?3) AS new30,
         (SELECT COUNT(*) FROM transactions WHERE business_id = ?1 AND kind = 'earn' AND created_at >= ?4) AS visitsToday,
         (SELECT COUNT(*) FROM transactions WHERE business_id = ?1 AND kind = 'earn' AND created_at >= ?2) AS visits7,
         (SELECT COUNT(*) FROM transactions WHERE business_id = ?1 AND kind = 'earn' AND created_at >= ?3) AS visits30,
         (SELECT COALESCE(SUM(delta), 0) FROM transactions WHERE business_id = ?1 AND kind = 'earn' AND created_at >= ?3) AS points30,
         (SELECT COUNT(*) FROM transactions t WHERE t.business_id = ?1 AND t.kind = 'redeem' AND t.created_at >= ?3
            AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.reverses_id = t.id)) AS redeemed30,
         (SELECT COUNT(DISTINCT member_id) FROM transactions WHERE business_id = ?1 AND kind = 'earn' AND created_at >= ?3) AS active30`,
    ).bind(business.id, since(7), since(30), nowIso(startOfToday)),
    env.DB.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS visits FROM transactions
       WHERE business_id = ? AND kind = 'earn' AND created_at >= ? GROUP BY day ORDER BY day`,
    ).bind(business.id, since(14)),
    env.DB.prepare(
      `SELECT id, name, points, lifetime_points, visits FROM members WHERE business_id = ? AND deleted_at IS NULL ORDER BY visits DESC, lifetime_points DESC LIMIT 5`,
    ).bind(business.id),
  ]);
  return { ...counts.results[0], series: series.results, top: top.results };
}

export async function handleTeam(ctx, business, segments) {
  const { env, request, method } = ctx;
  const [first, second, third] = segments;

  // ---- σύνδεση / αποσύνδεση ----
  if (method === 'POST' && first === 'login') {
    const payload = await readJson(request);
    const member = payload.pin !== undefined
      ? await loginWithPin(env, request, business, payload.pin)
      : await loginWithPassword(env, request, business, payload.email, payload.password);
    return json({ identity: { id: member.id, name: member.name, role: member.role } }, 200, { 'Set-Cookie': await startTeamSession(env, request, business, member) });
  }

  if (method === 'POST' && first === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': await endTeamSession(env, request, business) });
  }

  // ---- ταμείο (staff και πάνω) ----
  if (method === 'GET' && first === 'me') {
    const identity = await requireTeam(env, request, business, 'staff');
    return json(await teamMe(env, business, identity));
  }

  if (method === 'POST' && first === 'lookup') {
    const team = await requireTeam(env, request, business, 'staff');
    await requireRate(env, `scan:${business.id}:${team.id}`, 120, 60);
    const payload = await readJson(request);
    const { member, ticketId, source } = await resolveScannedCode(env, business, payload.code);
    const rewards = await listRewards(env, business.id);
    return json({
      ticket: await issueScanTicket(env, business, member.id, ticketId),
      source,
      member: memberForTeam(member, rewards),
      rules: pointsRules(business),
      recent: await recentTransactions(env, business.id, member.id, 5),
    });
  }

  if (method === 'POST' && (first === 'earn' || first === 'redeem')) {
    const team = await requireTeam(env, request, business, 'staff');
    const payload = await readJson(request);
    const { memberId, ticketId } = await verifyScanTicket(env, business, payload.ticket);
    const member = await getMemberById(env, business.id, memberId);
    if (!member) throw new HttpError(404, 'Member not found');

    const result = first === 'earn'
      ? await earnPoints(env, {
        business, member, team, scanTicket: ticketId, force: payload.force === true,
        points: payload.points === undefined ? business.points_per_visit : Number(payload.points),
      })
      : await redeemReward(env, { business, member, team, scanTicket: ticketId, rewardId: payload.rewardId });

    const rewards = await listRewards(env, business.id);
    notifyWallets(env, ctx.waitUntil, business, result.member, rewards);
    return json({
      transactionId: result.transactionId,
      member: memberForTeam(result.member, rewards),
      recent: await recentTransactions(env, business.id, member.id, 5),
    });
  }

  if (method === 'POST' && first === 'undo') {
    const team = await requireTeam(env, request, business, 'staff');
    const payload = await readJson(request);
    const result = await undoTransaction(env, { business, transactionId: payload.transactionId, team });
    const rewards = await listRewards(env, business.id);
    notifyWallets(env, ctx.waitUntil, business, result.member, rewards);
    return json({ member: memberForTeam(result.member, rewards) });
  }

  if (method === 'GET' && first === 'activity') {
    await requireTeam(env, request, business, 'staff');
    return json({ transactions: await activity(env, business) });
  }

  // ---- υπεύθυνος (manager και πάνω) ----
  if (method === 'GET' && first === 'members' && !second) {
    await requireTeam(env, request, business, 'manager');
    const q = String(ctx.url.searchParams.get('q') || '').trim().slice(0, 60);
    const limit = Math.min(100, Math.max(1, Number(ctx.url.searchParams.get('limit')) || 50));
    const offset = Math.max(0, Number(ctx.url.searchParams.get('offset')) || 0);
    const like = `%${likeEscape(q)}%`;
    const rows = q
      ? await env.DB.prepare(
        `SELECT * FROM members WHERE business_id = ? AND deleted_at IS NULL
           AND (name LIKE ?2 ESCAPE '\\' OR email LIKE ?2 ESCAPE '\\' OR card_number LIKE ?2 ESCAPE '\\')
         ORDER BY created_at DESC LIMIT ?3 OFFSET ?4`,
      ).bind(business.id, like, limit, offset).all()
      : await env.DB.prepare('SELECT * FROM members WHERE business_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(business.id, limit, offset).all();
    const rewards = await listRewards(env, business.id);
    return json({ members: rows.results.map((row) => memberForTeam(row, rewards)) });
  }

  if (first === 'members' && second && third === 'adjust' && method === 'POST') {
    const team = await requireTeam(env, request, business, 'manager');
    const payload = await readJson(request);
    const member = await getMemberById(env, business.id, Number(second));
    if (!member) throw new HttpError(404, 'Member not found');
    const result = await adjustPoints(env, { business, member, team, delta: Number(payload.delta), note: String(payload.note || '').slice(0, 120) || null });
    const rewards = await listRewards(env, business.id);
    notifyWallets(env, ctx.waitUntil, business, result.member, rewards);
    return json({ member: memberForTeam(result.member, rewards) });
  }

  if (method === 'GET' && first === 'members' && second) {
    await requireTeam(env, request, business, 'manager');
    const member = await getMemberById(env, business.id, Number(second));
    if (!member) throw new HttpError(404, 'Member not found');
    const rows = await env.DB.prepare(
      `SELECT t.id, t.delta, t.kind, t.reward_name, t.note, t.team_name, t.created_at,
              EXISTS (SELECT 1 FROM transactions r WHERE r.reverses_id = t.id) AS undone
       FROM transactions t WHERE t.business_id = ? AND t.member_id = ? ORDER BY t.id DESC LIMIT 60`,
    ).bind(business.id, member.id).all();
    return json({
      member: memberForTeam(member, await listRewards(env, business.id)),
      transactions: rows.results.map((row) => ({
        id: row.id, delta: row.delta, kind: row.kind, rewardName: row.reward_name || '', note: row.note || '', teamName: row.team_name, createdAt: row.created_at, undone: Boolean(row.undone),
      })),
    });
  }

  if (method === 'GET' && first === 'stats') {
    await requireTeam(env, request, business, 'manager');
    return json({ stats: await stats(env, business) });
  }

  // ---- ομάδα και προσκλήσεις ----
  if (method === 'GET' && first === 'staff' && !second) {
    await requireTeam(env, request, business, 'manager');
    return json({ team: await listTeam(env, business.id), invitations: await listInvitations(env, business.id) });
  }

  if (method === 'PATCH' && first === 'staff' && second) {
    const actor = await requireTeam(env, request, business, 'manager');
    await updateTeamMember(env, business, actor, Number(second), await readJson(request));
    return json({ team: await listTeam(env, business.id) });
  }

  if (method === 'POST' && first === 'invitations' && !second) {
    const actor = await requireTeam(env, request, business, 'manager');
    const payload = await readJson(request);
    const allowed = actor.role === 'owner' ? ['owner', 'manager', 'staff'] : ['staff'];
    if (!allowed.includes(payload.role)) throw new HttpError(403, 'Not allowed');
    await requireRate(env, `invite:${business.id}`, 30, 3600);
    const invitation = await createInvitation(env, { business, role: payload.role, label: payload.label, createdBy: actor.id });
    const url = `${ctx.url.origin}/invite/${invitation.token}`;

    const email = normalizeEmail(payload.email);
    let emailSent = false;
    if (email && emailConfigured(env)) {
      try {
        await sendEmail(env, {
          to: email,
          fromName: business.name,
          subject: `Πρόσκληση στο ${business.name}`,
          text: `Σε προσκαλούν στην ομάδα του ${business.name} (${ROLE_LABELS[payload.role]}).\n\nΆνοιξε αυτό το link για να ολοκληρώσεις την εγγραφή σου (ισχύει 7 μέρες, μία φορά):\n${url}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:460px;color:#222"><p>Σε προσκαλούν στην ομάδα του <b>${escapeHtml(business.name)}</b> (${ROLE_LABELS[payload.role]}).</p>
            <p><a href="${url}" style="display:inline-block;background:${business.color};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ολοκλήρωση εγγραφής</a></p>
            <p style="color:#666;font-size:13px">Το link ισχύει 7 μέρες και μπορεί να χρησιμοποιηθεί μία φορά.</p></div>`,
        });
        emailSent = true;
      } catch { /* το link εμφανίζεται έτσι κι αλλιώς στον ιδιοκτήτη */ }
    }
    return json({ invitation: { id: invitation.id, url, expiresAt: invitation.expiresAt, role: payload.role }, emailSent, invitations: await listInvitations(env, business.id) });
  }

  if (method === 'DELETE' && first === 'invitations' && second) {
    await requireTeam(env, request, business, 'manager');
    await revokeInvitation(env, business.id, Number(second));
    return json({ invitations: await listInvitations(env, business.id) });
  }

  // ---- ιδιοκτήτης ----
  if (method === 'PUT' && first === 'settings') {
    const identity = await requireTeam(env, request, business, 'owner');
    const { brandingChanged } = await updateBusinessSettings(env, business, await readJson(request));
    const fresh = await getBusinessById(env, business.id);
    if (brandingChanged) ctx.waitUntil?.(pushGoogleClassUpdate(env, fresh, ctx.url.origin));
    return json(await teamMe(env, fresh, identity));
  }

  if (first === 'rewards') {
    const identity = await requireTeam(env, request, business, 'owner');
    if (method === 'POST' && !second) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM rewards WHERE business_id = ?').bind(business.id).first();
      if (count.n >= MAX_REWARDS) throw new HttpError(409, 'Too many rewards');
      const reward = parseRewardInput(await readJson(request));
      await env.DB.prepare('INSERT INTO rewards (business_id, name, description, cost, icon, active) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(business.id, reward.name, reward.description, reward.cost, reward.icon, reward.active).run();
    } else if (method === 'PUT' && second) {
      const reward = parseRewardInput(await readJson(request));
      const result = await env.DB.prepare('UPDATE rewards SET name = ?, description = ?, cost = ?, icon = ?, active = ? WHERE id = ? AND business_id = ?')
        .bind(reward.name, reward.description, reward.cost, reward.icon, reward.active, Number(second), business.id).run();
      if (!result.meta?.changes) throw new HttpError(404, 'Reward not found');
    } else if (method === 'DELETE' && second) {
      await env.DB.prepare('DELETE FROM rewards WHERE id = ? AND business_id = ?').bind(Number(second), business.id).run();
    } else {
      return null;
    }
    return json(await teamMe(env, business, identity));
  }

  if (method === 'POST' && first === 'join-code') {
    const identity = await requireTeam(env, request, business, 'owner');
    await rotateJoinCode(env, business.id);
    return json(await teamMe(env, await getBusinessById(env, business.id), identity));
  }

  if (method === 'POST' && first === 'password') {
    const actor = await requireTeam(env, request, business, 'manager');
    await requireRate(env, `pwd:${business.id}:${actor.id}:${clientIp(request)}`, 5, 900);
    const payload = await readJson(request);
    await changeOwnPassword(env, business, actor, payload.currentPassword, payload.newPassword);
    return json({ ok: true });
  }

  return null;
}
