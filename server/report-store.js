import { randomUUID } from 'node:crypto';
import { periodKind, reportLinkKey } from '../reading-period.js';
import { samePeriodContent, workspaceDrafts } from '../draft-records.js';
import { fail, uuid } from './http.js';
import { audit } from './auth.js';
import { readPeriodReferences } from './period-autosaves.js';

export async function saveCheckpoint(client, user, body, snapshot) {
  const modern = body.autosaveLayout === 1,
    draft = snapshot.draft,
    kind = periodKind(draft),
    editing = body.id !== undefined && body.id !== null;
  if (editing) uuid(body.id);
  if (
    (editing || modern) &&
    (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < (modern ? 0 : 1))
  )
    fail(400, 'INVALID_INPUT');
  if (modern && (!Number.isSafeInteger(body.workspaceVersion) || body.workspaceVersion < 0))
    fail(400, 'INVALID_INPUT');
  if (editing) {
    const target = (
      await client.query(
        `SELECT plant,report_kind,start_date::text,end_date::text FROM meter_app.reports WHERE id=$1 AND owner_id=$2
      UNION ALL SELECT plant,report_kind,start_date::text,end_date::text FROM meter_app.period_autosaves WHERE id=$1 AND owner_id=$2 LIMIT 1`,
        [body.id, user.id],
      )
    ).rows[0];
    if (!target) fail(404, 'NOT_FOUND');
    if (
      target.plant !== draft.plantKey ||
      target.report_kind !== kind ||
      target.start_date !== draft.startDate ||
      target.end_date !== draft.endDate
    )
      fail(409, 'PERIOD_CHANGED');
  }
  const params = [user.id, draft.plantKey, kind, draft.startDate, draft.endDate];
  const report = (
    await client.query(
      'SELECT id,revision FROM meter_app.reports WHERE owner_id=$1 AND plant=$2 AND report_kind=$3 AND start_date=$4 AND end_date=$5 FOR UPDATE',
      params,
    )
  ).rows[0];
  const working = (
    await client.query(
      'SELECT id FROM meter_app.period_autosaves WHERE owner_id=$1 AND plant=$2 AND report_kind=$3 AND start_date=$4 AND end_date=$5',
      params,
    )
  ).rows[0];
  if (!modern && working) fail(409, 'AUTOSAVE_FORMAT_CHANGED');
  const workspace = modern
    ? (
        await client.query(
          'SELECT workspace,version,updated_at FROM meter_app.working_drafts WHERE owner_id=$1',
          [user.id],
        )
      ).rows[0]
    : null;
  const id = report?.id || working?.id || randomUUID();
  if (report) {
    const previous = (
      await client.query(
        'SELECT snapshot FROM meter_app.report_revisions WHERE report_id=$1 AND revision=$2',
        [report.id, report.revision],
      )
    ).rows[0];
    if (previous && samePeriodContent(previous.snapshot, snapshot))
      return {
        id,
        revision: report.revision,
        snapshot: previous.snapshot,
        unchanged: true,
        created: false,
        ...(modern
          ? {
              workspace: workspace?.workspace || null,
              workspaceVersion: workspace?.version || 0,
              updated_at: workspace?.updated_at,
              records: await readPeriodReferences(
                client,
                user.id,
                workspaceDrafts(workspace?.workspace),
              ),
            }
          : {}),
      };
    if (!editing && !modern) fail(409, 'ALREADY_EXISTS');
    if (body.baseRevision !== report.revision) fail(409, 'REVISION_CONFLICT');
  } else if (modern && body.baseRevision !== 0) fail(409, 'REVISION_CONFLICT');
  if (modern && (!workspace || workspace.version !== body.workspaceVersion))
    fail(409, 'DRAFT_CONFLICT');
  const revision = (report?.revision || 0) + 1;
  if (report)
    await client.query('UPDATE meter_app.reports SET revision=$2,updated_at=now() WHERE id=$1', [
      id,
      revision,
    ]);
  else
    await client.query(
      'INSERT INTO meter_app.reports(id,owner_id,plant,start_date,end_date,revision,report_kind) VALUES($1,$2,$3,$4,$5,1,$6)',
      [id, user.id, draft.plantKey, draft.startDate, draft.endDate, kind],
    );
  await client.query(
    'INSERT INTO meter_app.report_revisions(report_id,revision,actor_id,snapshot) VALUES($1,$2,$3,$4)',
    [id, revision, user.id, JSON.stringify(snapshot)],
  );
  await audit(client, user.id, report ? 'report.revised' : 'report.created', id);
  if (!modern) return { id, revision, snapshot, created: !report };
  const next = structuredClone(workspace.workspace);
  next.autosaveLayout = 1;
  next.reportLinks ??= {};
  next.reportLinks[reportLinkKey(draft)] = {
    id,
    revision,
    startDate: draft.startDate,
    endDate: draft.endDate,
  };
  await client.query(
    `INSERT INTO meter_app.period_autosaves(id,owner_id,plant,report_kind,start_date,end_date,snapshot,base_revision)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,plant,report_kind,start_date,end_date) DO UPDATE SET
    snapshot=excluded.snapshot,base_revision=excluded.base_revision,version=period_autosaves.version+1,saved_at=now()`,
    [
      id,
      user.id,
      draft.plantKey,
      kind,
      draft.startDate,
      draft.endDate,
      JSON.stringify(snapshot),
      revision,
    ],
  );
  const version = workspace.version + 1;
  const saved = await client.query(
    'UPDATE meter_app.working_drafts SET workspace=$2,version=$3,updated_at=now() WHERE owner_id=$1 RETURNING updated_at',
    [user.id, JSON.stringify(next), version],
  );
  return {
    id,
    revision,
    snapshot,
    created: !report,
    workspace: next,
    workspaceVersion: version,
    updated_at: saved.rows[0].updated_at,
    records: await readPeriodReferences(client, user.id, workspaceDrafts(next)),
  };
}
