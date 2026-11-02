import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { migrate } from '../scripts/migrations.mjs';

test('the migration runner includes every SQL migration, executes it once and checks saved checksums', async () => {
  const directory = new URL('../migrations/', import.meta.url);
  const expected = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  assert.ok(expected.includes('008_r32_kg.sql'));
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
  applied.set('008_r32_kg.sql', 'different-checksum');
  await assert.rejects(migrate(database), /Applied migration changed: 008_r32_kg.sql/);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(lifecycle.length, 3);
});
