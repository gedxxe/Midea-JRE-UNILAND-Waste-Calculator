import { endpoint, appOrigin, send, fail } from './http.js';
import { getPool } from './db.js';
import { requireUser, limit } from './auth.js';
import { dayDiff } from '../numbers.js';
import { graphRecords } from '../graph-data.js';
export function graphsHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    const origin = appOrigin(env),
      db = database(),
      user = await requireUser(db, req, origin);
    await limit(db, 'graphs:read:' + user.id, 120, env);
    const params = new URL(req.url, origin).searchParams;
    const plant = params.get('plant'),
      start = params.get('start'),
      end = params.get('end');
    const kind = params.get('kind') || 'daily';
    if (!['daily', 'workingHours', 'nightShift'].includes(kind)) fail(400, 'INVALID_INPUT');
    const days = dayDiff(start, end);
    if (!['JRE', 'UNILAND'].includes(plant) || days === null || days < 0 || days > 365)
      fail(400, 'INVALID_GRAPH_RANGE');
    const { rows } = await db.query(
      `WITH documents AS (
        SELECT r.id,r.revision,r.start_date,r.end_date,r.report_kind,v.snapshot,false AS autosaved
        FROM meter_app.reports r JOIN meter_app.report_revisions v ON v.report_id=r.id AND v.revision=r.revision
        WHERE r.owner_id=$1 AND r.plant=$2 AND r.start_date >= $3::date AND r.start_date <= $4::date AND r.report_kind=$5
        AND NOT EXISTS(SELECT 1 FROM meter_app.period_autosaves a WHERE a.owner_id=r.owner_id AND a.plant=r.plant AND a.report_kind=r.report_kind AND a.start_date=r.start_date AND a.end_date=r.end_date)
        UNION ALL
        SELECT a.id,GREATEST(COALESCE(r.revision,0),1) AS revision,a.start_date,a.end_date,a.report_kind,a.snapshot,true AS autosaved
        FROM meter_app.period_autosaves a LEFT JOIN meter_app.reports r ON r.owner_id=a.owner_id AND r.plant=a.plant AND r.report_kind=a.report_kind AND r.start_date=a.start_date AND r.end_date=a.end_date
        WHERE a.owner_id=$1 AND a.plant=$2 AND a.start_date >= $3::date AND a.start_date <= $4::date AND a.report_kind=$5
      ) SELECT id,revision,start_date::text,end_date::text,autosaved,
       jsonb_build_object('period',jsonb_build_object('kind',report_kind,'startTime',snapshot->'draft'->'startTime','endTime',snapshot->'draft'->'endTime'),
       'complete',snapshot->'complete','periodValid',snapshot->'periodValid',
       'output',jsonb_build_object('reportText',snapshot->'output'->'reportText','worksheetText',snapshot->'output'->'worksheetText')) AS snapshot
      FROM documents ORDER BY start_date,end_date,id LIMIT 1001`,
      [user.id, plant, start, end, kind],
    );
    const history =
      kind !== 'daily'
        ? []
        : (
            await db.query(
              'SELECT h.id,h.start_date::text,h.end_date::text,h.metric_values,h.source_sheet,h.source_range,b.source_name FROM meter_app.consumption_history h JOIN meter_app.consumption_imports b ON b.id=h.import_id AND b.owner_id=h.owner_id WHERE h.owner_id=$1 AND h.plant=$2 AND h.start_date >= $3::date AND h.start_date <= $4::date ORDER BY h.start_date,h.end_date,h.id LIMIT 1001',
              [user.id, plant, start, end],
            )
          ).rows;
    if (rows.length + history.length > 1000) fail(422, 'GRAPH_RANGE_TOO_LARGE');
    send(res, 200, { plant, start, end, kind, records: graphRecords(rows, plant, history) });
  });
}
