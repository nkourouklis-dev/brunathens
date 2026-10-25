// Points changes. Each one writes a ledger row and updates the balance in a single D1 batch
// (a transaction): if any statement fails, nothing is written. The CHECK (points >= 0)
// constraint on loyalty_members is what stops a balance going negative.
import { HttpError, getMemberById, isoToMs, nowIso } from './loyalty.js';
import { pushApplePassUpdate } from './apple-pass.js';
import { pushGoogleWalletUpdate } from './google-wallet.js';

export function notifyWallets(env, waitUntil, member, settings) {
  // Wallet updates only need the member and the rules; branding is set when the card is first added.
  const work = Promise.allSettled([pushApplePassUpdate(env, member), pushGoogleWalletUpdate(env, member, settings)]);
  if (waitUntil) waitUntil(work);
  return work;
}

async function applyChange(env, { tenantId, memberId, delta, kind, staff, note = null, scanTicket = null, reversesId = null, memberSet }) {
  const now = nowIso();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO loyalty_transactions (tenant_id, member_id, delta, kind, staff_id, staff_name, note, scan_ticket, reverses_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ).bind(tenantId, memberId, delta, kind, staff.staffId, staff.name, note, scanTicket, reversesId, now),
      env.DB.prepare(`UPDATE loyalty_members SET ${memberSet}, updated_at = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`)
        .bind(now, memberId, tenantId),
    ]);
    if (!results[1].meta?.changes) throw new HttpError(404, 'Member not found');
    return results[0].results?.[0]?.id;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (/CHECK constraint/i.test(error.message)) throw new HttpError(409, 'Not enough points');
    if (/UNIQUE constraint/i.test(error.message) && /scan_ticket/i.test(error.message)) throw new HttpError(409, 'Already added for this scan');
    if (/UNIQUE constraint/i.test(error.message) && /reverses_id/i.test(error.message)) throw new HttpError(409, 'Already undone');
    if (/UNIQUE constraint/i.test(error.message)) throw new HttpError(409, 'Already done');
    throw error;
  }
}

export async function earnPoints(env, { member, points, staff, scanTicket, settings, force = false }) {
  if (!Number.isInteger(points) || points < 1 || points > settings.max_points_per_scan) throw new HttpError(400, 'Invalid points');

  const sinceLast = member.last_earn_at ? (Date.now() - isoToMs(member.last_earn_at)) / 1000 : Infinity;
  if (!force && settings.scan_cooldown_seconds > 0 && sinceLast < settings.scan_cooldown_seconds) {
    throw new HttpError(409, 'Recent earn', { secondsAgo: Math.max(0, Math.round(sinceLast)) });
  }

  const now = nowIso();
  const transactionId = await applyChange(env, {
    tenantId: member.tenant_id,
    memberId: member.id,
    delta: points,
    kind: 'earn',
    staff,
    scanTicket,
    memberSet: `points = points + ${points}, lifetime_points = lifetime_points + ${points}, last_earn_at = '${now}'`,
  });
  return { transactionId, member: await getMemberById(env, member.id, member.tenant_id) };
}

export async function redeemReward(env, { member, staff, scanTicket, settings }) {
  const cost = settings.points_per_reward;
  if (member.points < cost) throw new HttpError(409, 'Not enough points');
  const transactionId = await applyChange(env, {
    tenantId: member.tenant_id,
    memberId: member.id,
    delta: -cost,
    kind: 'redeem',
    staff,
    scanTicket,
    note: settings.reward_name,
    memberSet: `points = points - ${cost}, rewards_redeemed = rewards_redeemed + 1`,
  });
  return { transactionId, member: await getMemberById(env, member.id, member.tenant_id) };
}

export async function adjustPoints(env, { member, delta, staff, note }) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) throw new HttpError(400, 'Invalid points');
  const transactionId = await applyChange(env, {
    tenantId: member.tenant_id,
    memberId: member.id,
    delta,
    kind: 'adjust',
    staff,
    note,
    memberSet: delta > 0
      ? `points = points + ${delta}, lifetime_points = lifetime_points + ${delta}`
      : `points = points - ${-delta}`,
  });
  return { transactionId, member: await getMemberById(env, member.id, member.tenant_id) };
}

export const BARISTA_UNDO_WINDOW_MINUTES = 15;

export async function undoTransaction(env, { tenant, transactionId, staff }) {
  const original = await env.DB.prepare('SELECT * FROM loyalty_transactions WHERE id = ? AND tenant_id = ?').bind(transactionId, tenant.id).first();
  if (!original || original.kind === 'reversal') throw new HttpError(404, 'Transaction not found');

  if (staff.role !== 'owner') {
    const ageMinutes = (Date.now() - isoToMs(original.created_at)) / 60000;
    if (ageMinutes > BARISTA_UNDO_WINDOW_MINUTES) throw new HttpError(403, 'Too old to undo');
  }

  const delta = -original.delta;
  let memberSet;
  if (original.kind === 'redeem') memberSet = `points = points + ${-original.delta}, rewards_redeemed = MAX(0, rewards_redeemed - 1)`;
  else if (original.delta > 0) memberSet = `points = points - ${original.delta}, lifetime_points = MAX(0, lifetime_points - ${original.delta})${original.kind === 'earn' ? ', last_earn_at = NULL' : ''}`;
  else memberSet = `points = points + ${-original.delta}`;

  const reversalId = await applyChange(env, {
    tenantId: tenant.id,
    memberId: original.member_id,
    delta,
    kind: 'reversal',
    staff,
    note: `Αναίρεση #${original.id}`,
    reversesId: original.id,
    memberSet,
  });
  return { transactionId: reversalId, member: await getMemberById(env, original.member_id, tenant.id) };
}
