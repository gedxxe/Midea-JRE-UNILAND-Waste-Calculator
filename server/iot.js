import { createHash } from 'node:crypto';
import { endpoint, appOrigin, checkOrigin, readBody, send, fail, HttpError } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, limit, lockUser, audit } from './auth.js';
import { tokenHash, secretToken } from './password.js';
import {
  validateIotEvent,
  validateIotHeartbeat,
  iotIdentifier,
  iotCloudEndpoint,
  iotPresence,
  IOT_HEARTBEAT_INTERVAL_SECONDS,
  IOT_PRESENCE_TIMEOUT_SECONDS,
  IOT_TELEMETRY_INTERVAL_SECONDS,
  IOT_MANUAL_COOLDOWN_SECONDS,
  IOT_MANUAL_TIMEOUT_SECONDS,
} from '../iot-contract.js';

// Staged rollout: old databases and production remain usable until migration 010
// is explicitly applied and the optional cloud command channel is enabled.
const manualEnabled = (env) => env.IOT_MANUAL_REFRESH_ENABLED === '1';
const connection = (env) => ({
  schema_version: 1,
  endpoint: iotCloudEndpoint(env.IOT_PUBLIC_ORIGIN || env.APP_ORIGIN),
  telemetry_interval_seconds: IOT_TELEMETRY_INTERVAL_SECONDS,
  manual_cooldown_seconds: IOT_MANUAL_COOLDOWN_SECONDS,
  manual_refresh_enabled: manualEnabled(env),
  heartbeat_interval_seconds: IOT_HEARTBEAT_INTERVAL_SECONDS,
  presence_timeout_seconds: IOT_PRESENCE_TIMEOUT_SECONDS,
});

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
        const value = await readBody(req, 16384);
        payload =
          value?.event_type === 'heartbeat' ? validateIotHeartbeat(value) : validateIotEvent(value);
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
      const touch = async () =>
        (
          await client.query(
            'UPDATE meter_app.iot_devices SET last_received_at=now() WHERE device_id=$1 RETURNING last_received_at',
            [id],
          )
        ).rows[0].last_received_at;
      if (payload.event_type === 'heartbeat') {
        const requested = manualEnabled(env)
          ? (
              await client.query(
                `SELECT floor(extract(epoch FROM requested_at))::bigint AS refresh_after_utc
                 FROM meter_app.iot_refresh_requests
                 WHERE device_id=$1 AND requested_at>now()-interval '120 seconds'
                 AND (completed_at IS NULL OR completed_at<requested_at)`,
                [id],
              )
            ).rows[0]
          : null;
        return {
          status: 200,
          event_type: 'heartbeat',
          device_id: id,
          server_time: await touch(),
          heartbeat_interval_seconds: IOT_HEARTBEAT_INTERVAL_SECONDS,
          ...(requested ? { refresh_after_utc: Number(requested.refresh_after_utc) } : {}),
        };
      }
      const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const previous = (
        await client.query(
          'SELECT payload_hash FROM meter_app.iot_readings WHERE device_id=$1 AND event_id=$2',
          [id, payload.event_id],
        )
      ).rows[0];
      if (previous) {
        if (previous.payload_hash !== hash) return { status: 409, error: 'EVENT_CONFLICT' };
        await touch();
        return { status: 200, event_id: payload.event_id, duplicate: true };
      }
      await client.query(
        'INSERT INTO meter_app.iot_readings(device_id,event_id,captured_at,event_type,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [id, payload.event_id, payload.captured_at, payload.event_type, payload, hash],
      );
      if (manualEnabled(env) && payload.event_type === 'telemetry')
        await client.query(
          `UPDATE meter_app.iot_refresh_requests SET completed_at=now()
           WHERE device_id=$1 AND requested_at<=$2::timestamptz
           AND requested_at>now()-interval '120 seconds'
           AND (completed_at IS NULL OR completed_at<requested_at)`,
          [id, payload.captured_at],
        );
      await touch();
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
    const refreshFields = manualEnabled(env)
      ? `q.requested_at AS refresh_requested_at, q.completed_at AS refresh_completed_at,
         (q.requested_at>now()-interval '120 seconds' AND
          (q.completed_at IS NULL OR q.completed_at<q.requested_at)) AS refresh_pending`
      : `NULL::timestamptz AS refresh_requested_at,
         NULL::timestamptz AS refresh_completed_at,FALSE AS refresh_pending`;
    const refreshJoin = manualEnabled(env)
      ? 'LEFT JOIN meter_app.iot_refresh_requests q ON q.device_id=d.device_id'
      : '';
    const devices = (
      await db.query(
        `SELECT d.device_id,d.plant,d.meter_id,d.meter_profile,d.active,d.last_received_at,
         CASE WHEN latest.event_id IS NULL THEN NULL ELSE jsonb_build_object('captured_at',latest.captured_at,'received_at',latest.received_at,'readings',latest.payload->'readings') END AS latest_reading,
         ${refreshFields}
         FROM meter_app.iot_devices d
         ${refreshJoin}
         LEFT JOIN LATERAL (
           SELECT event_id,captured_at,received_at,payload FROM meter_app.iot_readings
           WHERE device_id=d.device_id ORDER BY captured_at DESC,received_at DESC,event_id DESC LIMIT 1
         ) latest ON true WHERE d.owner_id=$1 ORDER BY d.device_id LIMIT 100`,
        [user.id],
      )
    ).rows;
    const readings = (
      await db.query(
        `SELECT r.event_id,r.device_id,r.captured_at,r.received_at,r.event_type,r.payload FROM meter_app.iot_readings r JOIN meter_app.iot_devices d USING(device_id) WHERE d.owner_id=$1 AND ($2::text IS NULL OR d.device_id=$2) AND ($3::text IS NULL OR r.event_type=$3) ORDER BY r.captured_at DESC,r.received_at DESC LIMIT 100`,
        [user.id, id, kind],
      )
    ).rows;
    const serverTime = (await db.query('SELECT clock_timestamp() AS time')).rows[0].time;
    send(res, 200, {
      enabled: true,
      devices: devices.map((device) => ({
        ...device,
        connection_status: iotPresence(device, new Date(serverTime).getTime()),
      })),
      readings,
      server_time: serverTime,
      connection: connection(env),
    });
  });
}

export function iotDevicesHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const origin = appOrigin(env);
    checkOrigin(req, origin);
    const db = database();
    const user = await requireUser(db, req, origin, { admin: true });
    if (env.IOT_ENABLED !== '1') fail(503, 'IOT_NOT_CONFIGURED');
    await limit(db, 'admin:' + user.id, 40, env);
    const body = await readBody(req, 4096);
    const fields =
      body.action === 'create'
        ? ['action', 'device_id', 'plant', 'meter_id', 'meter_profile']
        : ['action', 'device_id'];
    if (
      !['create', 'rotate', 'revoke'].includes(body.action) ||
      !iotIdentifier(body.device_id) ||
      Object.keys(body).some((key) => !fields.includes(key))
    )
      fail(400, 'INVALID_INPUT');
    if (
      body.action === 'create' &&
      (!['JRE', 'UNILAND'].includes(body.plant) ||
        !iotIdentifier(body.meter_id) ||
        !iotIdentifier(body.meter_profile))
    )
      fail(400, 'INVALID_INPUT');
    if (body.action === 'create' && !connection(env).endpoint)
      fail(503, 'IOT_CLOUD_NOT_CONFIGURED');
    const credential = body.action === 'revoke' ? null : secretToken();
    const result = await transaction(db, async (client) => {
      // Serialize this owner's registry changes, including the 100-source quota.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        'iot:devices:' + user.id,
      ]);
      if ((await lockUser(client, user)).role !== 'admin') fail(403, 'FORBIDDEN');
      if (body.action === 'create') {
        const count = (
          await client.query(
            'SELECT count(*)::int AS count FROM meter_app.iot_devices WHERE owner_id=$1',
            [user.id],
          )
        ).rows[0].count;
        if (count >= 100) fail(409, 'DEVICE_LIMIT_REACHED');
        const device = (
          await client.query(
            'INSERT INTO meter_app.iot_devices(device_id,owner_id,plant,meter_id,meter_profile,token_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING device_id,plant,meter_id,meter_profile,active',
            [
              body.device_id,
              user.id,
              body.plant,
              body.meter_id,
              body.meter_profile,
              tokenHash(credential),
            ],
          )
        ).rows[0];
        await audit(client, user.id, 'iot.device.create', user.id);
        return device;
      }
      const changed =
        body.action === 'rotate'
          ? await client.query(
              'UPDATE meter_app.iot_devices SET token_hash=$3,active=true WHERE device_id=$1 AND owner_id=$2 RETURNING device_id,plant,meter_id,meter_profile,active',
              [body.device_id, user.id, tokenHash(credential)],
            )
          : await client.query(
              'UPDATE meter_app.iot_devices SET active=false WHERE device_id=$1 AND owner_id=$2 RETURNING device_id,plant,meter_id,meter_profile,active',
              [body.device_id, user.id],
            );
      if (!changed.rowCount) fail(404, 'NOT_FOUND');
      await audit(client, user.id, 'iot.device.' + body.action, user.id);
      return changed.rows[0];
    });
    send(res, body.action === 'create' ? 201 : 200, {
      device: result,
      connection: connection(env),
      ...(credential ? { credential } : {}),
    });
  });
}

// A browser cannot directly GET a private ESP32 behind factory NAT. This authenticated
// write queues one command; the next signed heartbeat delivers it, and a *new*
// Modbus telemetry event (not a cached GET) completes it.
export function iotRefreshHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const origin = appOrigin(env);
    checkOrigin(req, origin);
    const db = database();
    const user = await requireUser(db, req, origin);
    if (env.IOT_ENABLED !== '1' || !manualEnabled(env)) fail(503, 'IOT_NOT_CONFIGURED');
    await limit(db, 'iot:manual:' + user.id, 300, env);
    const body = await readBody(req, 512);
    if (Object.keys(body).length !== 1 || !iotIdentifier(body.device_id))
      fail(400, 'INVALID_INPUT');
    const result = await transaction(db, async (client) => {
      // Serialize per-device changes even when multiple tabs/users request together.
      const device = (
        await client.query(
          'SELECT active,last_received_at FROM meter_app.iot_devices WHERE device_id=$1 AND owner_id=$2 FOR UPDATE',
          [body.device_id, user.id],
        )
      ).rows[0];
      if (!device) fail(404, 'NOT_FOUND');
      if (
        !device.active ||
        !device.last_received_at ||
        Date.now() - new Date(device.last_received_at).getTime() >
          IOT_PRESENCE_TIMEOUT_SECONDS * 1000
      )
        return { status: 409, error: 'DEVICE_OFFLINE' };
      const queued = await client.query(
        `INSERT INTO meter_app.iot_refresh_requests(device_id,requested_at)
         VALUES($1,clock_timestamp())
         ON CONFLICT(device_id) DO UPDATE SET requested_at=clock_timestamp(),completed_at=NULL
         WHERE meter_app.iot_refresh_requests.requested_at <=
               clock_timestamp()-interval '10 seconds'
           AND (meter_app.iot_refresh_requests.completed_at >=
                  meter_app.iot_refresh_requests.requested_at
                OR meter_app.iot_refresh_requests.requested_at <=
                  clock_timestamp()-interval '120 seconds')
         RETURNING requested_at`,
        [body.device_id],
      );
      if (queued.rowCount)
        return { status: 202, queued: true, requested_at: queued.rows[0].requested_at };
      const state = (
        await client.query(
          `SELECT requested_at,completed_at,
            greatest(1,ceil(extract(epoch FROM (requested_at + interval '10 seconds' - clock_timestamp()))))::int AS retry_after_seconds
           FROM meter_app.iot_refresh_requests WHERE device_id=$1`,
          [body.device_id],
        )
      ).rows[0];
      return state.completed_at === null ||
        new Date(state.completed_at) < new Date(state.requested_at)
        ? { status: 409, error: 'REFRESH_PENDING', requested_at: state.requested_at }
        : {
            status: 429,
            error: 'REFRESH_COOLDOWN',
            retry_after_seconds: state.retry_after_seconds,
          };
    });
    if (result.status === 429) res.setHeader('Retry-After', String(result.retry_after_seconds));
    const { status, ...value } = result;
    send(res, status, value);
  });
}
