// Apple Wallet web service (developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes).
// webServiceURL in pass.json is <origin>/api/loyalty/wallet/apple-ws, so Apple calls <that>/v1/...
import { jsonResponse, readJson, getMemberByPublicId, getSettings, timingSafeEqual, errorResponse, isoToMs } from '../../../../_lib/loyalty.js';
import { appleWalletConfigured, appleAuthToken, buildPkpass, passLastModified } from '../../../../_lib/apple-pass.js';

async function authorizedMember(env, request, serialNumber) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('ApplePass ') ? header.slice(10) : '';
  if (!token || !serialNumber) return null;
  if (!timingSafeEqual(token, await appleAuthToken(env, serialNumber))) return null;
  return getMemberByPublicId(env, serialNumber);
}

const empty = (status) => new Response(null, { status });

export async function onRequest({ request, env, params }) {
  try {
    if (!appleWalletConfigured(env)) return empty(404);
    const segments = Array.isArray(params.path) ? params.path : String(params.path || '').split('/');
    const [version, resource, ...rest] = segments;
    if (version !== 'v1') return empty(404);
    const method = request.method;

    // POST/DELETE /v1/devices/{device}/registrations/{passType}/{serial}
    // GET         /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=tag
    if (resource === 'devices' && rest[1] === 'registrations') {
      const [deviceId, , passTypeId, serialNumber] = rest;
      if (passTypeId !== env.APPLE_PASS_TYPE_ID) return empty(404);

      if (method === 'GET' && !serialNumber) {
        const since = Number(new URL(request.url).searchParams.get('passesUpdatedSince') || 0);
        const rows = await env.DB.prepare(
          `SELECT m.public_id, m.updated_at FROM loyalty_apple_registrations r
           JOIN loyalty_members m ON m.public_id = r.serial_number WHERE r.device_library_id = ?`,
        ).bind(deviceId).all();
        // Tags are millisecond timestamps of the member's last change.
        const changed = rows.results.filter((row) => isoToMs(row.updated_at) > since);
        if (!changed.length) return empty(204);
        const lastUpdated = Math.max(...rows.results.map((row) => isoToMs(row.updated_at)));
        return jsonResponse({ serialNumbers: changed.map((row) => row.public_id), lastUpdated: String(lastUpdated) });
      }

      const member = await authorizedMember(env, request, serialNumber);
      if (!member) return empty(401);

      if (method === 'POST') {
        const { pushToken } = await readJson(request);
        if (!pushToken) return empty(400);
        const existing = await env.DB.prepare('SELECT 1 FROM loyalty_apple_registrations WHERE device_library_id = ? AND serial_number = ?')
          .bind(deviceId, serialNumber).first();
        await env.DB.prepare(
          `INSERT INTO loyalty_apple_registrations (device_library_id, serial_number, push_token) VALUES (?, ?, ?)
           ON CONFLICT(device_library_id, serial_number) DO UPDATE SET push_token = excluded.push_token`,
        ).bind(deviceId, serialNumber, String(pushToken).slice(0, 200)).run();
        return empty(existing ? 200 : 201);
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM loyalty_apple_registrations WHERE device_library_id = ? AND serial_number = ?')
          .bind(deviceId, serialNumber).run();
        return empty(200);
      }
      return empty(405);
    }

    // GET /v1/passes/{passType}/{serial}
    if (resource === 'passes' && method === 'GET') {
      const [passTypeId, serialNumber] = rest;
      if (passTypeId !== env.APPLE_PASS_TYPE_ID) return empty(404);
      const member = await authorizedMember(env, request, serialNumber);
      if (!member) return empty(401);

      const modified = passLastModified(member);
      const ifModifiedSince = Date.parse(request.headers.get('If-Modified-Since') || '') / 1000;
      if (ifModifiedSince && modified < ifModifiedSince) return empty(304);

      const settings = await getSettings(env);
      const pkpass = await buildPkpass(env, member, settings, new URL(request.url).origin);
      return new Response(pkpass, {
        headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Last-Modified': new Date(modified * 1000).toUTCString() },
      });
    }

    // POST /v1/log
    if (resource === 'log' && method === 'POST') {
      const { logs } = await readJson(request);
      console.log(JSON.stringify({ event: 'apple_wallet_log', logs: Array.isArray(logs) ? logs.slice(0, 20) : [] }));
      return empty(200);
    }

    return empty(404);
  } catch (error) {
    return errorResponse(error);
  }
}
