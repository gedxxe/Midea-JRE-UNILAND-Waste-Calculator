import test from 'node:test';
import assert from 'node:assert/strict';
import { sameWorkspace } from '../storage.js';

test('draft comparison ignores JSON object key order without hiding changed observations', () => {
  const left = {
    version: 4,
    drafts: { JRE: { rows: [{ start: ['1,20', '2'], end: ['3', '4'] }] } },
  };
  const right = {
    drafts: { JRE: { rows: [{ end: ['3', '4'], start: ['1,20', '2'] }] } },
    version: 4,
  };
  const before = JSON.stringify(left);
  assert.equal(sameWorkspace(left, right), true);
  const altered = structuredClone(right);
  altered.drafts.JRE.rows[0].start.reverse();
  assert.equal(sameWorkspace(left, altered), false);
  altered.drafts.JRE.rows[0].start = ['1.20', '2'];
  assert.equal(sameWorkspace(left, altered), false);
  assert.equal(sameWorkspace(left, { ...right, futureCollection: {} }), false);
  assert.equal(sameWorkspace(left, { drafts: right.drafts }), false);
  assert.equal(sameWorkspace(left, null), false);
  assert.equal(JSON.stringify(left), before);
});
