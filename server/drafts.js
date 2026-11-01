import { validDate } from '../numbers.js';
import { endpoint, appOrigin, checkOrigin, readBody, send, fail } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, lockUser, limit } from './auth.js';
import { restoreWorkspace } from '../storage.js';
import { JRE_METER_LAYOUT } from '../meter-layout.js';
import {
  workspaceDrafts,
  restorePeriodDraft,
  periodKey,
  PERIOD_BATCH_SIZE,
} from '../draft-records.js';
import {
  planPeriodAutosaves,
  writePeriodAutosaves,
  readPeriodReferences,
} from './period-autosaves.js';

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
      await limit(db, 'reads:' + user.id, 600, env);
      const params = new URL(req.url, origin).searchParams;
      if (params.has('period')) {
        const parts = params.get('period').split(':');
        if (
          parts.length !== 4 ||
          !['JRE', 'UNILAND'].includes(parts[0]) ||
          !['daily', 'workingHours', 'nightShift'].includes(parts[1]) ||
          !validDate(parts[2]) ||
          !validDate(parts[3])
        )
          fail(400, 'INVALID_INPUT');
        const row = (
          await db.query(
            `SELECT a.snapshot,a.version,0 AS priority FROM meter_app.period_autosaves a WHERE a.owner_id=$1 AND a.plant=$2 AND a.report_kind=$3 AND a.start_date=$4::date AND a.end_date=$5::date
          UNION ALL SELECT v.snapshot,0 AS version,1 AS priority FROM meter_app.reports r JOIN meter_app.report_revisions v ON v.report_id=r.id AND v.revision=r.revision WHERE r.owner_id=$1 AND r.plant=$2 AND r.report_kind=$3 AND r.start_date=$4::date AND r.end_date=$5::date
          ORDER BY priority LIMIT 1`,
            [user.id, ...parts],
          )
        ).rows[0];
        return send(res, 200, {
          key: params.get('period'),
          draft: row?.snapshot?.draft || null,
          version: row?.version || 0,
        });
      }
      const row = (
        await db.query(
          'SELECT workspace,version,updated_at FROM meter_app.working_drafts WHERE owner_id=$1',
          [user.id],
        )
      ).rows[0];
      return send(
        res,
        200,
        row
          ? {
              ...row,
              ...(row.workspace?.autosaveLayout === 1
                ? {
                    records: await readPeriodReferences(
                      db,
                      user.id,
                      workspaceDrafts(row.workspace),
                    ),
                  }
                : {}),
            }
          : { workspace: null, version: 0 },
      );
    }
    await limit(db, 'drafts:' + user.id, 180, env);
    const body = await readBody(req, 512 * 1024);
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
    const modern = workspace?.autosaveLayout === 1;
    let periods = [];
    if (body.periods !== undefined) {
      if (!modern || !Array.isArray(body.periods) || body.periods.length > PERIOD_BATCH_SIZE)
        fail(400, 'INVALID_DRAFT');
      // Queued periods may belong to dates outside the active workspace.
      // Check their original layout before migration can hide an omitted meter.
      if (
        body.periods.some(
          (draft) => draft?.plantKey === 'JRE' && draft.meterLayout !== JRE_METER_LAYOUT,
        )
      )
        fail(409, 'DRAFT_FORMAT_CHANGED');
      try {
        periods = body.periods.map(restorePeriodDraft);
      } catch {
        fail(400, 'INVALID_DRAFT');
      }
      if (periods.some((draft) => !periodKey(draft))) fail(400, 'INVALID_DRAFT');
    }
    const result = await transaction(db, async (client) => {
      // The owner row lock serializes creation as well as updates, including empty tombstones.
      await lockUser(client, user, { exclusive: true });
      const old = (
        await client.query(
          'SELECT version,updated_at,workspace,workspace IS NOT DISTINCT FROM $2::jsonb AS unchanged FROM meter_app.working_drafts WHERE owner_id=$1',
          [user.id, workspace === null ? null : JSON.stringify(workspace)],
        )
      ).rows[0];
      if (workspace && old?.workspace?.autosaveLayout === 1 && !modern)
        fail(409, 'DRAFT_FORMAT_CHANGED');
      if (workspace && old?.workspace?.workingHours && !workspace.workingHours)
        fail(409, 'DRAFT_FORMAT_CHANGED');
      if (workspace && old?.workspace?.nightShifts && !workspace.nightShifts)
        fail(409, 'DRAFT_FORMAT_CHANGED');
      if (
        workspace &&
        ['workingHours', 'nightShifts'].some((collection) =>
          ['JRE', 'UNILAND'].some(
            (plant) =>
              old?.workspace?.[collection]?.[plant]?.utilityLayout === 1 &&
              body.workspace?.[collection]?.[plant]?.utilityLayout !== 1,
          ),
        )
      )
        fail(409, 'DRAFT_FORMAT_CHANGED');
      // A stale browser must reload rather than erase newly added meter slots.
      if (
        workspace &&
        ['drafts', 'workingHours', 'nightShifts'].some((collection) =>
          ['JRE', 'UNILAND'].some(
            (plant) =>
              (old?.workspace?.[collection]?.[plant]?.meterLayout || 0) >
              (body.workspace?.[collection]?.[plant]?.meterLayout || 0),
          ),
        )
      )
        fail(409, 'DRAFT_FORMAT_CHANGED');
      const stale = (old?.version || 0) !== body.baseVersion;
      if (stale && !old?.unchanged) fail(409, 'DRAFT_CONFLICT');
      const plan = modern
        ? await planPeriodAutosaves(client, user.id, [...periods, ...workspaceDrafts(workspace)], {
            previous: old?.workspace,
            versions: body.periodVersions,
          })
        : { changes: [], records: [] };
      if (stale && plan.changes.length) fail(409, 'DRAFT_CONFLICT');
      if (old?.unchanged && !plan.changes.length)
        return {
          version: old.version,
          unchanged: true,
          updated_at: old.updated_at,
          ...(modern ? { records: plan.records, recordsChanged: false } : {}),
        };
      if (stale) fail(409, 'DRAFT_CONFLICT');
      const records = modern ? await writePeriodAutosaves(client, user.id, plan) : [];
      const version = (old?.version || 0) + 1;
      const saved = await client.query(
        'INSERT INTO meter_app.working_drafts(owner_id,workspace,version) VALUES($1,$2::jsonb,$3) ON CONFLICT(owner_id) DO UPDATE SET workspace=excluded.workspace,version=excluded.version,updated_at=now() RETURNING updated_at',
        [user.id, workspace === null ? null : JSON.stringify(workspace), version],
      );
      return {
        version,
        updated_at: saved.rows[0].updated_at,
        ...(modern ? { records, recordsChanged: plan.changes.length > 0 } : {}),
      };
    });
    send(res, 200, result);
  });
}
