import { jsonResponse, handler, requireStaff, getSettings, requireTenant, publicTenant } from '../../../_lib/loyalty.js';

export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const staff = await requireStaff(env, request, tenant);
  const settings = await getSettings(env, tenant);
  return jsonResponse({ tenant: publicTenant(tenant), staff: { name: staff.name, role: staff.role }, settings });
});
