import { createHash } from 'node:crypto';
import { endpoint, appOrigin, readBody, send, fail, HttpError } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, limit } from './auth.js';
import { tokenHash } from './password.js';
import { validateIotEvent, iotIdentifier } from '../iot-contract.js';

export function iotIngestHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (env.IOT_ENABLED !== '1') fail(503, 'IOT_NOT_CONFIGURED');
    // Device credentials are separate from browser cookies. No URL keys or CORS bypass.
    const id = req.headers['x-device-id'],
      auth = req.headers.authorization;
    if (!iotIdentifier(id) || typeof auth !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))
      fail(401, 'DEVICE_UNAUTHORIZED');
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''))
      fail(415, 'INVALID_CONTENT_TYPE');
    const db = database();
    const result = await transaction(db, async (client) => {
      const device = (
        await client.query(
          `SELECT d.* FROM meter_app.iot_devices d JOIN meter_app.users u ON u.id=d.owner_id WHERE device_id=$1 AND token_hash=$2 AND d.active AND u.active FOR UPDATE OF d FOR SHARE OF u`,
          [id, tokenHash(auth.slice(7))],
        )
      ).rows[0];
      if (!device) fail(401, 'DEVICE_UNAUTHORIZED');
      // Commit the budget independently of input validation by returning rejections.
      const budget = (
        await client.query(
          `UPDATE meter_app.iot_devices SET hits=CASE WHEN window_start<=now()-interval '1 minute' THEN 1 ELSE hits+1 END, window_start=CASE WHEN window_start<=now()-interval '1 minute' THEN now() ELSE window_start END WHERE device_id=$1 RETURNING hits`,
          [id],
        )
      ).rows[0];
      if (budget.hits > 120) return { status: 429, error: 'RATE_LIMITED' };
      let payload;
      try {
        payload = validateIotEvent(await readBody(req, 16384));
      } catch (error) {
        return {
          status: error instanceof HttpError ? error.status : 400,
          error: error instanceof HttpError ? error.code : 'INVALID_IOT_EVENT',
        };
      }
      if (
        payload.device_id !== id ||
        payload.meter_id !== device.meter_id ||
        payload.meter_profile !== device.meter_profile
      )
        return { status: 403, error: 'DEVICE_BINDING_MISMATCH' };
      const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const previous = (
        await client.query(
          'SELECT payload_hash FROM meter_app.iot_readings WHERE device_id=$1 AND event_id=$2',
          [id, payload.event_id],
        )
      ).rows[0];
      if (previous)
        return previous.payload_hash === hash
          ? { status: 200, event_id: payload.event_id, duplicate: true }
          : { status: 409, error: 'EVENT_CONFLICT' };
      await client.query(
        'INSERT INTO meter_app.iot_readings(device_id,event_id,captured_at,event_type,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [id, payload.event_id, payload.captured_at, payload.event_type, payload, hash],
      );
      await client.query(
        'UPDATE meter_app.iot_devices SET last_received_at=now() WHERE device_id=$1',
        [id],
      );
      return { status: 201, event_id: payload.event_id, duplicate: false };
    });
    if (result.status === 429) res.setHeader('Retry-After', '60');
    const { status, ...body } = result;
    send(res, status, body);
  });
}
export function iotReadingsHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const db = database(),
      user = await requireUser(db, req, appOrigin(env));
    await limit(db, 'reads:' + user.id, 600, env);
    if (env.IOT_ENABLED !== '1')
      return send(res, 200, { enabled: false, devices: [], readings: [] });
    const params = new URL(req.url, appOrigin(env)).searchParams;
    if ([...params.keys()].some((k) => !['device_id', 'event_type'].includes(k)))
      fail(400, 'INVALID_INPUT');
    const id = params.get('device_id'),
      kind = params.get('event_type');
    if ((id && !iotIdentifier(id)) || (kind && !['telemetry', 'checkpoint'].includes(kind)))
      fail(400, 'INVALID_INPUT');
    const devices = (
      await db.query(
        'SELECT device_id,plant,meter_id,meter_profile,active,last_received_at FROM meter_app.iot_devices WHERE owner_id=$1 ORDER BY device_id LIMIT 100',
        [user.id],
      )
    ).rows;
    const readings = (
      await db.query(
        `SELECT r.event_id,r.device_id,r.captured_at,r.received_at,r.event_type,r.payload FROM meter_app.iot_readings r JOIN meter_app.iot_devices d USING(device_id) WHERE d.owner_id=$1 AND ($2::text IS NULL OR d.device_id=$2) AND ($3::text IS NULL OR r.event_type=$3) ORDER BY r.captured_at DESC,r.received_at DESC LIMIT 100`,
        [user.id, id, kind],
      )
    ).rows;
    send(res, 200, { enabled: true, devices, readings });
  });
}
