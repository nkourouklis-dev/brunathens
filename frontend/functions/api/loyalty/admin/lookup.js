import {
  jsonResponse, readJson, handler, requireStaff, resolveScannedCode, issueScanTicket, getSettings, recentTransactions,
  memberForStaff,
} from '../../../_lib/loyalty.js';

// The barista scanned (or typed) a code: who is it, and a ticket to add/redeem points for this visit.
export const onRequestPost = handler(async ({ request, env }) => {
  await requireStaff(env, request);
  const { code } = await readJson(request);
  const { member, ticketId, source } = await resolveScannedCode(env, code);
  const settings = await getSettings(env);
  return jsonResponse({
    member: memberForStaff(member, settings),
    ticket: await issueScanTicket(env, member.id, ticketId),
    source,
    recent: (await recentTransactions(env, member.id, 3)),
  });
});
