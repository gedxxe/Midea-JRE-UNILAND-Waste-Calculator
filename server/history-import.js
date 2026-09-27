import { createHash, randomUUID } from 'node:crypto';
import { dayDiff } from '../numbers.js';
import { GRAPH_METRICS } from '../graph-schema.js';
import { transaction } from './db.js';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject = (code) => {
  throw new Error(code);
};
export function validateHistory(input) {
  if (
    input?.version !== 1 ||
    typeof input.sourceName !== 'string' ||
    !input.sourceName.trim() ||
    input.sourceName.length > 180 ||
    /[\\/]/.test(input.sourceName) ||
    !/^[a-f0-9]{64}$/.test(input.sourceSha256 || '') ||
    !Array.isArray(input.records) ||
    !input.records.length ||
    input.records.length > 1000
  )
    reject('INVALID_IMPORT');
  const records = input.records
    .map((r) => {
      const metrics = GRAPH_METRICS[r.plant]?.filter((m) => m.key.startsWith('w')),
        days = dayDiff(r.startDate, r.endDate);
      if (
        !metrics ||
        days === null ||
        days < 1 ||
        days > 366 ||
        !r.values ||
        typeof r.values !== 'object' ||
        Array.isArray(r.values) ||
        typeof r.sheet !== 'string' ||
        !r.sheet.trim() ||
        r.sheet.length > 100 ||
        !Number.isInteger(r.row) ||
        r.row < 1 ||
        r.row > 1048576 ||
        !/^[A-Z]{1,3}\d+:[A-Z]{1,3}\d+$/.test(r.range || '')
      )
        reject('INVALID_IMPORT_ROW');
      const values = {};
      for (const [key, value] of Object.entries(r.values)) {
        if (
          !metrics.some((m) => m.key === key) ||
          (value !== null &&
            (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e15))
        )
          reject('INVALID_IMPORT_VALUE');
        values[key] = value;
      }
      if (!Object.values(values).some(Number.isFinite)) reject('EMPTY_IMPORT_ROW');
      const groups =
        r.plant === 'JRE'
          ? [[5, [6, 7]]]
          : [
              [0, [2, 5]],
              [1, [3, 6, 7]],
            ];
      for (const [total, parts] of groups) {
        if (!Object.hasOwn(values, 'w' + total)) continue;
        const partsValues = parts.map((i) => values['w' + i]);
        const expected = partsValues.every(Number.isFinite)
          ? partsValues.reduce((a, b) => a + b, 0)
          : null;
        if (
          expected === null
            ? values['w' + total] !== null
            : !Number.isFinite(values['w' + total]) ||
              Math.abs(values['w' + total] - expected) > 1e-6
        )
          reject('INVALID_GROUP_TOTAL');
      }
      return {
        plant: r.plant,
        startDate: r.startDate,
        endDate: r.endDate,
        values: Object.fromEntries(Object.entries(values).sort()),
        sheet: r.sheet,
        row: r.row,
        range: r.range,
      };
    })
    .sort((a, b) => a.plant.localeCompare(b.plant) || a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < records.length; i++)
    if (records[i].plant === records[i - 1].plant && records[i].startDate < records[i - 1].endDate)
      reject('OVERLAPPING_IMPORT_ROWS');
  return { version: 1, sourceName: input.sourceName, sourceSha256: input.sourceSha256, records };
}
export async function importHistory(database, { username, input, apply = false, expectedPlan }) {
  const manifest = validateHistory(input),
    manifestHash = digest(manifest);
  return transaction(database, async (client) => {
    // Serializes maintenance imports; report creation also locks the owner row.
    await client.query('SELECT pg_advisory_xact_lock(728402)');
    const owner = (
      await client.query('SELECT id,active FROM meter_app.users WHERE username=$1 FOR UPDATE', [
        username,
      ])
    ).rows[0];
    if (!owner?.active) reject('IMPORT_OWNER_NOT_ACTIVE');
    const previous = (
      await client.query(
        'SELECT imported_rows,skipped_rows FROM meter_app.consumption_imports WHERE owner_id=$1 AND manifest_sha256=$2',
        [owner.id, manifestHash],
      )
    ).rows[0];
    if (previous)
      return {
        alreadyImported: true,
        imported: previous.imported_rows,
        skipped: previous.skipped_rows,
        manifestHash,
      };
    const reports = (
      await client.query(
        'SELECT id,plant,start_date::text,end_date::text,revision FROM meter_app.reports WHERE owner_id=$1 ORDER BY id',
        [owner.id],
      )
    ).rows;
    const history = (
      await client.query(
        'SELECT id,plant,start_date::text,end_date::text,metric_values FROM meter_app.consumption_history WHERE owner_id=$1 ORDER BY id',
        [owner.id],
      )
    ).rows;
    const insert = [],
      skipped = [];
    for (const row of manifest.records) {
      const overlap = (r) =>
        r.plant === row.plant && r.start_date < row.endDate && row.startDate < r.end_date;
      if (reports.some(overlap)) {
        skipped.push({ plant: row.plant, startDate: row.startDate, reason: 'saved-report' });
        continue;
      }
      const old = history.filter(overlap);
      if (old.length) {
        if (
          old.length !== 1 ||
          old[0].start_date !== row.startDate ||
          old[0].end_date !== row.endDate ||
          digest(Object.fromEntries(Object.entries(old[0].metric_values).sort())) !==
            digest(row.values)
        )
          reject('IMPORT_CONFLICT');
        skipped.push({ plant: row.plant, startDate: row.startDate, reason: 'identical-history' });
        continue;
      }
      insert.push(row);
    }
    const planHash = digest({
      owner: owner.id,
      manifestHash,
      insert,
      skipped,
      reports: reports.filter((r) =>
        manifest.records.some(
          (row) =>
            r.plant === row.plant && r.start_date < row.endDate && row.startDate < r.end_date,
        ),
      ),
    });
    const plan = {
      alreadyImported: false,
      manifestHash,
      planHash,
      prepared: manifest.records.length,
      toImport: insert.length,
      skipped: skipped.length,
      skippedPeriods: skipped,
      byFactory: Object.fromEntries(
        ['JRE', 'UNILAND'].map((p) => [p, insert.filter((r) => r.plant === p).length]),
      ),
    };
    if (!apply) return plan;
    if (expectedPlan !== planHash) reject('IMPORT_PLAN_CHANGED');
    const batch = randomUUID();
    await client.query(
      'INSERT INTO meter_app.consumption_imports(id,owner_id,source_name,source_sha256,manifest_sha256,imported_rows,skipped_rows) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        batch,
        owner.id,
        manifest.sourceName,
        manifest.sourceSha256,
        manifestHash,
        insert.length,
        skipped.length,
      ],
    );
    for (const row of insert)
      await client.query(
        'INSERT INTO meter_app.consumption_history(id,import_id,owner_id,plant,start_date,end_date,metric_values,source_sheet,source_row,source_range) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)',
        [
          randomUUID(),
          batch,
          owner.id,
          row.plant,
          row.startDate,
          row.endDate,
          JSON.stringify(row.values),
          row.sheet,
          row.row,
          row.range,
        ],
      );
    return { ...plan, imported: insert.length };
  });
}
