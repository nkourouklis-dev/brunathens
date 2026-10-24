import { jsonResponse, handler, requireStaff, nowIso } from '../../../_lib/loyalty.js';

export const onRequestGet = handler(async ({ request, env }) => {
  await requireStaff(env, request, { ownerOnly: true });
  const day = nowIso(new Date(Date.now() - 86400000));
  const week = nowIso(new Date(Date.now() - 7 * 86400000));
  const month = nowIso(new Date(Date.now() - 30 * 86400000));
  const [members, activity] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS new_week,
              SUM(marketing_opt_in) AS marketing FROM loyalty_members WHERE deleted_at IS NULL`,
    ).bind(week),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN kind = 'earn' AND created_at >= ?1 THEN delta ELSE 0 END) AS points_day,
         SUM(CASE WHEN kind = 'earn' AND created_at >= ?2 THEN delta ELSE 0 END) AS points_week,
         SUM(CASE WHEN kind = 'redeem' AND created_at >= ?3 THEN 1 ELSE 0 END) AS rewards_month,
         COUNT(DISTINCT CASE WHEN kind = 'earn' AND created_at >= ?2 THEN member_id END) AS active_week
       FROM loyalty_transactions t
       WHERE created_at >= ?3 AND NOT EXISTS (SELECT 1 FROM loyalty_transactions r WHERE r.reverses_id = t.id)`,
    ).bind(day, week, month),
  ]);
  const m = members.results[0] || {};
  const a = activity.results[0] || {};
  return jsonResponse({
    members: m.total || 0,
    newMembersWeek: m.new_week || 0,
    marketingOptIns: m.marketing || 0,
    pointsToday: a.points_day || 0,
    pointsWeek: a.points_week || 0,
    activeMembersWeek: a.active_week || 0,
    rewardsMonth: a.rewards_month || 0,
  });
});
