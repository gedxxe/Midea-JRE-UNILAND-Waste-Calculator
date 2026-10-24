import { endpoint, appOrigin, checkOrigin, readBody, send, fail, uuid } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, lockUser, limit } from './auth.js';
import { reportSnapshot } from './report-data.js';
import { periodKey } from '../draft-records.js';
import { saveCheckpoint } from './report-store.js';
import { listReportDocuments, readReportDocument } from './report-history.js';

export function reportsHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const origin = appOrigin(env),
      db = database();
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (req.method === 'POST') checkOrigin(req, origin);
    const user = await requireUser(db, req, origin),
      params = new URL(req.url, origin).searchParams;
    if (req.method === 'GET') {
      await limit(db, 'reads:' + user.id, 600, env);
      const kind = params.get('kind') || 'daily';
      if (!['daily', 'workingHours', 'nightShift'].includes(kind)) fail(400, 'INVALID_INPUT');
      const id = params.get('id');
      if (id) {
        uuid(id);
        return send(
          res,
          200,
          await readReportDocument(db, user.id, id, kind, params.get('revision')),
        );
      }
      const page = Number(params.get('page') || 0),
        plant = params.get('plant') || null;
      if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page > 5000 ||
        (plant && !['JRE', 'UNILAND'].includes(plant))
      )
        fail(400, 'INVALID_INPUT');
      const rows = await listReportDocuments(db, user.id, plant, kind, page * 20);
      return send(res, 200, { reports: rows.slice(0, 20), hasMore: rows.length > 20 });
    }
    await limit(db, 'reports:' + user.id, 120, env);
    const body = await readBody(req),
      modern = body.autosaveLayout === 1;
    if (!modern && periodKey(body.draft)) {
      const known = await db.query(
        'SELECT 1 FROM meter_app.period_autosaves WHERE owner_id=$1 AND plant=$2 AND report_kind=$3 AND start_date=$4 AND end_date=$5',
        [
          user.id,
          body.draft.plantKey,
          body.draft.periodKind || 'daily',
          body.draft.startDate,
          body.draft.endDate,
        ],
      );
      if (known.rowCount) fail(409, 'AUTOSAVE_FORMAT_CHANGED');
    }
    const snapshot = reportSnapshot(body.draft, { allowPartial: modern });
    if (modern && !periodKey(snapshot.draft)) fail(422, 'PERIOD_REQUIRED');
    const result = await transaction(db, async (client) => {
      await lockUser(client, user, { exclusive: true });
      return saveCheckpoint(client, user, body, snapshot);
    });
    send(res, result.created ? 201 : 200, result);
  });
}
