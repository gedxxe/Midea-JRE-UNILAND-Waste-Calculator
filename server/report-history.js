import { fail } from './http.js';

// One document per owner/plant/mode/period. Working copies do not replace checkpoints.
export async function listReportDocuments(db, owner, plant, kind, offset) {
  return (
    await db.query(
      `SELECT * FROM (
    SELECT a.id,a.plant,a.start_date::text,a.end_date::text,a.report_kind,
     GREATEST(COALESCE(r.revision,0),1) AS revision,COALESCE(r.revision,0) AS checkpoint_revision,
     a.saved_at AS updated_at,true AS autosaved,COALESCE((a.snapshot->>'complete')::boolean,false) AS complete
    FROM meter_app.period_autosaves a LEFT JOIN meter_app.reports r
     ON r.owner_id=a.owner_id AND r.plant=a.plant AND r.report_kind=a.report_kind AND r.start_date=a.start_date AND r.end_date=a.end_date
    WHERE a.owner_id=$1 AND ($2::text IS NULL OR a.plant=$2) AND a.report_kind=$3
    UNION ALL
    SELECT r.id,r.plant,r.start_date::text,r.end_date::text,r.report_kind,r.revision,r.revision AS checkpoint_revision,r.updated_at,false AS autosaved,true AS complete
    FROM meter_app.reports r WHERE r.owner_id=$1 AND ($2::text IS NULL OR r.plant=$2) AND r.report_kind=$3
    AND NOT EXISTS(SELECT 1 FROM meter_app.period_autosaves a WHERE a.owner_id=r.owner_id AND a.plant=r.plant AND a.report_kind=r.report_kind AND a.start_date=r.start_date AND a.end_date=r.end_date)
   ) documents ORDER BY updated_at DESC,id LIMIT 21 OFFSET $4`,
      [owner, plant, kind, offset],
    )
  ).rows;
}
export async function readReportDocument(db, owner, id, kind, requested) {
  // Read working content and checkpoint metadata from one PostgreSQL statement snapshot.
  const document = (
    await db.query(
      `SELECT r.revision,a.snapshot,a.saved_at FROM (VALUES($1::uuid,$2::uuid,$3::text)) v(id,owner_id,kind)
       LEFT JOIN meter_app.reports r ON r.id=v.id AND r.owner_id=v.owner_id AND r.report_kind=v.kind
       LEFT JOIN meter_app.period_autosaves a ON a.id=v.id AND a.owner_id=v.owner_id AND a.report_kind=v.kind
       WHERE r.id IS NOT NULL OR a.id IS NOT NULL`,
      [id, owner, kind],
    )
  ).rows[0];
  if (!document) fail(404, 'NOT_FOUND');
  const saved = document.revision ? document : null;
  const working = document.snapshot ? document : null;
  const selected = requested === null ? null : Number(requested);
  if (selected !== null && (!Number.isSafeInteger(selected) || selected < 1))
    fail(400, 'INVALID_INPUT');
  const checkpointRevision = saved?.revision || 0;
  const metadata = {
    id,
    latestRevision: Math.max(1, checkpointRevision),
    checkpointRevision,
    hasAutosave: !!working,
  };
  if (working && (selected === null || (!saved && selected === 1)))
    return {
      ...metadata,
      revision: Math.max(1, checkpointRevision),
      autosaved: true,
      created_at: working.saved_at,
      snapshot: working.snapshot,
    };
  const number = selected ?? checkpointRevision;
  const revision = (
    await db.query(
      'SELECT revision,snapshot,created_at FROM meter_app.report_revisions WHERE report_id=$1 AND revision=$2',
      [id, number],
    )
  ).rows[0];
  if (!revision) fail(404, 'NOT_FOUND');
  return { ...metadata, ...revision, autosaved: false };
}
