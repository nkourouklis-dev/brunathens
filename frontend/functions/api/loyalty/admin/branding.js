import { jsonResponse, readJson, handler, HttpError, requireStaff, requireTenant, publicTenant, cleanText } from '../../../_lib/loyalty.js';

const MAX_LOGO_CHARS = 400_000;
const COLUMNS = { name: 'name', tagline: 'tagline', icon: 'icon', color: 'color', logo: 'logo', legalName: 'legal_name', legalAddress: 'legal_address', legalVat: 'legal_vat', contactEmail: 'contact_email' };

// Owner edits the business's look: name, logo, icon, colour and the details shown in the privacy policy.
export const onRequestPut = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  await requireStaff(env, request, tenant, { ownerOnly: true });
  const payload = await readJson(request);
  const updates = {};

  if ('name' in payload) {
    updates.name = cleanText(payload.name, 40);
    if (!updates.name) throw new HttpError(400, 'Name required');
  }
  if ('tagline' in payload) updates.tagline = cleanText(payload.tagline, 80) || null;
  if ('icon' in payload) {
    updates.icon = String(payload.icon || '');
    if (!/^[a-z][a-z-]{1,24}$/.test(updates.icon)) throw new HttpError(400, 'Invalid icon');
  }
  if ('color' in payload) {
    updates.color = String(payload.color || '');
    if (!/^#[0-9a-fA-F]{6}$/.test(updates.color)) throw new HttpError(400, 'Invalid colour');
  }
  if ('logo' in payload) {
    const logo = String(payload.logo || '');
    if (logo && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > MAX_LOGO_CHARS)) throw new HttpError(400, 'Logo must be a PNG under 300 KB');
    updates.logo = logo || null;
  }
  if ('legalName' in payload) updates.legalName = cleanText(payload.legalName, 120) || null;
  if ('legalAddress' in payload) updates.legalAddress = cleanText(payload.legalAddress, 160) || null;
  if ('legalVat' in payload) updates.legalVat = cleanText(payload.legalVat, 20) || null;
  if ('contactEmail' in payload) updates.contactEmail = cleanText(payload.contactEmail, 120) || null;

  const keys = Object.keys(updates);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  await env.DB.prepare(`UPDATE tenants SET ${keys.map((key) => `${COLUMNS[key]} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((key) => updates[key]), tenant.id).run();

  const fresh = await env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenant.id).first();
  return jsonResponse({ tenant: publicTenant(fresh) });
});
