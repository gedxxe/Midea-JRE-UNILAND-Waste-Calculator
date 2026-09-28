import { endpoint, appOrigin, checkOrigin, readBody, send, fail } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, lockUser, limit } from './auth.js';
import { restoreWorkspace } from '../storage.js';

export function draftsHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    const origin = appOrigin(env),
      db = database();
    if (req.method === 'POST') checkOrigin(req, origin);
    const user = await requireUser(db, req, origin);
    if (req.method === 'GET') {
      const row = (
        await db.query(
          'SELECT workspace,version,updated_at FROM meter_app.working_drafts WHERE owner_id=$1',
          [user.id],
        )
      ).rows[0];
      return send(res, 200, row || { workspace: null, version: 0 });
    }
    await limit(db, 'drafts:' + user.id, 180, env);
    const body = await readBody(req);
    if (
      !Number.isSafeInteger(body.baseVersion) ||
      body.baseVersion < 0 ||
      body.baseVersion >= 2147483647
    )
      fail(400, 'INVALID_INPUT');
    let workspace = null;
    if (body.workspace !== null) {
      try {
        workspace = restoreWorkspace(JSON.stringify(body.workspace));
      } catch {
        fail(400, 'INVALID_DRAFT');
      }
    }
    const result = await transaction(db, async (client) => {
      // The owner row lock serializes creation as well as updates, including empty tombstones.
      await client.query('SELECT id FROM meter_app.users WHERE id=$1 FOR UPDATE', [user.id]);
      await lockUser(client, user);
      const old = (
        await client.query(
          'SELECT version,workspace,workspace IS NOT DISTINCT FROM $2::jsonb AS unchanged FROM meter_app.working_drafts WHERE owner_id=$1',
          [user.id, workspace === null ? null : JSON.stringify(workspace)],
        )
      ).rows[0];
      if (old?.unchanged) return { version: old.version, unchanged: true };
      if ((old?.version || 0) !== body.baseVersion) fail(409, 'DRAFT_CONFLICT');
      const version = (old?.version || 0) + 1;
      await client.query(
        'INSERT INTO meter_app.working_drafts(owner_id,workspace,version) VALUES($1,$2::jsonb,$3) ON CONFLICT(owner_id) DO UPDATE SET workspace=excluded.workspace,version=excluded.version,updated_at=now()',
        [user.id, workspace === null ? null : JSON.stringify(workspace), version],
      );
      return { version };
    });
    send(res, 200, result);
  });
}
