import { randomUUID } from 'node:crypto';
import { periodKind } from '../reading-period.js';
import { periodKey, hasEnteredData, samePeriodContent } from '../draft-records.js';
import { reportSnapshot } from './report-data.js';

const identity = (row) => [row.plant, row.report_kind, row.start_date, row.end_date].join(':');
const reference = (row) => ({
  id: row.id,
  key: identity(row),
  revision: Math.max(1, row.base_revision),
  checkpointRevision: row.base_revision,
  version: row.version,
  saved_at: row.saved_at,
  complete: row.snapshot.complete,
});
// Called under the account lock. Plans writes before touching either durable store.
export async function planPeriodAutosaves(client, owner, drafts) {
  const candidates = new Map();
  for (const draft of drafts) {
    const key = periodKey(draft);
    if (key && !draft.isExample) candidates.set(key, draft);
  }
  if (!candidates.size) return { changes: [], records: [] };
  const periods = [...candidates.values()].map((draft) => ({
    plant: draft.plantKey,
    report_kind: periodKind(draft),
    start_date: draft.startDate,
    end_date: draft.endDate,
  }));
  const { rows } = await client.query(
    `SELECT p.plant,p.report_kind,p.start_date::text,p.end_date::text,
    a.id,a.snapshot,a.version,a.base_revision,a.saved_at,r.id AS report_id,COALESCE(r.revision,0) AS checkpoint_revision
    FROM jsonb_to_recordset($2::jsonb) AS p(plant text,report_kind text,start_date date,end_date date)
    LEFT JOIN meter_app.period_autosaves a ON a.owner_id=$1 AND a.plant=p.plant AND a.report_kind=p.report_kind AND a.start_date=p.start_date AND a.end_date=p.end_date
    LEFT JOIN meter_app.reports r ON r.owner_id=$1 AND r.plant=p.plant AND r.report_kind=p.report_kind AND r.start_date=p.start_date AND r.end_date=p.end_date`,
    [owner, JSON.stringify(periods)],
  );
  const changes = [],
    records = [];
  for (const row of rows) {
    const draft = candidates.get(identity(row));
    if (!row.id && !hasEnteredData(draft)) continue;
    const snapshot = reportSnapshot(draft, { allowPartial: true });
    if (
      row.id &&
      samePeriodContent(row.snapshot, snapshot) &&
      row.snapshot.complete === snapshot.complete &&
      row.base_revision === row.checkpoint_revision
    ) {
      records.push(reference(row));
      continue;
    }
    changes.push({
      id: row.id || row.report_id || randomUUID(),
      plant: row.plant,
      report_kind: row.report_kind,
      start_date: row.start_date,
      end_date: row.end_date,
      snapshot,
      base_revision: row.checkpoint_revision,
    });
  }
  return { changes, records };
}
export async function writePeriodAutosaves(client, owner, plan) {
  if (!plan.changes.length) return plan.records;
  const { rows } = await client.query(
    `INSERT INTO meter_app.period_autosaves(id,owner_id,plant,report_kind,start_date,end_date,snapshot,base_revision)
    SELECT p.id,$1,p.plant,p.report_kind,p.start_date,p.end_date,p.snapshot,p.base_revision
    FROM jsonb_to_recordset($2::jsonb) AS p(id uuid,plant text,report_kind text,start_date date,end_date date,snapshot jsonb,base_revision integer)
    ON CONFLICT(owner_id,plant,report_kind,start_date,end_date) DO UPDATE SET
    snapshot=excluded.snapshot,base_revision=excluded.base_revision,version=period_autosaves.version+1,saved_at=now()
    RETURNING id,plant,report_kind,start_date::text,end_date::text,snapshot,version,base_revision,saved_at`,
    [owner, JSON.stringify(plan.changes)],
  );
  return [...plan.records, ...rows.map(reference)];
}
export async function readPeriodReferences(db, owner, drafts) {
  const periods = [
    ...new Map(
      drafts
        .filter((d) => periodKey(d))
        .map((d) => [
          periodKey(d),
          {
            plant: d.plantKey,
            report_kind: periodKind(d),
            start_date: d.startDate,
            end_date: d.endDate,
          },
        ]),
    ).values(),
  ];
  if (!periods.length) return [];
  const { rows } = await db.query(
    `SELECT COALESCE(a.id,r.id) AS id,p.plant,p.report_kind,p.start_date::text,p.end_date::text,
    COALESCE(a.version,0) AS version,COALESCE(r.revision,0) AS base_revision,
    COALESCE(a.saved_at,r.updated_at) AS saved_at,jsonb_build_object('complete',COALESCE(a.snapshot->'complete','true'::jsonb)) AS snapshot
    FROM jsonb_to_recordset($2::jsonb) AS p(plant text,report_kind text,start_date date,end_date date)
    LEFT JOIN meter_app.period_autosaves a ON a.owner_id=$1 AND a.plant=p.plant AND a.report_kind=p.report_kind AND a.start_date=p.start_date AND a.end_date=p.end_date
    LEFT JOIN meter_app.reports r ON r.owner_id=$1 AND r.plant=p.plant AND r.report_kind=p.report_kind AND r.start_date=p.start_date AND r.end_date=p.end_date
    WHERE a.id IS NOT NULL OR r.id IS NOT NULL`,
    [owner, JSON.stringify(periods)],
  );
  return rows.map(reference);
}
