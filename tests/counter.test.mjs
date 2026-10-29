import test from 'node:test';
import assert from 'node:assert/strict';
import { counterSlots, counterTrend, stepBetween, nextClockSecond } from '../counter-model.js';

test('dashboard counter preserves signed exact decimal text and units beyond Number precision', () => {
  for (const text of [
    '+999999999999999999.99999999 kWh',
    '-1870.34 kWh',
    '24081.00',
    '0.00',
    '0.00000001 MWh',
  ]) {
    assert.equal(
      counterSlots(text)
        .map((s) => s.text)
        .join(''),
      text,
    );
  }
  assert.equal(counterTrend('999999999999999999.99999998', '999999999999999999.99999999'), 'up');
  assert.equal(counterTrend('1.00000001', '1.00000000'), 'down');
  assert.equal(counterTrend('0001.00', '1.0000'), 'shortest');
});

test('counter keeps unknown, malformed and oversized labels static instead of inventing zero', () => {
  for (const text of ['-', '--:--:--', '', 'NaN', '1e9', '1,234', '1.2.3', '9'.repeat(101)])
    assert.equal(counterSlots(text), null);
});

test('clock rolls one true second through minute and midnight carry; jumps snap', () => {
  assert.ok(nextClockSecond('08:07:59', '08:08:00'));
  assert.ok(nextClockSecond('23:59:59', '00:00:00'));
  for (const pair of [
    ['08:00:00', '09:00:00'],
    ['08:00:00', '07:59:59'],
    ['24:00:00', '00:00:01'],
  ])
    assert.equal(nextClockSecond(...pair), false);
  assert.equal(
    counterSlots('08:07:33', true)
      .map((s) => s.text)
      .join(''),
    '08:07:33',
  );
});

test('digit carry travels through 9 to 0 without a long reverse spin', () => {
  assert.equal(stepBetween(9, 0, 'up'), 1);
  assert.equal(stepBetween(0, 9, 'down'), -1);
  assert.equal(stepBetween(9, 0, 'shortest'), 1);
});
