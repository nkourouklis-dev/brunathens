import { jsonResponse, getSettings, handler, emailConfigured, requireTenant, publicTenant } from '../../_lib/loyalty.js';
import { appleWalletConfigured } from '../../_lib/apple-pass.js';
import { googleWalletConfigured } from '../../_lib/google-wallet.js';

// Public info for one business: branding, program rules and feature flags for the UI.
export const onRequestGet = handler(async ({ request, env }) => {
  const tenant = await requireTenant(env, request);
  const settings = await getSettings(env, tenant);
  return jsonResponse({
    tenant: publicTenant(tenant),
    pointsPerReward: settings.points_per_reward,
    rewardName: settings.reward_name,
    emailLogin: emailConfigured(env) || env.LOYALTY_DEV_CODES === '1',
    wallet: { apple: appleWalletConfigured(env), google: googleWalletConfigured(env) },
  });
});
