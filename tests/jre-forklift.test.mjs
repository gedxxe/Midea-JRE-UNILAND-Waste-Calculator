import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDraft, createDraft } from '../engine.js';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { layout4JreDraft, legacyText } from './fixtures/legacy-layout.mjs';
import { migrateMeterLayout } from '../meter-layout.js';
import { restoreWorkspace, changeDraftPeriod } from '../storage.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { parseReading } from '../importer.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';

test('JRE Building 2 deducts direct Forklift Building 2 once in every period without changing the main or worksheet', () => {
  for (const draft of reportPeriods()) {
    const before = calculateDraft(draft);
    draft.rows[30].end[0] = String(Number(draft.rows[30].end[0]) + 2.125);
    const raw = structuredClone(draft),
      result = calculateDraft(draft);
    assert.equal(result.success, true);
    assert.equal(
      result.calculatedRows[30].totalEnergy,
      before.calculatedRows[30].totalEnergy + 2.125,
    );
    assert.equal(
      result.calculatedRows[18].totalEnergy,
      before.calculatedRows[18].totalEnergy - 2.125,
    );
    assert.equal(result.totalDirectEnergy, before.totalDirectEnergy);
    assert.equal(result.subAreasSumKWh, before.subAreasSumKWh);
    assert.equal(result.gapKWh, before.gapKWh);
    assert.deepEqual(result.worksheet, before.worksheet);
    assert.deepEqual(draft, raw);
    const saved = reportSnapshot(draft),
      values = graphValues(saved, 'JRE');
    assert.equal(values.r18, Number(result.calculatedRows[18].totalEnergy.toFixed(2)));
    assert.equal(values.r30, Number(result.calculatedRows[30].totalEnergy.toFixed(2)));
    assert.match(saved.output.reportText, /31\. Charging Forklift Building 2: /);
    assert.deepEqual(saved.draft.rows[30], raw.rows[30]);
  }
});

test('layout 4 upgrades add only a blank Forklift pair, retaining incomplete utilities, times and backup content', () => {
  const j = reportPeriods(),
    u = reportPeriods('UNILAND');
  const workspace = {
    version: 4,
    drafts: { JRE: j[0], UNILAND: u[0] },
    workingHours: { JRE: j[1], UNILAND: u[1] },
    nightShifts: { JRE: j[2], UNILAND: u[2] },
  };
  for (const collection of ['drafts', 'workingHours', 'nightShifts']) {
    const old = layout4JreDraft(workspace[collection].JRE);
    old.water = { start: '123,', end: '' };
    const side = collection === 'nightShifts' ? 'end' : 'start';
    old.rows[1][side][0] += '.';
    workspace[collection].JRE = old;
    const original = structuredClone(old),
      next = migrateMeterLayout(old);
    assert.equal(next.meterLayout, 6);
    assert.deepEqual(next.rows.slice(0, 30), old.rows);
    assert.deepEqual(next.rows[30], { start: [''], end: [''], inactive: false });
    assert.deepEqual(next.water, old.water);
    assert.equal(next.startTime, old.startTime);
    assert.equal(next.endTime, old.endTime);
    assert.deepEqual(old, original);
    assert.deepEqual(migrateMeterLayout(next), next);
    assert.equal(calculateDraft(next).success, false);
    assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
  }
  const restored = restoreWorkspace(JSON.stringify(workspace));
  const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
  const backup = createDraftBackup(restored, owner);
  assert.deepEqual(restoreDraftBackup(backup, owner), { ...restored, pendingPeriods: [] });
  const malformed = layout4JreDraft(j[0]);
  malformed.rows.pop();
  assert.throws(() => migrateMeterLayout(malformed), /Invalid legacy/);
});

test('old complete JRE raw text may omit Forklift but never any other layout-4 row', () => {
  const draft = reportPeriods()[0],
    old = layout4JreDraft(draft);
  for (const side of ['start', 'end']) {
    const text = legacyText(old, side),
      parsed = parseReading(text, 'JRE');
    assert.equal(parsed.success, true);
    assert.deepEqual(
      parsed.values.slice(0, 30),
      old.rows.map((row) => row[side]),
    );
    assert.deepEqual(parsed.values[30], ['']);
    assert.deepEqual(parsed.suppliedMeters[30], [false]);
    assert.deepEqual(parsed.omittedRows, [30, 31]);
    assert.equal(
      parseReading(text.replace(/^30\. Area Repair Injection Molding:.*$/m, ''), 'JRE').success,
      false,
    );
    const raw = exportRawReading(draft, side);
    assert.match(raw.text, /31\. Charging Forklift Building 2: 10\d\d\n/);
    assert.deepEqual(
      parseReading(raw.text, 'JRE').values,
      draft.rows.map((row) => row[side]),
    );
  }
  assert.match(formatBlankReadingTemplate('JRE'), /31\. Charging Forklift Building 2: ____\n/);
  const next = changeDraftPeriod(draft, draft.endDate, '2026-09-18');
  assert.deepEqual(next.rows[30].start, draft.rows[30].end);
  assert.deepEqual(next.rows[30].end, ['']);
  assert.equal(createDraft('UNILAND').rows.length, 34);
});

test('pre-Forklift saved reports keep their Building 2 result and have no invented Forklift history', () => {
  const saved = reportSnapshot(reportPeriods()[0]);
  saved.engineVersion = '0.11.12-alpha';
  saved.draft = layout4JreDraft(saved.draft);
  saved.output.reportText = saved.output.reportText
    .replace('19. Electricity Building 2#: 950.00 kWh', '19. Electricity Building 2#: 960.00 kWh')
    .replace(/^31\. Charging Forklift Building 2:.*\n/m, '');
  const original = structuredClone(saved),
    values = graphValues(saved, 'JRE');
  assert.equal(values.r18, 960);
  assert.equal(values.r30, null);
  assert.deepEqual(saved, original);
});
