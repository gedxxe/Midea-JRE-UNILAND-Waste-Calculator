import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDraft } from '../engine.js';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { comparisonMessage, groupIncludedMeters } from '../meter-checks.js';
test('Building2 warning identifies the exact parent, grouped children and converted excess', () => {
  const d = reportPeriods('JRE', '2026-10-27')[0];
  d.rows[18].end[0] = '1001';
  const r = calculateDraft(d),
    note = r.issues.find((i) => i.code === 'NET_USAGE_NEGATIVE' && i.rowIndex === 18);
  assert.ok(note);
  assert.equal(note.comparison.parent.energy, 1);
  assert.equal(note.comparison.parent.rowIndex, 18);
  assert.equal(note.comparison.children.length, 10);
  const groups = groupIncludedMeters(note.comparison.children);
  assert.deepEqual(groups[0].meters, [1, 2, 3, 4]);
  assert.equal(groups.filter((g) => g.name === 'Heat Exchanger').length, 1);
  assert.equal(note.comparison.excess, note.comparison.total - 1);
  assert.ok(!note.message.includes('Heat Exchanger and Heat Exchanger'));
  assert.match(note.message, /Heat Exchanger, meters 1, 2, 3, 4/);
  assert.match(note.message, /1 kWh/);
});
test('component-net and missing-meter notes point to exact source components', () => {
  const d = reportPeriods('JRE', '2026-10-27')[0];
  d.rows[15].end[2] = '1001';
  let r = calculateDraft(d),
    note = r.issues.find((i) => i.code === 'NET_USAGE_NEGATIVE' && i.rowIndex === 15);
  assert.equal(note.comparison.parent.meterIndex, 2);
  assert.equal(note.comparison.parent.energy, 1);
  assert.deepEqual(
    note.comparison.children.map((c) => [c.rowIndex, c.meterIndex]),
    [[3, 5]],
  );
  d.rows[3].end[5] = '';
  r = calculateDraft(d);
  note = r.issues.find((i) => i.code === 'DEPENDENCY_UNAVAILABLE' && i.rowIndex === 15);
  assert.equal(note.comparison.children[0].energy, null);
  assert.match(note.message, /Window, meter 6/);
});
test('comparison descriptions use the supplied plant units without inventing relationships', () => {
  const c = {
    parent: { name: 'Building A', rowIndex: 4, meterIndex: null, energy: 0.1, unit: 'MWh' },
    children: [{ name: 'Included meter', rowIndex: 5, meterIndex: 1, energy: 0.10000001 }],
    total: 0.10000001,
    excess: 0.00000001,
  };
  assert.match(comparisonMessage(c), /0.00000001 MWh/);
  assert.match(comparisonMessage(c), /meter 2/);
});
