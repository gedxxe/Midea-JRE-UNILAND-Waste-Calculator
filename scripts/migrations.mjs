import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transaction } from '../server/db.js';

export async function migrate(database) {
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((file) => /^\d+_[a-z_]+\.sql$/.test(file))
    .sort();
  return transaction(database, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(728401)');
    await client.query('CREATE SCHEMA IF NOT EXISTS meter_app');
    await client.query(
      'CREATE TABLE IF NOT EXISTS meter_app.migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = [];
    for (const file of files) {
      const sql = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
      const previous = (
        await client.query('SELECT checksum FROM meter_app.migrations WHERE name=$1', [file])
      ).rows[0];
      if (previous) {
        if (previous.checksum !== checksum) throw new Error('Applied migration changed: ' + file);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO meter_app.migrations(name,checksum) VALUES ($1,$2)', [
        file,
        checksum,
      ]);
      applied.push(file);
    }
    return applied;
  });
}
