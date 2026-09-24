import { randomUUID } from 'node:crypto';
import { endpoint, appOrigin, checkOrigin, readBody, send, fail, uuid } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, lockUser, limit, audit } from './auth.js';
import { reportSnapshot } from './report-data.js';

export function reportsHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const origin = appOrigin(env);
    const db = database();
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (req.method === 'POST') checkOrigin(req, origin);
    const user = await requireUser(db, req, origin);
    const params = new URL(req.url, origin).searchParams;
    if (req.method === 'GET') {
      const id = params.get('id');
      if (id) {
        uuid(id);
        const report = (
          await db.query(
            'SELECT id, plant, revision FROM meter_app.reports WHERE id=$1 AND owner_id=$2',
            [id, user.id],
          )
        ).rows[0];
        if (!report) fail(404, 'NOT_FOUND');
        const selected = Number(params.get('revision') || report.revision);
        if (!Number.isSafeInteger(selected) || selected < 1) fail(400, 'INVALID_INPUT');
        const revision = (
          await db.query(
            'SELECT revision, snapshot, created_at FROM meter_app.report_revisions WHERE report_id=$1 AND revision=$2',
            [id, selected],
          )
        ).rows[0];
        if (!revision) fail(404, 'NOT_FOUND');
        return send(res, 200, { id, latestRevision: report.revision, ...revision });
      }
      const page = Number(params.get('page') || 0);
      const plant = params.get('plant') || null;
      if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page > 5000 ||
        (plant && !['JRE', 'UNILAND'].includes(plant))
      )
        fail(400, 'INVALID_INPUT');
      const { rows } = await db.query(
        'SELECT id,plant,start_date::text,end_date::text,revision,updated_at FROM meter_app.reports WHERE owner_id=$1 AND ($2::text IS NULL OR plant=$2) ORDER BY updated_at DESC,id LIMIT 21 OFFSET $3',
        [user.id, plant, page * 20],
      );
      return send(res, 200, { reports: rows.slice(0, 20), hasMore: rows.length > 20 });
    }
    await limit(db, 'reports:' + user.id, 120, env);
    const body = await readBody(req);
    const snapshot = reportSnapshot(body.draft);
    const { draft } = snapshot;
    const editing = body.id !== undefined && body.id !== null;
    const id = editing ? uuid(body.id) : randomUUID();
    if (editing && (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 1))
      fail(400, 'INVALID_INPUT');
    const result = await transaction(db, async (client) => {
      await lockUser(client, user);
      let revision = 1;
      if (editing) {
        const report = (
          await client.query(
            'SELECT plant,start_date::text,end_date::text,revision FROM meter_app.reports WHERE id=$1 AND owner_id=$2 FOR UPDATE',
            [id, user.id],
          )
        ).rows[0];
        if (!report) fail(404, 'NOT_FOUND');
        if (report.revision !== body.baseRevision) fail(409, 'REVISION_CONFLICT');
        if (
          report.plant !== draft.plantKey ||
          report.start_date !== draft.startDate ||
          report.end_date !== draft.endDate
        )
          fail(400, 'PERIOD_CHANGED');
        revision = report.revision + 1;
        await client.query(
          'UPDATE meter_app.reports SET revision=$2,updated_at=now() WHERE id=$1',
          [id, revision],
        );
      } else {
        await client.query(
          'INSERT INTO meter_app.reports(id,owner_id,plant,start_date,end_date,revision) VALUES ($1,$2,$3,$4,$5,1)',
          [id, user.id, draft.plantKey, draft.startDate, draft.endDate],
        );
      }
      await client.query(
        'INSERT INTO meter_app.report_revisions(report_id,revision,actor_id,snapshot) VALUES ($1,$2,$3,$4)',
        [id, revision, user.id, JSON.stringify(snapshot)],
      );
      await audit(client, user.id, editing ? 'report.revised' : 'report.created', id);
      return { id, revision, snapshot };
    });
    send(res, editing ? 200 : 201, result);
  });
}
