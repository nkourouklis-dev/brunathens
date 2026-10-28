// /api/b/<slug>/... — ό,τι κάνει ο πελάτης: εγγραφή από το link, σύνδεση, κάρτα, QR, Wallet.
import {
  HttpError, clientIp, cleanText, emailConfigured, escapeHtml, json, normalizeEmail, nowIso, readJson, requireRate, sendEmail, sha256Hex, timingSafeEqual,
} from '../core.js';
import { listRewards, publicBusiness } from '../business.js';
import {
  checkJoinAllowed, createMember, endMemberSession, getMemberByEmail, publicMember, recentTransactions, requireMember, rotatingQrToken, startMemberSession,
} from '../members.js';
import { appleWalletConfigured, buildPkpass } from '../apple-pass.js';
import { googleSaveUrl, googleWalletConfigured, pushGoogleWalletUpdate } from '../google-wallet.js';

const CODE_TTL_MINUTES = 15;

async function cardResponse(env, business, member, extraHeaders = {}) {
  const rewards = await listRewards(env, business.id);
  return json({
    business: publicBusiness(business, rewards, env),
    member: publicMember(member, rewards),
    transactions: await recentTransactions(env, business.id, member.id),
  }, 200, extraHeaders);
}

export async function handleCustomer(ctx, business, segments) {
  const { env, request, method } = ctx;
  const [first, second] = segments;

  // ---- εγγραφή από το link ----
  if (method === 'POST' && first === 'join') {
    const payload = await readJson(request);
    await requireRate(env, `join-ip:${clientIp(request)}`, 10, 3600);
    await requireRate(env, `join-biz:${business.id}`, 300, 3600);
    checkJoinAllowed(business, payload.code);

    const name = cleanText(payload.name, 60);
    const email = normalizeEmail(payload.email);
    if (name.length < 2) throw new HttpError(400, 'Name required');
    if (!email) throw new HttpError(400, 'Invalid email');
    if (payload.terms !== true) throw new HttpError(400, 'Terms required');
    if (await getMemberByEmail(env, business.id, email)) throw new HttpError(409, 'Email already registered');

    const member = await createMember(env, business, { name, email, marketingOptIn: payload.marketing === true });
    return cardResponse(env, business, member, { 'Set-Cookie': await startMemberSession(env, request, business, member.id) });
  }

  // ---- σύνδεση σε άλλη συσκευή με κωδικό στο email ----
  if (method === 'POST' && first === 'login' && second === 'request') {
    const payload = await readJson(request);
    const email = normalizeEmail(payload.email);
    if (!email) throw new HttpError(400, 'Invalid email');
    const devCodes = env.LOYALTY_DEV_CODES === '1';
    if (!emailConfigured(env) && !devCodes) throw new HttpError(503, 'Email not configured');
    await requireRate(env, `code-ip:${clientIp(request)}`, 20, 3600);
    await requireRate(env, `code-email:${business.id}:${email}`, 5, 3600);

    const member = await getMemberByEmail(env, business.id, email);
    if (!member) return json({ sent: true }); // ίδια απάντηση είτε υπάρχει η κάρτα είτε όχι

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    await env.DB.batch([
      env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE member_id = ? AND used_at IS NULL').bind(nowIso(), member.id),
      env.DB.prepare('INSERT INTO login_codes (member_id, code_hash, expires_at) VALUES (?, ?, ?)')
        .bind(member.id, await sha256Hex(`${member.id}:${code}`), nowIso(new Date(Date.now() + CODE_TTL_MINUTES * 60_000))),
    ]);

    if (emailConfigured(env)) {
      await sendEmail(env, {
        to: email,
        fromName: business.name,
        subject: `${code} · Ο κωδικός σου για την κάρτα ${business.name}`,
        text: `Γεια σου ${member.name},\n\nΟ κωδικός σου είναι: ${code}\nΙσχύει για ${CODE_TTL_MINUTES} λεπτά.\n\nΑν δεν τον ζήτησες εσύ, αγνόησε αυτό το email.\n\n${business.name}`,
        html: `<div style="font-family:Arial,sans-serif;color:#222;max-width:420px">
          <p>Γεια σου ${escapeHtml(member.name)},</p>
          <p>Ο κωδικός σου για την κάρτα ${escapeHtml(business.name)} είναι:</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
          <p style="color:#666;font-size:13px">Ισχύει για ${CODE_TTL_MINUTES} λεπτά. Αν δεν τον ζήτησες εσύ, αγνόησε αυτό το email.</p></div>`,
      });
      return json({ sent: true });
    }
    return json({ sent: true, devCode: code }); // μόνο τοπικά (LOYALTY_DEV_CODES=1), ποτέ σε production
  }

  if (method === 'POST' && first === 'login' && second === 'verify') {
    const payload = await readJson(request);
    const email = normalizeEmail(payload.email);
    const code = String(payload.code || '').replace(/\D/g, '');
    if (!email || code.length !== 6) throw new HttpError(400, 'Invalid code');
    await requireRate(env, `verify-ip:${clientIp(request)}`, 30, 3600);

    const member = await getMemberByEmail(env, business.id, email);
    const row = member
      ? await env.DB.prepare('SELECT * FROM login_codes WHERE member_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').bind(member.id).first()
      : null;
    if (!row || row.expires_at < nowIso() || row.attempts >= 5) throw new HttpError(400, 'Invalid code');

    const expected = await sha256Hex(`${member.id}:${code}`);
    if (!timingSafeEqual(expected, row.code_hash)) {
      await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
      throw new HttpError(400, 'Invalid code');
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ?').bind(nowIso(), row.id),
      env.DB.prepare('UPDATE members SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(nowIso(), member.id),
    ]);
    return cardResponse(env, business, member, { 'Set-Cookie': await startMemberSession(env, request, business, member.id) });
  }

  if (method === 'POST' && first === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': await endMemberSession(env, request, business) });
  }

  // ---- η κάρτα μου ----
  if (first === 'me' && !second) {
    const member = await requireMember(env, request, business);

    if (method === 'GET') return cardResponse(env, business, member);

    if (method === 'PATCH') {
      const payload = await readJson(request);
      const sets = [];
      const binds = [];
      if (payload.name !== undefined) {
        const name = cleanText(payload.name, 60);
        if (name.length < 2) throw new HttpError(400, 'Name required');
        sets.push('name = ?'); binds.push(name);
      }
      if (typeof payload.marketingOptIn === 'boolean') { sets.push('marketing_opt_in = ?'); binds.push(payload.marketingOptIn ? 1 : 0); }
      if (sets.length) {
        await env.DB.prepare(`UPDATE members SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...binds, nowIso(), member.id, business.id).run();
      }
      const updated = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(member.id).first();
      return cardResponse(env, business, updated);
    }

    if (method === 'DELETE') {
      // Σβήνονται όνομα/email, sessions και Wallet. Το ανώνυμο ιστορικό μένει για τα στατιστικά.
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE members SET name = 'Διαγραμμένος', email = ?, deleted_at = ?, qr_version = qr_version + 1, updated_at = ? WHERE id = ? AND business_id = ?`,
        ).bind(`deleted-${member.id}@deleted.invalid`, nowIso(), nowIso(), member.id, business.id),
        env.DB.prepare('DELETE FROM member_sessions WHERE member_id = ?').bind(member.id),
        env.DB.prepare('DELETE FROM login_codes WHERE member_id = ?').bind(member.id),
        env.DB.prepare('DELETE FROM apple_registrations WHERE serial_number = ?').bind(member.public_id),
      ]);
      ctx.waitUntil?.(pushGoogleWalletUpdate(env, business, member, [], { deleted: true }));
      return json({ ok: true }, 200, { 'Set-Cookie': await endMemberSession(env, request, business) });
    }
  }

  if (method === 'GET' && first === 'qr') {
    const member = await requireMember(env, request, business);
    return json(await rotatingQrToken(env, member));
  }

  // ---- Wallet ----
  if (method === 'GET' && first === 'wallet' && second === 'apple') {
    if (!appleWalletConfigured(env)) throw new HttpError(503, 'Apple Wallet not configured');
    const member = await requireMember(env, request, business);
    const pkpass = await buildPkpass(env, business, member, await listRewards(env, business.id), ctx.url.origin);
    return new Response(pkpass, {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${business.slug}.pkpass"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (method === 'GET' && first === 'wallet' && second === 'google') {
    if (!googleWalletConfigured(env)) throw new HttpError(503, 'Google Wallet not configured');
    const member = await requireMember(env, request, business);
    return json({ url: await googleSaveUrl(env, business, member, await listRewards(env, business.id), ctx.url.origin) });
  }

  return null;
}
