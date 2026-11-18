import { endpoint, appOrigin, send, fail } from './http.js';
import { getPool } from './db.js';
import { requireUser, limit } from './auth.js';
import { dayDiff, shiftDate } from '../numbers.js';
import { graphRecords, graphValues } from '../graph-data.js';
import { graphHasValues } from '../graph-overlap.js';
import { restorePeriodDraft } from '../draft-records.js';
import { createDraft } from '../engine.js';
import { observationTime, periodKind } from '../reading-period.js';
import { seedElectricity, electricityConflicts } from '../observations.js';
import { seedUtilityReadings, utilityConflicts, projectGasPeriod } from '../utility-periods.js';
import { gasCalibration, gasMassText } from '../gas.js';
import { reportSnapshot } from './report-data.js';

// Read-only daily projection of working observations. Never rewrite saved documents/output.
function recordedDailyRows(rows, plant, start, endDate) {
  const points = new Map(),
    sources = [];
  for (const row of rows) {
    if (!row.autosaved || !row.snapshot?.draft) continue;
    try {
      const draft = restorePeriodDraft(row.snapshot.draft);
      const days = dayDiff(row.start_date, row.end_date);
      if (
        draft.plantKey !== plant ||
        periodKind(draft) !== 'daily' ||
        draft.startDate !== row.start_date ||
        draft.endDate !== row.end_date ||
        days === null ||
        days < 1 ||
        days > 366
      )
        continue;
      sources.push({ row, draft });
      for (const side of ['start', 'end']) {
        if (observationTime(draft, side) !== '08:00') continue;
        const date = draft[side + 'Date'];
        if (!points.has(date)) points.set(date, []);
        points.get(date).push({ row, draft });
      }
    } catch {
      /* An incompatible saved format stays visible through its stored output. */
    }
  }
  if (!sources.some(({ row }) => dayDiff(row.start_date, row.end_date) > 1)) return rows;
  const eligible = new Set(sources.map(({ row }) => row.id));
  const conflicts = new Set();
  for (const [date, entries] of points) {
    const drafts = [...new Set(entries.map((entry) => entry.draft))];
    if (
      electricityConflicts(drafts, date).length ||
      utilityConflicts(drafts, date).some((conflict) => conflict.kind !== 'gas')
    )
      conflicts.add(date);
  }
  const result = [...rows];
  const calculated = new Map();
  const valuesFor = (row) => {
    if (!calculated.has(row)) calculated.set(row, graphValues(row.snapshot, plant));
    return calculated.get(row);
  };
  const hasValues = (row) => graphHasValues({ values: valuesFor(row) });
  const daily = new Map(
    rows
      .filter((row) => dayDiff(row.start_date, row.end_date) === 1 && hasValues(row))
      .map((row) => [row.start_date, row]),
  );
  for (const date of [...points.keys()].sort()) {
    const end = shiftDate(date, 1);
    if (
      !points.has(end) ||
      daily.has(date) ||
      conflicts.has(date) ||
      conflicts.has(end) ||
      (start && date < start) ||
      (endDate && date > endDate)
    )
      continue;
    if (
      !sources.some(
        ({ row }) =>
          row.start_date <= date &&
          end <= row.end_date &&
          dayDiff(row.start_date, row.end_date) > 1,
      )
    )
      continue;
    const endpoints = [...new Set([...points.get(date), ...points.get(end)])];
    const drafts = [...new Set(endpoints.map((point) => point.draft))];
    const empty = createDraft(plant, date, end);
    empty.water = { start: '', end: '' };
    const electricity = seedElectricity(drafts, [empty])[0];
    const draft = seedUtilityReadings(drafts, [electricity])[0];
    // Untimed refill events and manual gas totals cannot be allocated between days.
    // Leave these unavailable; only an exact saved daily document supplies them.
    draft.gas.entries.forEach((entry) => {
      entry.enabled = false;
      entry.refills = [];
    });
    const snapshot = reportSnapshot(draft, { allowPartial: true });
    if (!graphHasValues({ values: graphValues(snapshot, plant) })) continue;
    const row = {
      id: 'readings:' + plant + ':' + date,
      revision: 1,
      start_date: date,
      end_date: end,
      autosaved: true,
      derived: true,
      sourcePeriods: [...new Set(endpoints.map((p) => p.row.id))],
      snapshot,
    };
    daily.set(date, row);
    result.push(row);
  }
  return result.map((row) => {
    if (!eligible.has(row.id) || dayDiff(row.start_date, row.end_date) < 2) return row;
    const keys = Object.keys(valuesFor(row)).filter(
      (key) =>
        Number.isFinite(valuesFor(row)[key]) &&
        (/^[rw]\d+$/.test(key) || key === 'u4' || (plant === 'JRE' && key === 'u5')),
    );
    if (!keys.length) return row;
    // Only a complete daily partition replaces a combined copy in the plotting view.
    // Conflicting or absent endpoint values leave the original overlap diagnostics intact.
    for (let date = row.start_date; date < row.end_date; date = shiftDate(date, 1)) {
      const next = daily.get(date);
      if (
        !next ||
        (!next.derived && !eligible.has(next.id)) ||
        conflicts.has(date) ||
        conflicts.has(shiftDate(date, 1)) ||
        !hasValues(next) ||
        !keys.every((key) => Number.isFinite(valuesFor(next)[key]))
      )
        return row;
    }
    return { ...row, superseded: true, dailyCoverage: true };
  });
}

const gasMetrics = (plant) =>
  gasCalibration(plant).gases.map((gas) =>
    plant === 'JRE' ? 'u' + gas.utilityIndex : 'kg' + gas.utilityIndex,
  );
function needsGasProjection(row, plant) {
  if (!row.autosaved || !row.snapshot?.draft || row.snapshot.periodValid === false) return false;
  const values = graphValues(row.snapshot, plant, { stockIncreases: true });
  return gasMetrics(plant).some((key) => !Number.isFinite(values[key]) || values[key] < 0);
}
export function workingDailyRows(rows, plant, start, endDate, gasRows = []) {
  const daily = recordedDailyRows(rows, plant, start, endDate);
  if (!gasRows.length) return daily;
  const sources = gasRows.flatMap((row) => {
    if (!row.autosaved || row.snapshot?.periodValid === false || !row.snapshot?.draft) return [];
    try {
      const draft = restorePeriodDraft(row.snapshot.draft);
      return draft.plantKey === plant &&
        draft.startDate === row.start_date &&
        draft.endDate === row.end_date &&
        periodKind(draft) === row.report_kind
        ? [{ row, draft }]
        : [];
    } catch {
      return [];
    }
  });
  return daily.map((row) => {
    if (!needsGasProjection(row, plant) || dayDiff(row.start_date, row.end_date) !== 1) return row;
    let target;
    try {
      target = restorePeriodDraft(row.snapshot.draft);
    } catch {
      return row;
    }
    if (
      periodKind(target) !== 'daily' ||
      target.startDate !== row.start_date ||
      target.endDate !== row.end_date ||
      target.plantKey !== plant
    )
      return row;
    const projection = projectGasPeriod(
      target,
      sources.map((source) => source.draft),
    );
    if (!projection) return row;
    const current = graphValues(row.snapshot, plant, { stockIncreases: true }),
      values = {};
    gasMetrics(plant).forEach((key, i) => {
      const result = projection.values[i];
      if ((!Number.isFinite(current[key]) || current[key] < 0) && result) {
        const value = Number(gasMassText(result.kg, result.kgText));
        if (value !== current[key]) values[key] = value;
      }
    });
    if (!Object.keys(values).length) return row;
    return {
      ...row,
      gasProjection: values,
      sourcePeriods: [
        ...new Set([
          ...(row.sourcePeriods || []),
          row.id,
          ...projection.sources.map(
            (draft) => sources.find((source) => source.draft === draft).row.id,
          ),
        ]),
      ],
    };
  });
}
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
    const view = params.get('view') || 'working';
    if (!['working', 'checkpoint'].includes(view)) fail(400, 'INVALID_INPUT');
    if (!['daily', 'workingHours', 'nightShift'].includes(kind)) fail(400, 'INVALID_INPUT');
    const days = dayDiff(start, end);
    if (!['JRE', 'UNILAND'].includes(plant) || days === null || days < 0 || days > 365)
      fail(400, 'INVALID_GRAPH_RANGE');
    const loadRows = (kinds, raw = false) =>
      db.query(
        `WITH documents AS (
        SELECT r.id,r.revision,r.start_date,r.end_date,r.report_kind,v.snapshot,false AS autosaved,r.revision AS checkpoint_revision
        FROM meter_app.reports r JOIN meter_app.report_revisions v ON v.report_id=r.id AND v.revision=r.revision
        WHERE r.owner_id=$1 AND r.plant=$2 AND r.start_date >= $3::date AND r.start_date <= $4::date AND r.report_kind=ANY($5::text[])
        AND ($6::boolean OR NOT EXISTS(SELECT 1 FROM meter_app.period_autosaves a WHERE a.owner_id=r.owner_id AND a.plant=r.plant AND a.report_kind=r.report_kind AND a.start_date=r.start_date AND a.end_date=r.end_date))
        UNION ALL
        SELECT a.id,GREATEST(COALESCE(r.revision,0),1) AS revision,a.start_date,a.end_date,a.report_kind,a.snapshot,true AS autosaved,COALESCE(r.revision,0) AS checkpoint_revision
        FROM meter_app.period_autosaves a LEFT JOIN meter_app.reports r ON r.owner_id=a.owner_id AND r.plant=a.plant AND r.report_kind=a.report_kind AND r.start_date=a.start_date AND r.end_date=a.end_date
        WHERE a.owner_id=$1 AND a.plant=$2 AND a.start_date >= $3::date AND a.start_date <= $4::date AND a.report_kind=ANY($5::text[]) AND NOT $6::boolean
      ) SELECT id,revision,start_date::text,end_date::text,report_kind,autosaved,checkpoint_revision,
       jsonb_build_object('period',jsonb_build_object('kind',report_kind,'startTime',snapshot->'draft'->'startTime','endTime',snapshot->'draft'->'endTime'),
       'complete',snapshot->'complete','periodValid',snapshot->'periodValid',
       'draft',CASE WHEN NOT $6::boolean AND $7::boolean THEN snapshot->'draft' ELSE NULL END,
       'output',jsonb_build_object('reportText',snapshot->'output'->'reportText','worksheetText',snapshot->'output'->'worksheetText')) AS snapshot
      FROM documents ORDER BY start_date,end_date,id LIMIT 1001`,
        [user.id, plant, start, end, kinds, view === 'checkpoint', raw],
      );
    const project = kind === 'daily' && view === 'working';
    const { rows } = await loadRows([kind], project);
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
    const gasRows =
      project && rows.some((row) => needsGasProjection(row, plant))
        ? (await loadRows(['workingHours', 'nightShift'], true)).rows
        : [];
    if (gasRows.length > 1000) fail(422, 'GRAPH_RANGE_TOO_LARGE');
    const working = project ? workingDailyRows(rows, plant, start, end, gasRows) : rows;
    send(res, 200, {
      plant,
      start,
      end,
      kind,
      view,
      records: graphRecords(working, plant, history),
    });
  });
}
