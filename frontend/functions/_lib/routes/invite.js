// /api/invite/<token> — ο υποψήφιος (ιδιοκτήτης / υπεύθυνος / ταμίας) βλέπει την πρόσκληση και την αποδέχεται.
import { HttpError, clientIp, json, readJson, requireRate } from '../core.js';
import { acceptInvitation, findInvitation, startTeamSession } from '../auth.js';
import { getBusinessById } from '../business.js';

export async function handleInvite(ctx, segments) {
  const { env, request, method } = ctx;
  const [token, action] = segments;
  if (!token) return null;

  await requireRate(env, `invite-ip:${clientIp(request)}`, 60, 3600);
  const invitation = await findInvitation(env, token);
  // Ίδια απάντηση για λάθος, ληγμένο, χρησιμοποιημένο ή ακυρωμένο link.
  if (!invitation) throw new HttpError(404, 'Invitation unavailable');
  const business = await getBusinessById(env, invitation.business_id);
  if (!business || business.status !== 'active') throw new HttpError(404, 'Invitation unavailable');

  if (method === 'GET' && !action) {
    return json({
      invitation: { role: invitation.role, label: invitation.label || '', expiresAt: invitation.expires_at },
      business: {
        slug: business.slug, name: business.name, icon: business.icon, color: business.color, hasLogo: Boolean(business.has_logo), logoVersion: business.logo_version,
      },
    });
  }

  if (method === 'POST' && action === 'accept') {
    const member = await acceptInvitation(env, invitation, business, await readJson(request));
    return json({ slug: business.slug, identity: { id: member.id, name: member.name, role: member.role } }, 200, {
      'Set-Cookie': await startTeamSession(env, request, business, member),
    });
  }

  return null;
}
