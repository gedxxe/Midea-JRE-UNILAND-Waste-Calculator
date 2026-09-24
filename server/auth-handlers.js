import { randomUUID } from 'node:crypto';
import { endpoint, appOrigin, checkOrigin, readBody, send, fail, uuid } from './http.js';
import { getPool, transaction } from './db.js';
import {
  username,
  validatePassword,
  hashPassword,
  verifyPassword,
  dummyHash,
  secretToken,
  tokenHash,
} from './password.js';
import {
  getSession,
  requireUser,
  lockUser,
  publicUser,
  readToken,
  sessionCookie,
  issueSession,
  clientAddress,
  limit,
  audit,
} from './auth.js';

export function authHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (req.method === 'GET' && !env.DATABASE_URL)
      return send(res, 200, { available: false, user: null });
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const origin = appOrigin(env);
    const db = database();
    if (req.method === 'GET')
      return send(res, 200, {
        available: true,
        user: publicOrNull(await getSession(db, req, origin)),
      });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    checkOrigin(req, origin);
    const body = await readBody(req);
    if (body.action === 'logout') {
      const active = await getSession(db, req, origin);
      if (active && req.headers['x-meter-user'] !== active.id) fail(409, 'ACCOUNT_CHANGED');
      const token = readToken(req, origin);
      if (token)
        await db.query('DELETE FROM meter_app.sessions WHERE token_hash = $1', [tokenHash(token)]);
      res.setHeader('Set-Cookie', sessionCookie(origin, '', 0));
      return send(res, 200, { user: null });
    }
    await limit(db, 'auth:ip:' + clientAddress(req, env), 60, env);
    if (body.action === 'login') {
      const name = username(body.username);
      if (typeof body.password !== 'string' || body.password.length > 512)
        fail(400, 'INVALID_INPUT');
      await limit(db, 'login:user:' + name, 10, env);
      const dummy = await dummyHash();
      const { rows } = await db.query('SELECT * FROM meter_app.users WHERE username = $1', [name]);
      const user = rows[0];
      const valid = await verifyPassword(user?.active ? user.password_hash : dummy, body.password);
      if (!valid || !user?.active) fail(401, 'INVALID_CREDENTIALS');
      const token = await transaction(db, async (client) => {
        await lockUser(client, user);
        return issueSession(client, user);
      });
      res.setHeader('Set-Cookie', sessionCookie(origin, token));
      return send(res, 200, { user: publicUser(user) });
    }
    if (body.action === 'changePassword') {
      const user = await requireUser(db, req, origin, { allowPasswordChange: true });
      validatePassword(body.password);
      if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 512)
        fail(400, 'INVALID_INPUT');
      await limit(db, 'password:' + user.id, 10, env);
      const current = (
        await db.query('SELECT password_hash FROM meter_app.users WHERE id = $1', [user.id])
      ).rows[0];
      if (!(await verifyPassword(current.password_hash, body.currentPassword)))
        fail(401, 'INVALID_CREDENTIALS');
      if (body.password === body.currentPassword) fail(400, 'PASSWORD_UNCHANGED');
      const encoded = await hashPassword(body.password);
      const result = await transaction(db, async (client) => {
        await lockUser(client, user);
        const updated = (
          await client.query(
            'UPDATE meter_app.users SET password_hash=$2, must_change_password=false, auth_version=auth_version+1, updated_at=now() WHERE id=$1 RETURNING *',
            [user.id, encoded],
          )
        ).rows[0];
        await client.query('DELETE FROM meter_app.sessions WHERE user_id=$1', [user.id]);
        const token = await issueSession(client, updated);
        await audit(client, user.id, 'password.changed', user.id);
        return { token, user: publicUser(updated) };
      });
      res.setHeader('Set-Cookie', sessionCookie(origin, result.token));
      return send(res, 200, { user: result.user });
    }
    fail(400, 'INVALID_INPUT');
  });
}
const publicOrNull = (user) => (user ? publicUser(user) : null);

export function usersHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    const origin = appOrigin(env);
    const db = database();
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (req.method === 'POST') checkOrigin(req, origin);
    const user = await requireUser(db, req, origin, { admin: true });
    if (req.method === 'GET') {
      const rows = (
        await db.query(
          'SELECT id, username, role, active, must_change_password FROM meter_app.users ORDER BY username LIMIT 200',
        )
      ).rows;
      return send(res, 200, {
        users: rows.map((row) => ({ ...publicUser(row), active: row.active })),
      });
    }
    await limit(db, 'admin:' + user.id, 40, env);
    const body = await readBody(req);
    if (!['create', 'resetPassword', 'setActive'].includes(body.action)) fail(400, 'INVALID_INPUT');
    const id = body.action === 'create' ? randomUUID() : uuid(body.id);
    if (id === user.id) fail(400, 'SELF_MANAGEMENT');
    const name = body.action === 'create' ? username(body.username) : null;
    if (body.action === 'setActive' && typeof body.active !== 'boolean') fail(400, 'INVALID_INPUT');
    const password = body.action === 'setActive' ? null : secretToken();
    const encoded = password ? await hashPassword(password) : null;
    const result = await transaction(db, async (client) => {
      await lockUser(client, user);
      if (body.action === 'create') {
        await client.query(
          "INSERT INTO meter_app.users(id,username,password_hash,role) VALUES ($1,$2,$3,'operator')",
          [id, name, encoded],
        );
      } else {
        const target = (
          await client.query('SELECT * FROM meter_app.users WHERE id=$1 FOR UPDATE', [id])
        ).rows[0];
        if (!target) fail(404, 'NOT_FOUND');
        // This release manages operator accounts. Admin recovery is a separate local command.
        if (target.role === 'admin') fail(403, 'FORBIDDEN');
        if (body.action === 'resetPassword')
          await client.query(
            'UPDATE meter_app.users SET password_hash=$2, must_change_password=true, auth_version=auth_version+1, updated_at=now() WHERE id=$1',
            [id, encoded],
          );
        else
          await client.query(
            'UPDATE meter_app.users SET active=$2, auth_version=auth_version+1, updated_at=now() WHERE id=$1',
            [id, body.active],
          );
        await client.query('DELETE FROM meter_app.sessions WHERE user_id=$1', [id]);
      }
      await audit(client, user.id, 'user.' + body.action, id);
      return { id, temporaryPassword: password };
    });
    send(res, 200, result);
  });
}
