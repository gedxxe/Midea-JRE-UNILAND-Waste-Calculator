import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { migrate } from '../scripts/migrations.mjs';
import { createTimeService } from '../server/ntp.js';
import { timeLog } from '../server/log.js';
import { createDraft } from '../engine.js';
import { restoreDrafts } from '../storage.js';
import { setLanguage, t } from '../i18n/index.js';

test('unknown language falls back to English; placeholders remain plain text', () => {
  assert.equal(setLanguage('unsupported'), 'en');
  assert.equal(
    t('cleared', { plant: '<script>test</script>' }),
    '<script>test</script> readings cleared. You can undo this change.',
  );
  setLanguage('zh-CN');
  assert.equal(t('save'), '保存草稿');
  setLanguage('id');
  assert.equal(t('save'), 'Simpan draft');
  setLanguage('en');
});

test('corrupt persisted warning coordinates cannot break table navigation', () => {
  const drafts = { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') };
  drafts.JRE.importIssues = [
    null,
    { code: 'RATIO_MISMATCH', message: 'bad', rowIndex: 999, meterIndex: 0 },
    { code: 'RATIO_MISMATCH', message: 'bad', rowIndex: 0, meterIndex: 99 },
    { code: 'RATIO_MISMATCH', message: 'valid', rowIndex: 0, meterIndex: 0 },
  ];
  const restored = restoreDrafts(JSON.stringify({ version: 4, drafts }));
  assert.equal(restored.JRE.importIssues.length, 1);
  assert.equal(restored.JRE.importIssues[0].message, 'valid');
  drafts.JRE.importIssues = { bad: true };
  assert.deepEqual(restoreDrafts(JSON.stringify({ version: 4, drafts })).JRE.importIssues, []);
});

test('NTP emits one refresh event for concurrent/cache requests and records fallback', async () => {
  const events = [];
  let now = 1000;
  const getTime = createTimeService({
    monotonic: () => now,
    onEvent: (event) => events.push(event),
    query: async (host) => {
      if (host === 'time.cloudflare.com') throw new Error('failure');
      return { unixMs: 100000, at: now, source: host, uncertaintyMs: 1, stratum: 2 };
    },
  });
  await Promise.all([getTime(), getTime()]);
  await getTime();
  assert.deepEqual(events, [
    { status: 'ok', source: 'time.google.com', attempts: 2, durationMs: 0 },
  ]);
  now += 61000;
  await getTime();
  assert.equal(events.length, 2);
});

test('NTP logs failure once during cooldown and survives logger errors', async () => {
  const events = [];
  const getTime = createTimeService({
    monotonic: () => 1000,
    onEvent: (event) => events.push(event),
    query: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(getTime());
  await assert.rejects(getTime());
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'unavailable');
  const healthy = createTimeService({
    monotonic: () => 1,
    onEvent: () => {
      throw new Error('log failed');
    },
    query: async (source) => ({ unixMs: 100000, at: 1, source, uncertaintyMs: 1, stratum: 2 }),
  });
  assert.equal((await healthy()).protocol, 'NTP');
});

test('structured logs allow only service metadata, never readings or raw errors', () => {
  let line = '';
  timeLog(
    {
      status: 'ok',
      source: 'time.cloudflare.com',
      attempts: 1,
      durationMs: 42.3,
      readings: 'PRIVATE_DATA',
      error: 'SECRET',
    },
    (value) => {
      line = value;
    },
  );
  const log = JSON.parse(line);
  assert.equal(log.event, 'ntp.sync');
  assert.equal(log.durationMs, 42);
  assert.ok(log.version.endsWith('-alpha'));
  assert.doesNotMatch(line, /PRIVATE_DATA|SECRET|readings|error/);
});

test('the migration runner includes every SQL migration, executes it once and checks saved checksums', async () => {
  const directory = new URL('../migrations/', import.meta.url);
  const expected = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  assert.ok(expected.length > 0);
  const applied = new Map(),
    statements = [],
    lifecycle = [];
  const client = {
    async query(sql, params) {
      if (sql.startsWith('SELECT checksum'))
        return { rows: applied.has(params[0]) ? [{ checksum: applied.get(params[0]) }] : [] };
      if (sql.startsWith('INSERT INTO meter_app.migrations')) applied.set(...params);
      else statements.push(sql);
      return { rows: [] };
    },
    release() {
      lifecycle.push('release');
    },
  };
  const database = { connect: async () => client };
  assert.deepEqual(await migrate(database), expected);
  for (const file of expected) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    assert.equal(statements.filter((s) => s === sql).length, 1, file);
    assert.match(applied.get(file), /^[a-f0-9]{64}$/);
  }
  const count = statements.length;
  assert.deepEqual(await migrate(database), []);
  assert.equal(
    statements.slice(count).some((s) => /CREATE FUNCTION|CREATE TRIGGER/.test(s)),
    false,
  );
  assert.equal(lifecycle.length, 2);
  const changed = expected.at(-1);
  applied.set(changed, 'different-checksum');
  await assert.rejects(
    migrate(database),
    (error) => error.message === 'Applied migration changed: ' + changed,
  );
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(lifecycle.length, 3);
});
