import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft } from '../engine.js';
import { changeDraftPeriod, restoreDrafts } from '../storage.js';
import { formatReadingColumn, exportRawReading } from '../raw-export.js';
import { parseReading } from '../importer.js';

function filled(plant) {
  const d = createDraft(plant, '2026-10-03', '2026-10-04');
  d.rows.forEach((r) => {
    r.start.fill('100,000001');
    r.end.fill('125.000002');
    r.inactive = true;
  });
  d.utilities[0] = { value: '99', note: 'previous period' };
  return d;
}

test('period changes carry only matching dates for both factories, without mutating the source', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const d = filled(plant),
      before = structuredClone(d);
    const next = changeDraftPeriod(d, '2026-10-04', '2026-10-05');
    next.rows.forEach((r, i) => {
      assert.deepEqual(r.start, d.rows[i].end);
      assert.ok(r.end.every((v) => v === ''));
      assert.equal(r.inactive, false);
    });
    assert.ok(next.utilities.every((u) => u.value === '' && u.note === ''));
    assert.deepEqual(d, before);
    const gap = changeDraftPeriod(d, '2026-10-05', '2026-10-06');
    assert.ok(gap.rows.every((r) => [...r.start, ...r.end].every((v) => v === '')));
    const drafts = { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND'), [plant]: next };
    assert.deepEqual(restoreDrafts(JSON.stringify({ version: 4, drafts }))[plant].rows, next.rows);
  }
});

test('either date-edit order retains the matching endpoint, and restoring the original period restores utilities', () => {
  const d = filled('JRE');
  for (const [start, end] of [
    ['2026-10-04', '2026-10-04'],
    ['2026-10-03', '2026-10-05'],
  ]) {
    const intermediate = changeDraftPeriod(d, start, end);
    const next = changeDraftPeriod(intermediate, '2026-10-04', '2026-10-05', d);
    assert.deepEqual(
      next.rows.map((r) => r.start),
      d.rows.map((r) => r.end),
    );
    assert.ok(next.rows.every((r) => r.end.every((v) => v === '')));
    assert.deepEqual(changeDraftPeriod(next, d.startDate, d.endDate, d), d);
  }
  assert.deepEqual(changeDraftPeriod(d, d.startDate, d.endDate), d);
  const undated = createDraft('JRE');
  undated.rows[0].start[0] = '1';
  assert.equal(changeDraftPeriod(undated, '2026-10-04', '2026-10-05').rows[0].start[0], '1');
});

test('gas observations and temperatures follow endpoints but refills never move to another period', () => {
  const d = filled('JRE');
  d.gas.entries[3] = {
    enabled: true,
    start: { reading: '600', temperature: '33,5' },
    end: { reading: '500', temperature: '34' },
    refills: [
      {
        before: { reading: '550', temperature: '33' },
        after: { reading: '590', temperature: '34' },
      },
    ],
  };
  const next = changeDraftPeriod(d, '2026-10-04', '2026-10-05');
  assert.deepEqual(next.gas.entries[3], {
    enabled: true,
    start: { reading: '500', temperature: '34' },
    end: { reading: '', temperature: '' },
    refills: [],
  });
  const longer = changeDraftPeriod(d, d.startDate, '2026-10-06');
  assert.deepEqual(longer.gas.entries[3].start, d.gas.entries[3].start);
  assert.deepEqual(longer.gas.entries[3].refills, []);
});

test('import editor can display partial columns without making missing values exportable or importable', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const d = filled(plant);
    assert.equal(formatReadingColumn(d, 'start').text, exportRawReading(d, 'start').text);
    d.rows[0].end[0] = '';
    const result = formatReadingColumn(d, 'end');
    assert.ok(result.text.includes('04/10/2026\n\n1. Total: '));
    assert.ok(result.issues.some((i) => i.code === 'EMPTY'));
    assert.equal(exportRawReading(d, 'end').text, '');
    assert.equal(parseReading(result.text, plant).success, false);
  }
});
