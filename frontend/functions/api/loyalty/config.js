import { jsonResponse, getSettings, handler, emailConfigured } from '../../_lib/loyalty.js';
import { appleWalletConfigured } from '../../_lib/apple-pass.js';
import { googleWalletConfigured } from '../../_lib/google-wallet.js';

// Public program info for the sign-up screen and feature flags for the UI.
export const onRequestGet = handler(async ({ env }) => {
  const settings = await getSettings(env);
  return jsonResponse({
    pointsPerReward: settings.points_per_reward,
    rewardName: settings.reward_name,
    emailLogin: emailConfigured(env) || env.LOYALTY_DEV_CODES === '1',
    wallet: { apple: appleWalletConfigured(env), google: googleWalletConfigured(env) },
  });
});
