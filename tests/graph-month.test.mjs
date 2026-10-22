import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, adjacentMonth, monthlyPeriods } from '../graph-month.js';
import { smoothPath } from '../graph-curve.js';

test('monthly calendars validate boundaries, leap years and month navigation', () => {
  assert.deepEqual(monthRange('2024-02'), { start: '2024-02-01', end: '2024-02-29', days: 29 });
  assert.equal(monthRange('2026-02').days, 28);
  for (const value of ['2026-00', '2026-13', '2026-1', '1999-12', '2100-01', '<img>', ''])
    assert.equal(monthRange(value), null);
  assert.equal(adjacentMonth('2026-12', 1), '2027-01');
  assert.equal(adjacentMonth('2000-01', -1), '');
  assert.equal(adjacentMonth('2099-12', 1), '');
});
test('monthly periods preserve a full combined total and leave absent days empty', () => {
  const record = { startDate: '2026-09-18', endDate: '2026-09-21', days: 3, values: { w0: 321.5 } };
  const rows = [
    record,
    { startDate: '2026-09-01', endDate: '2026-09-02', days: 1, values: { w0: 0 } },
  ];
  const before = JSON.stringify(rows),
    result = monthlyPeriods('2026-09', rows);
  assert.equal(
    result.cells.reduce((n, c) => n + c.span, 0),
    30,
  );
  const slot = result.cells.find((c) => c.date === '2026-09-18');
  assert.equal(slot.span, 3);
  assert.equal(slot.record, record);
  assert.equal(slot.record.values.w0, 321.5);
  assert.equal(
    result.cells.find((c) => c.date === '2026-09-19'),
    undefined,
  );
  assert.equal(result.cells.find((c) => c.date === '2026-09-02').record, null);
  assert.equal(result.cells[0].record.values.w0, 0);
  assert.equal(JSON.stringify(rows), before);
  const cross = { startDate: '2026-09-30', endDate: '2026-10-03', days: 3, values: { w0: 90 } };
  assert.equal(monthlyPeriods('2026-09', [cross]).cells.at(-1).record.values.w0, 90);
  assert.equal(monthlyPeriods('2026-09', [cross]).cells.at(-1).span, 1);
  assert.equal(monthlyPeriods('2026-10', [cross]).count, 0);
});
test('ambiguous, replaced and invalid saved periods never become matrix consumption', () => {
  const rows = [
    { startDate: '2026-09-01', endDate: '2026-09-04' },
    { startDate: '2026-09-02', endDate: '2026-09-03' },
    { startDate: '2026-09-05', endDate: '2026-09-06', superseded: true },
    { startDate: '2026-09-07', endDate: '2026-09-08', overlap: true },
    { startDate: '2026-09-09', endDate: '2026-09-09' },
  ];
  const result = monthlyPeriods('2026-09', rows);
  assert.equal(result.count, 0);
  assert.equal(result.excluded.length, 5);
  assert.ok(result.cells.every((c) => c.record === null && c.span === 1));
});
test('smooth chart paths pass through saved points without overshooting adjacent values', () => {
  assert.equal(smoothPath([]), '');
  assert.equal(smoothPath([[0, 4]]), 'M0 4');
  assert.equal(
    smoothPath([
      [0, 4],
      [2, 8],
    ]),
    'M0 4L2 8',
  );
  const cases = [
    [0, 100, 0, 100, 100, 0],
    [1000, 0, 0, 1, 900, 1],
    [0, 1, 2, 3, 4, 5],
  ];
  for (let seed = 0; seed < 80; seed++)
    cases.push(Array.from({ length: 8 }, (_, i) => Math.sin(seed * 13 + i * seed + 2) * 500));
  for (const values of cases) {
    const points = values.map((value, i) => [i * i + 3 * i, value]),
      before = JSON.stringify(points);
    const path = smoothPath(points),
      sections = path.split('C').slice(1);
    assert.equal(sections.length, points.length - 1);
    assert.ok(!/NaN|Infinity/.test(path));
    sections.forEach((section, i) => {
      const [x1, y1, x2, y2, x3, y3] = section.split(' ').map(Number),
        [x0, y0] = points[i];
      assert.equal(x3, points[i + 1][0]);
      assert.equal(y3, points[i + 1][1]);
      for (let step = 0; step <= 50; step++) {
        const t = step / 50,
          u = 1 - t,
          y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        assert.ok(
          y >= Math.min(y0, y3) - 1e-9 && y <= Math.max(y0, y3) + 1e-9,
          'Curve must remain within adjacent values',
        );
      }
      assert.ok(x1 >= x0 && x2 >= x1 && x3 >= x2);
    });
    assert.equal(JSON.stringify(points), before);
  }
});
