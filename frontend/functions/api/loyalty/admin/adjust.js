import { jsonResponse, readJson, handler, HttpError, requireStaff, getMemberById, getSettings, cleanText, memberForStaff } from '../../../_lib/loyalty.js';
import { adjustPoints, notifyWallets } from '../../../_lib/points.js';

// Owner-only manual correction, e.g. a customer who forgot their phone.
export const onRequestPost = handler(async ({ request, env, waitUntil }) => {
  const staff = await requireStaff(env, request, { ownerOnly: true });
  const payload = await readJson(request);
  const member = await getMemberById(env, Number(payload.memberId));
  if (!member) throw new HttpError(404, 'Member not found');
  const settings = await getSettings(env);
  const result = await adjustPoints(env, { member, delta: Number(payload.delta), staff, note: cleanText(payload.note, 120) || null });
  notifyWallets(env, waitUntil, result.member, settings);
  return jsonResponse({ transactionId: result.transactionId, member: memberForStaff(result.member, settings) });
});
