import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { fail } from './http.js';
import { tokenHash, secretToken } from './password.js';

export const SESSION_SECONDS = 8 * 60 * 60;
export function cookieName(origin) {
  return origin.startsWith('https:') ? '__Host-meter_session' : 'meter_session';
}
export function sessionCookie(origin, token, age = SESSION_SECONDS) {
  return `${cookieName(origin)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
}
export function readToken(req, origin) {
  const matches = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName(origin)}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(cookieName(origin).length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}
export async function getSession(database, req, origin) {
  const token = readToken(req, origin);
  if (!token) return null;
  const { rows } = await database.query(
    `SELECT u.id, u.username, u.role, u.must_change_password, u.auth_version
    FROM meter_app.sessions s JOIN meter_app.users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active AND u.auth_version = s.auth_version`,
    [tokenHash(token)],
  );
  return rows[0] || null;
}
export async function requireUser(
  database,
  req,
  origin,
  { admin = false, allowPasswordChange = false } = {},
) {
  const user = await getSession(database, req, origin);
  if (!user) fail(401, 'LOGIN_REQUIRED');
  if (req.headers['x-meter-user'] !== user.id) fail(409, 'ACCOUNT_CHANGED');
  if (user.must_change_password && !allowPasswordChange) fail(403, 'PASSWORD_CHANGE_REQUIRED');
  if (admin && user.role !== 'admin') fail(403, 'FORBIDDEN');
  return user;
}
// Call inside the write transaction. A reset/disable cannot race a report or user mutation.
export async function lockUser(client, user) {
  const { rows } = await client.query('SELECT * FROM meter_app.users WHERE id = $1 FOR SHARE', [
    user.id,
  ]);
  const current = rows[0];
  if (!current?.active || current.auth_version !== user.auth_version) fail(401, 'LOGIN_REQUIRED');
  return current;
}
export async function issueSession(client, user) {
  const token = secretToken();
  await client.query('DELETE FROM meter_app.sessions WHERE user_id = $1 AND expires_at <= now()', [
    user.id,
  ]);
  await client.query(
    `INSERT INTO meter_app.sessions(token_hash, user_id, auth_version, expires_at)
    VALUES ($1,$2,$3,now() + interval '8 hours')`,
    [tokenHash(token), user.id, user.auth_version],
  );
  return token;
}
export function rateKey(value, env = process.env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
  return createHmac('sha256', env.AUTH_SECRET).update(value).digest('hex');
}
export function clientAddress(req, env = process.env) {
  // Only Vercel's overwritten platform header is trusted, never arbitrary X-Forwarded-For.
  const value = env.VERCEL
    ? req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
    : req.socket?.remoteAddress;
  return value && isIP(value) ? value : 'unknown';
}
export async function limit(database, key, maximum, env = process.env) {
  const { rows } = await database.query(
    `INSERT INTO meter_app.rate_limits(key_hash, window_start, hits)
    VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / 900) * 900), 1)
    ON CONFLICT (key_hash) DO UPDATE SET
      hits = CASE WHEN meter_app.rate_limits.window_start < EXCLUDED.window_start THEN 1 ELSE meter_app.rate_limits.hits + 1 END,
      window_start = EXCLUDED.window_start RETURNING hits`,
    [rateKey(key, env)],
  );
  if (rows[0].hits > maximum) fail(429, 'RATE_LIMITED');
}
export async function audit(client, actorId, action, targetId) {
  await client.query(
    'INSERT INTO meter_app.audit_events(id, actor_id, action, target_id) VALUES ($1,$2,$3,$4)',
    [randomUUID(), actorId, action, targetId],
  );
}
