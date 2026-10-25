import { jsonResponse, readJson, handler, HttpError, requireStaff, requireTenant, getSettings, memberForStaff } from '../../../_lib/loyalty.js';
import { undoTransaction, notifyWallets } from '../../../_lib/points.js';

export const onRequestPost = handler(async ({ request, env, waitUntil }) => {
  const tenant = await requireTenant(env, request);
  const staff = await requireStaff(env, request, tenant);
  const transactionId = Number((await readJson(request)).transactionId);
  if (!Number.isInteger(transactionId) || transactionId < 1) throw new HttpError(400, 'Invalid transaction');
  const settings = await getSettings(env, tenant);
  const result = await undoTransaction(env, { tenant, transactionId, staff });
  notifyWallets(env, waitUntil, result.member, settings);
  return jsonResponse({ transactionId: result.transactionId, member: memberForStaff(result.member, settings) });
});
