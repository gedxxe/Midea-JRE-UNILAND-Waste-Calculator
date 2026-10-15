import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftBackup, restoreDraftBackup, MAX_BACKUP_BYTES } from '../draft-backup.js';
import { createDraft, calculateDraft } from '../engine.js';
import { exampleDraft } from '../examples.js';

const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
const workspace = () => ({
  version: 4,
  drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
});

test('backup preserves incomplete electricity, gas, refills, water, extra pairs and original decimal strings', () => {
  const input = workspace();
  for (const plant of ['JRE', 'UNILAND']) {
    const d = input.drafts[plant];
    d.startDate = '2026-10-12';
    d.endDate = '2026-10-13';
    d.rows[0].start[0] = '123,000';
    d.water = { start: '100.', end: '' };
    d.gas.entries[3] = {
      enabled: true,
      start: { reading: '1000', temperature: '33,5' },
      end: { reading: '', temperature: '' },
      refills: [
        {
          before: { reading: '800', temperature: '30' },
          after: { reading: '1200', temperature: '40' },
        },
      ],
    };
    d.utilities[0].note = '<img src=x onerror=alert(1)>';
  }
  input.drafts.JRE.additionalReadings = [
    { start: '100,25', end: '' },
    ...Array.from({ length: 3 }, () => ({ start: '', end: '' })),
  ];
  const before = JSON.stringify(input);
  const restored = restoreDraftBackup(createDraftBackup(input, owner), owner);
  for (const plant of ['JRE', 'UNILAND']) {
    for (const key of [
      'rows',
      'utilities',
      'gas',
      'water',
      'additionalReadings',
      'startDate',
      'endDate',
    ])
      assert.deepEqual(restored.drafts[plant][key], input.drafts[plant][key]);
  }
  assert.deepEqual(restored.reportLinks, {});
  assert.equal(JSON.stringify(input), before);
});

test('backup strips report links, sessions, untrusted fields and calculated totals', () => {
  const input = workspace();
  input.reportLinks = { JRE: { id: owner, revision: 1 } };
  input.cookie = 'synthetic-cookie';
  input.drafts.JRE.password = 'synthetic-password';
  input.drafts.JRE.gas.entries[0].kg = 999;
  const raw = createDraftBackup(input, owner);
  for (const text of ['reportLinks', 'synthetic-cookie', 'synthetic-password', '"kg"'])
    assert.equal(raw.includes(text), false);
  const parsed = JSON.parse(raw);
  parsed.workspace.drafts.JRE.rows[0].start[0] = 'x'.repeat(51);
  assert.throws(() => restoreDraftBackup(JSON.stringify(parsed), owner), /backupInvalid/);
});

test('backup rejects other accounts, corrupt files, unsupported versions and oversized content', () => {
  const raw = createDraftBackup(workspace(), owner);
  assert.throws(
    () => restoreDraftBackup(raw, '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e'),
    /backupAccount/,
  );
  for (const value of [
    '{',
    'null',
    raw.replace('"version": 3', '"version": 99'),
    ' '.repeat(MAX_BACKUP_BYTES + 1),
  ])
    assert.throws(() => restoreDraftBackup(value, owner), /backupInvalid/);
  const parsed = JSON.parse(raw);
  parsed.workspace.drafts.UNILAND.gas.version = 'unknown';
  assert.throws(() => restoreDraftBackup(JSON.stringify(parsed), owner), /backupInvalid/);
});

test('complete backup round trip preserves the copied report and worksheet bytes', () => {
  const input = {
    version: 4,
    drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
  };
  const restored = restoreDraftBackup(createDraftBackup(input, owner), owner);
  for (const plant of ['JRE', 'UNILAND']) {
    assert.equal(
      calculateDraft(restored.drafts[plant]).reportSectionText,
      calculateDraft(input.drafts[plant]).reportSectionText,
    );
    assert.equal(
      calculateDraft(restored.drafts[plant]).worksheetText,
      calculateDraft(input.drafts[plant]).worksheetText,
    );
  }
});
