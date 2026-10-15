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
    const body = await readBody(req, 256 * 1024);
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
          'SELECT version,updated_at,workspace,workspace IS NOT DISTINCT FROM $2::jsonb AS unchanged FROM meter_app.working_drafts WHERE owner_id=$1',
          [user.id, workspace === null ? null : JSON.stringify(workspace)],
        )
      ).rows[0];
      if (workspace && old?.workspace?.workingHours && !workspace.workingHours)
        fail(409, 'DRAFT_FORMAT_CHANGED');
      if (workspace && old?.workspace?.nightShifts && !workspace.nightShifts)
        fail(409, 'DRAFT_FORMAT_CHANGED');
      // A stale browser must reload rather than erase newly added meter slots.
      if (
        workspace &&
        ['drafts', 'workingHours', 'nightShifts'].some(
          (collection) =>
            (old?.workspace?.[collection]?.UNILAND?.meterLayout || 0) >
            (body.workspace?.[collection]?.UNILAND?.meterLayout || 0),
        )
      )
        fail(409, 'DRAFT_FORMAT_CHANGED');
      if (old?.unchanged)
        return { version: old.version, unchanged: true, updated_at: old.updated_at };
      if ((old?.version || 0) !== body.baseVersion) fail(409, 'DRAFT_CONFLICT');
      const version = (old?.version || 0) + 1;
      const saved = await client.query(
        'INSERT INTO meter_app.working_drafts(owner_id,workspace,version) VALUES($1,$2::jsonb,$3) ON CONFLICT(owner_id) DO UPDATE SET workspace=excluded.workspace,version=excluded.version,updated_at=now() RETURNING updated_at',
        [user.id, workspace === null ? null : JSON.stringify(workspace), version],
      );
      return { version, updated_at: saved.rows[0].updated_at };
    });
    send(res, 200, result);
  });
}
