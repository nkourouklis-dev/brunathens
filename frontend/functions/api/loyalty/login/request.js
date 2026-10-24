import {
  jsonResponse, readJson, handler, HttpError, normalizeEmail, rateLimit, clientIp, emailConfigured, sendEmail,
  sha256Hex, nowIso, escapeHtml,
} from '../../../_lib/loyalty.js';

const CODE_TTL_MINUTES = 15;

// Sends a 6-digit sign-in code. Same answer whether or not the email exists.
export const onRequestPost = handler(async ({ request, env }) => {
  const payload = await readJson(request);
  const email = normalizeEmail(payload.email);
  if (!email) throw new HttpError(400, 'Invalid email');

  const devCodes = env.LOYALTY_DEV_CODES === '1';
  if (!emailConfigured(env) && !devCodes) throw new HttpError(503, 'Email not configured');

  if (!await rateLimit(env, `login-ip:${clientIp(request)}`, 20, 3600)
    || !await rateLimit(env, `login-email:${email}`, 5, 3600)) {
    throw new HttpError(429, 'Too many attempts');
  }

  const member = await env.DB.prepare('SELECT id, name FROM loyalty_members WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (!member) return jsonResponse({ sent: true });

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const expiresAt = nowIso(new Date(Date.now() + CODE_TTL_MINUTES * 60_000));
  await env.DB.batch([
    env.DB.prepare('UPDATE loyalty_login_codes SET used_at = ? WHERE member_id = ? AND used_at IS NULL').bind(nowIso(), member.id),
    env.DB.prepare('INSERT INTO loyalty_login_codes (member_id, code_hash, expires_at) VALUES (?, ?, ?)')
      .bind(member.id, await sha256Hex(`${member.id}:${code}`), expiresAt),
  ]);

  if (emailConfigured(env)) {
    await sendEmail(env, {
      to: email,
      subject: `${code} · Ο κωδικός σου για την κάρτα BRUN`,
      text: `Γεια σου ${member.name},\n\nΟ κωδικός σου είναι: ${code}\nΙσχύει για ${CODE_TTL_MINUTES} λεπτά.\n\nΑν δεν τον ζήτησες εσύ, αγνόησε αυτό το email.\n\nBRUN`,
      html: `<div style="font-family:Arial,sans-serif;color:#4A4A4A;max-width:420px">
        <p>Γεια σου ${escapeHtml(member.name)},</p>
        <p>Ο κωδικός σου για την κάρτα BRUN είναι:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p style="color:#6B6B6B;font-size:13px">Ισχύει για ${CODE_TTL_MINUTES} λεπτά. Αν δεν τον ζήτησες εσύ, αγνόησε αυτό το email.</p>
      </div>`,
    });
    return jsonResponse({ sent: true });
  }

  // Local development only (LOYALTY_DEV_CODES=1 in .dev.vars): return the code instead of emailing it.
  return jsonResponse({ sent: true, devCode: code });
});
