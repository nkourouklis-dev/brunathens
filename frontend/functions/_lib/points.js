// Αλλαγές πόντων. Κάθε αλλαγή γράφει μία γραμμή στο ledger ΚΑΙ ενημερώνει το υπόλοιπο σε ένα D1 batch
// (transaction): αν αποτύχει κάτι, δεν γράφεται τίποτα. Το CHECK (points >= 0) δεν αφήνει αρνητικό υπόλοιπο.
import { HttpError, isoToMs, nowIso } from './core.js';
import { getMemberById } from './members.js';
import { pushApplePassUpdate } from './apple-pass.js';
import { pushGoogleWalletUpdate } from './google-wallet.js';

export function notifyWallets(env, waitUntil, business, member, rewards) {
  const work = Promise.allSettled([pushApplePassUpdate(env, member), pushGoogleWalletUpdate(env, business, member, rewards)]);
  if (waitUntil) waitUntil(work);
  return work;
}

async function applyChange(env, { business, memberId, delta, kind, team, note = null, scanTicket = null, reversesId = null, reward = null, memberSql, memberBinds = [] }) {
  const now = nowIso();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO transactions (business_id, member_id, delta, kind, reward_id, reward_name, team_id, team_name, note, scan_ticket, reverses_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ).bind(business.id, memberId, delta, kind, reward?.id ?? null, reward?.name ?? null, team.id ?? null, team.name, note, scanTicket, reversesId, now),
      env.DB.prepare(`UPDATE members SET ${memberSql}, updated_at = ? WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
        .bind(...memberBinds, now, memberId, business.id),
    ]);
    if (!results[1].meta?.changes) throw new HttpError(404, 'Member not found');
    return results[0].results?.[0]?.id;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = String(error.message);
    if (/CHECK constraint/i.test(message)) throw new HttpError(409, 'Not enough points');
    if (/UNIQUE constraint/i.test(message) && /scan_ticket/i.test(message)) throw new HttpError(409, 'Already added for this scan');
    if (/UNIQUE constraint/i.test(message) && /reverses_id/i.test(message)) throw new HttpError(409, 'Already undone');
    if (/UNIQUE constraint/i.test(message)) throw new HttpError(409, 'Already done');
    throw error;
  }
}

export async function earnPoints(env, { business, member, points, team, scanTicket, force = false }) {
  if (!Number.isInteger(points) || points < 1 || points > business.max_points_per_scan) throw new HttpError(400, 'Invalid points');

  const sinceLast = member.last_earn_at ? (Date.now() - isoToMs(member.last_earn_at)) / 1000 : Infinity;
  if (!force && business.scan_cooldown_seconds > 0 && sinceLast < business.scan_cooldown_seconds) {
    throw new HttpError(409, 'Recent earn', { secondsAgo: Math.max(0, Math.round(sinceLast)) });
  }

  const now = nowIso();
  const transactionId = await applyChange(env, {
    business, memberId: member.id, delta: points, kind: 'earn', team, scanTicket,
    memberSql: 'points = points + ?, lifetime_points = lifetime_points + ?, visits = visits + 1, last_earn_at = ?',
    memberBinds: [points, points, now],
  });
  return { transactionId, member: await getMemberById(env, business.id, member.id) };
}

export async function redeemReward(env, { business, member, rewardId, team, scanTicket }) {
  const reward = await env.DB.prepare('SELECT id, name, cost FROM rewards WHERE id = ? AND business_id = ? AND active = 1')
    .bind(Number(rewardId), business.id).first();
  if (!reward) throw new HttpError(404, 'Reward not found');
  if (member.points < reward.cost) throw new HttpError(409, 'Not enough points');
  const transactionId = await applyChange(env, {
    business, memberId: member.id, delta: -reward.cost, kind: 'redeem', team, scanTicket, reward, note: reward.name,
    memberSql: 'points = points - ?, rewards_redeemed = rewards_redeemed + 1',
    memberBinds: [reward.cost],
  });
  return { transactionId, member: await getMemberById(env, business.id, member.id) };
}

export async function adjustPoints(env, { business, member, delta, team, note }) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) throw new HttpError(400, 'Invalid points');
  const transactionId = await applyChange(env, {
    business, memberId: member.id, delta, kind: 'adjust', team, note,
    memberSql: delta > 0 ? 'points = points + ?, lifetime_points = lifetime_points + ?' : 'points = points - ?',
    memberBinds: delta > 0 ? [delta, delta] : [-delta],
  });
  return { transactionId, member: await getMemberById(env, business.id, member.id) };
}

export const STAFF_UNDO_WINDOW_MINUTES = 15;

export async function undoTransaction(env, { business, transactionId, team }) {
  const original = await env.DB.prepare('SELECT * FROM transactions WHERE id = ? AND business_id = ?').bind(Number(transactionId), business.id).first();
  if (!original || original.kind === 'reversal' || original.kind === 'welcome') throw new HttpError(404, 'Transaction not found');

  if (team.role === 'staff') {
    const ageMinutes = (Date.now() - isoToMs(original.created_at)) / 60000;
    if (ageMinutes > STAFF_UNDO_WINDOW_MINUTES) throw new HttpError(403, 'Too old to undo');
  }

  let memberSql;
  let memberBinds;
  if (original.kind === 'redeem') {
    memberSql = 'points = points + ?, rewards_redeemed = MAX(0, rewards_redeemed - 1)';
    memberBinds = [-original.delta];
  } else if (original.delta > 0) {
    memberSql = `points = points - ?, lifetime_points = MAX(0, lifetime_points - ?)${original.kind === 'earn' ? ', visits = MAX(0, visits - 1), last_earn_at = NULL' : ''}`;
    memberBinds = [original.delta, original.delta];
  } else {
    memberSql = 'points = points + ?';
    memberBinds = [-original.delta];
  }

  const reversalId = await applyChange(env, {
    business, memberId: original.member_id, delta: -original.delta, kind: 'reversal', team,
    note: `Αναίρεση #${original.id}`, reversesId: original.id, memberSql, memberBinds,
  });
  return { transactionId: reversalId, member: await getMemberById(env, business.id, original.member_id) };
}
