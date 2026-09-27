import { endpoint, appOrigin, send, fail } from './http.js';
import { getPool } from './db.js';
import { requireUser } from './auth.js';
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
    const params = new URL(req.url, origin).searchParams;
    const plant = params.get('plant'),
      start = params.get('start'),
      end = params.get('end');
    const days = dayDiff(start, end);
    if (!['JRE', 'UNILAND'].includes(plant) || days === null || days < 0 || days > 365)
      fail(400, 'INVALID_GRAPH_RANGE');
    const { rows } = await db.query(
      'SELECT r.id,r.revision,r.start_date::text,r.end_date::text,v.snapshot FROM meter_app.reports r JOIN meter_app.report_revisions v ON v.report_id=r.id AND v.revision=r.revision WHERE r.owner_id=$1 AND r.plant=$2 AND r.start_date >= $3::date AND r.start_date <= $4::date ORDER BY r.start_date,r.end_date,r.id LIMIT 1001',
      [user.id, plant, start, end],
    );
    const history = (
      await db.query(
        'SELECT h.id,h.start_date::text,h.end_date::text,h.metric_values,h.source_sheet,h.source_range,b.source_name FROM meter_app.consumption_history h JOIN meter_app.consumption_imports b ON b.id=h.import_id AND b.owner_id=h.owner_id WHERE h.owner_id=$1 AND h.plant=$2 AND h.start_date >= $3::date AND h.start_date <= $4::date ORDER BY h.start_date,h.end_date,h.id LIMIT 1001',
        [user.id, plant, start, end],
      )
    ).rows;
    if (rows.length + history.length > 1000) fail(422, 'GRAPH_RANGE_TOO_LARGE');
    send(res, 200, { plant, start, end, records: graphRecords(rows, plant, history) });
  });
}
