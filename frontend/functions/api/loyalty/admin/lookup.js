import {
  jsonResponse, readJson, handler, requireStaff, requireTenant, resolveScannedCode, issueScanTicket, getSettings, recentTransactions,
  memberForStaff,
} from '../../../_lib/loyalty.js';

// The barista scanned (or typed) a code: who is it, and a ticket to add/redeem points for this visit.
export const onRequestPost = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  await requireStaff(env, request, tenant);
  const { code } = await readJson(request);
  const { member, ticketId, source } = await resolveScannedCode(env, tenant, code);
  const settings = await getSettings(env, tenant);
  return jsonResponse({
    member: memberForStaff(member, settings),
    ticket: await issueScanTicket(env, member.id, ticketId),
    source,
    recent: (await recentTransactions(env, member.id, 3)),
  });
});
