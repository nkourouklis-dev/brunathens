import { jsonResponse, handler, requireStaff, requireTenant, nowIso } from '../../../_lib/loyalty.js';
import { BARISTA_UNDO_WINDOW_MINUTES } from '../../../_lib/points.js';

// Latest movements (last 24 hours), newest first, with whether they can still be undone.
export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const staff = await requireStaff(env, request, tenant);
  const since = nowIso(new Date(Date.now() - 24 * 3600 * 1000));
  const rows = await env.DB.prepare(
    `SELECT t.id, t.delta, t.kind, t.staff_name, t.note, t.created_at, t.reverses_id, m.name AS member_name,
            EXISTS (SELECT 1 FROM loyalty_transactions r WHERE r.reverses_id = t.id) AS reversed
     FROM loyalty_transactions t JOIN loyalty_members m ON m.id = t.member_id
     WHERE t.tenant_id = ? AND t.created_at >= ? ORDER BY t.id DESC LIMIT 100`,
  ).bind(tenant.id, since).all();

  const undoLimit = Date.now() - BARISTA_UNDO_WINDOW_MINUTES * 60000;
  return jsonResponse({
    activity: rows.results.map((row) => ({
      id: row.id,
      delta: row.delta,
      kind: row.kind,
      staffName: row.staff_name,
      note: row.note,
      memberName: row.member_name,
      createdAt: row.created_at,
      reversed: Boolean(row.reversed),
      canUndo: row.kind !== 'reversal' && !row.reversed && (staff.role === 'owner' || Date.parse(row.created_at) > undoLimit),
    })),
  });
});
