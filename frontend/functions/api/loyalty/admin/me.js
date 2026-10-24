import { jsonResponse, handler, requireStaff, getSettings } from '../../../_lib/loyalty.js';

export const onRequestGet = handler(async ({ request, env }) => {
  const staff = await requireStaff(env, request);
  const settings = await getSettings(env);
  return jsonResponse({ staff: { name: staff.name, role: staff.role }, settings });
});
