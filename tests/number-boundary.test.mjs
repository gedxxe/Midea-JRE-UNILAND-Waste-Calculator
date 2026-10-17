import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalText, scaledReading } from '../numbers.js';

test('the cumulative maximum is checked exactly before floating-point rounding', () => {
  for (const value of ['1000000000000.000001', '1000000000000,000060', '+01000000000000.000001']) {
    assert.equal(decimalText(value), null, value);
    assert.equal(scaledReading(value), null, value);
  }
  assert.equal(scaledReading('1000000000000.000000'), 1000000000000000000n);
  assert.equal(scaledReading('999999999999.999999'), 999999999999999999n);
});
