import { jsonResponse, readJson, handler, HttpError, requireStaff, verifyScanTicket, getMemberById, getSettings, memberForStaff } from '../../../_lib/loyalty.js';
import { redeemReward, notifyWallets } from '../../../_lib/points.js';

export const onRequestPost = handler(async ({ request, env, waitUntil }) => {
  const staff = await requireStaff(env, request);
  const payload = await readJson(request);
  const { memberId, ticketId } = await verifyScanTicket(env, payload.ticket);
  const member = await getMemberById(env, memberId);
  if (!member) throw new HttpError(404, 'Member not found');
  const settings = await getSettings(env);

  const result = await redeemReward(env, { member, staff, scanTicket: ticketId, settings });
  notifyWallets(env, waitUntil, result.member, settings);
  return jsonResponse({ transactionId: result.transactionId, member: memberForStaff(result.member, settings) });
});
