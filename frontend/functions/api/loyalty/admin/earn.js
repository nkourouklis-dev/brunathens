import { jsonResponse, readJson, handler, HttpError, requireStaff, requireTenant, verifyScanTicket, getMemberById, getSettings, memberForStaff } from '../../../_lib/loyalty.js';
import { earnPoints, notifyWallets } from '../../../_lib/points.js';

export const onRequestPost = handler(async ({ request, env, waitUntil }) => {
  const tenant = await requireTenant(env, request);
  const staff = await requireStaff(env, request, tenant);
  const payload = await readJson(request);
  const { memberId, ticketId } = await verifyScanTicket(env, payload.ticket);
  const member = await getMemberById(env, memberId, tenant.id);
  if (!member) throw new HttpError(404, 'Member not found');
  const settings = await getSettings(env, tenant);

  const result = await earnPoints(env, {
    member,
    points: Number(payload.points ?? 1),
    staff,
    scanTicket: ticketId,
    settings,
    force: payload.force === true,
  });
  notifyWallets(env, waitUntil, result.member, settings);
  return jsonResponse({ transactionId: result.transactionId, member: memberForStaff(result.member, settings) });
});
