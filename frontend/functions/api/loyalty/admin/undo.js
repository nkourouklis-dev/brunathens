import { jsonResponse, readJson, handler, HttpError, requireStaff, getSettings, memberForStaff } from '../../../_lib/loyalty.js';
import { undoTransaction, notifyWallets } from '../../../_lib/points.js';

export const onRequestPost = handler(async ({ request, env, waitUntil }) => {
  const staff = await requireStaff(env, request);
  const transactionId = Number((await readJson(request)).transactionId);
  if (!Number.isInteger(transactionId) || transactionId < 1) throw new HttpError(400, 'Invalid transaction');
  const settings = await getSettings(env);
  const result = await undoTransaction(env, { transactionId, staff });
  notifyWallets(env, waitUntil, result.member, settings);
  return jsonResponse({ transactionId: result.transactionId, member: memberForStaff(result.member, settings) });
});
