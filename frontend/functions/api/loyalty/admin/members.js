import { jsonResponse, handler, requireStaff, getSettings, memberForStaff } from '../../../_lib/loyalty.js';

// Owner: search members by name, email or card number.
export const onRequestGet = handler(async ({ request, env }) => {
  await requireStaff(env, request, { ownerOnly: true });
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60);
  const settings = await getSettings(env);
  const like = `%${query.replace(/[%_]/g, '')}%`;
  const card = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const rows = await env.DB.prepare(
    `SELECT * FROM loyalty_members WHERE deleted_at IS NULL
       AND (?1 = '' OR name LIKE ?2 OR email LIKE ?2 OR (?3 <> '' AND card_number LIKE ?4))
     ORDER BY updated_at DESC LIMIT 50`,
  ).bind(query, like, card, `%${card}%`).all();
  return jsonResponse({
    members: rows.results.map((member) => ({
      ...memberForStaff(member, settings),
      email: member.email,
      marketingOptIn: Boolean(member.marketing_opt_in),
    })),
  });
});
