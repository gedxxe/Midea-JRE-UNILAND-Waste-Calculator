import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGas, convertGas, gasUsageText, gasMassText, gasCalibration } from '../gas.js';
import { calculateDraft } from '../engine.js';
import { exampleDraft } from '../examples.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { exportRawReading } from '../raw-export.js';

const point = (reading, temperature = '') => ({
  reading: String(reading),
  temperature: String(temperature),
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, a + ' vs ' + b);
const pairs = {
  LPG: [point(50), point(51)],
  O2: [point(1000), point(1050)],
  N2: [point(1000), point(1050)],
  R32: [point(550, 40), point(550, 30)],
};
for (const plant of ['JRE', 'UNILAND']) {
  test(
    plant + ' keeps measured increases for every gas and never plots them as consumption',
    () => {
      const draft = exampleDraft(plant);
      const raw = exportRawReading(draft, 'end');
      const originalWorksheet = calculateDraft(draft).worksheetText;
      const manual = structuredClone(draft.utilities);
      const calibration = gasCalibration(plant);
      draft.gas.entries = calibration.gases.map(({ id }) => ({
        enabled: true,
        start: pairs[id][0],
        end: pairs[id][1],
        refills: [],
      }));
      const original = structuredClone(draft);
      const result = calculateDraft(draft);
      assert.equal(result.success, true);
      assert.equal(result.issues.filter((i) => i.code === 'GAS_STOCK_INCREASE').length, 4);
      assert.ok(
        result.issues
          .filter((i) => i.code === 'GAS_STOCK_INCREASE')
          .every((i) => i.level === 'WARNING' && i.target.kind === 'gas'),
      );
      const snapshot = reportSnapshot(draft);
      const graph = graphValues(snapshot, plant);
      for (const [i, gas] of calibration.gases.entries()) {
        const kg =
          convertGas(gas.id, pairs[gas.id][0], plant).kg -
          convertGas(gas.id, pairs[gas.id][1], plant).kg;
        assert.ok(kg < 0);
        near(result.gasResults[i].kg, kg);
        near(snapshot.output.gas[i].kg, kg);
        assert.equal(snapshot.output.gas[i].warnings[0].code, 'gasStockIncrease');
        assert.ok(
          snapshot.output.reportText.includes(
            ': +' + gasMassText(-kg) + ' Kg (measured stock increase)',
          ),
        );
        assert.equal(graph[(plant === 'JRE' ? 'u' : 'kg') + gas.utilityIndex], null);
      }
      assert.equal(result.worksheetText, originalWorksheet);
      assert.deepEqual(exportRawReading(draft, 'end'), raw);
      assert.deepEqual(draft, original);
      assert.deepEqual(draft.utilities, manual);
      // Going back to ordinary consumption restores numeric graph output; history itself is untouched.
      draft.gas.entries.forEach((e) => ([e.start, e.end] = [e.end, e.start]));
      const normal = reportSnapshot(draft);
      const normalGraph = graphValues(normal, plant);
      for (const gas of calibration.gases)
        assert.ok(normalGraph[(plant === 'JRE' ? 'u' : 'kg') + gas.utilityIndex] > 0);
      assert.ok(!normal.output.reportText.includes('(measured stock increase)'));
    },
  );
  test(plant + ' counts refills once while preserving increases before and after refill', () => {
    const entry = {
      enabled: true,
      start: point(50),
      end: point(90),
      refills: [{ before: point(51), after: point(80) }],
    };
    const mass = (n) => convertGas('LPG', point(n), plant).kg;
    const result = calculateGas('LPG', entry, plant);
    near(result.refillKg, mass(80) - mass(51));
    near(result.kg, mass(50) + mass(80) - mass(51) - mass(90));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      result.warnings.map((w) => w.point),
      ['before0', 'end'],
    );
    entry.end = point(40);
    const consumed = calculateGas('LPG', entry, plant);
    assert.ok(consumed.kg > 0);
    assert.equal(consumed.warnings[0].point, 'before0');
    assert.ok(!gasUsageText(consumed.kg).startsWith('+'));
    entry.refills[0].before = point(40);
    assert.deepEqual(calculateGas('LPG', entry, plant).warnings, []);
  });
  test(
    plant + ' keeps missing, unavailable and reversed refill validation despite stock notices',
    () => {
      const draft = exampleDraft(plant);
      const e = (draft.gas.entries[0] = {
        enabled: true,
        start: point(50),
        end: point(51),
        refills: [],
      });
      e.refills = [{ before: point(55), after: point(54) }];
      assert.equal(calculateGas('LPG', e, plant).kg, null);
      assert.throws(() => reportSnapshot(draft), /INCOMPLETE_REPORT/);
      e.refills[0].after = point('');
      assert.throws(() => reportSnapshot(draft), /INCOMPLETE_REPORT/);
      e.refills = [];
      e.end = point(101);
      assert.throws(() => reportSnapshot(draft), /INCOMPLETE_REPORT/);
      e.end = point('-');
      const unavailable = reportSnapshot(draft);
      assert.equal(unavailable.output.gas[0].kg, null);
      assert.ok(!unavailable.output.reportText.includes('(measured stock increase)'));
      draft.gas.entries[3] = {
        enabled: true,
        start: point(550, 40),
        end: point(550, ''),
        refills: [],
      };
      assert.throws(() => reportSnapshot(draft), /INCOMPLETE_REPORT/);
    },
  );
}
test('gas display distinguishes stock gains from consumption and normalizes rounded zero', () => {
  assert.equal(gasUsageText(-150), '+150');
  assert.equal(gasUsageText(150), '150');
  for (const kg of [0, -0, -0.0000004, 0.0000004]) assert.equal(gasUsageText(kg), '0');
  for (const kg of [null, undefined, NaN, Infinity]) assert.equal(gasUsageText(kg), '-');
});

for (const plant of ['JRE', 'UNILAND'])
  test(
    plant + ' graphs preserve ordinary consumption when a stock notice repeats the utility label',
    () => {
      const draft = exampleDraft(plant);
      draft.gas.entries[0] = {
        enabled: true,
        start: point(50),
        end: point(40),
        refills: [{ before: point(51), after: point(80) }],
      };
      const snapshot = reportSnapshot(draft);
      assert.ok(snapshot.output.gas[0].kg > 0);
      assert.equal(snapshot.output.gas[0].warnings[0].point, 'before0');
      assert.ok(snapshot.output.reportText.includes('CHECK RAW DATA:'));
      const key = plant === 'JRE' ? 'u0' : 'kg0';
      assert.equal(
        graphValues(snapshot, plant)[key],
        Number(gasMassText(snapshot.output.gas[0].kg)),
      );
      // Actual duplicate measurement lines stay ambiguous, even if their numbers agree.
      const lines = snapshot.output.reportText.split('\n');
      const measured = lines.find((l) => l.includes('LPG: ') && l.includes(' Kg'));
      const duplicate = structuredClone(snapshot);
      duplicate.output.reportText = [measured, ...lines].join('\n');
      assert.equal(graphValues(duplicate, plant)[key], null);
    },
  );
