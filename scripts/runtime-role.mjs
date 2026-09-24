import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { createPool, transaction } from '../server/db.js';
import pg from 'pg';

if (!process.argv.includes('--apply'))
  throw new Error('Use --apply to create a restricted runtime role and update .env.local.');
const path = '.env.local';
const text = await readFile(path, 'utf8');
const config = parseEnv(text);
const privileged = config.DATABASE_MIGRATION_URL || config.DATABASE_URL;
let db;
const role = 'meter_app_runtime';
try {
  db = createPool(privileged);
  const password = randomBytes(32).toString('base64url');
  const runtime = new URL(privileged);
  runtime.username = role;
  runtime.password = password;
  if (config.DATABASE_MIGRATION_URL)
    throw new Error('Runtime credentials may already be configured.');
  await transaction(db, async (client) => {
    if ((await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount)
      throw new Error('Runtime role already exists; no credentials changed.');
    await client.query(
      'CREATE ROLE ' +
        pg.escapeIdentifier(role) +
        ' LOGIN PASSWORD ' +
        pg.escapeLiteral(password) +
        ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
    );
    await client.query('GRANT USAGE ON SCHEMA meter_app TO ' + pg.escapeIdentifier(role));
    await client.query(
      'GRANT SELECT,INSERT,UPDATE ON meter_app.users,meter_app.reports TO ' +
        pg.escapeIdentifier(role),
    );
    await client.query(
      'GRANT SELECT,INSERT,UPDATE,DELETE ON meter_app.sessions,meter_app.rate_limits TO ' +
        pg.escapeIdentifier(role),
    );
    await client.query(
      'GRANT SELECT,INSERT ON meter_app.report_revisions,meter_app.audit_events TO ' +
        pg.escapeIdentifier(role),
    );
  });
  const next =
    text.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=' + JSON.stringify(runtime.toString())) +
    '\nDATABASE_MIGRATION_URL=' +
    JSON.stringify(privileged) +
    '\n';
  await writeFile(path, next, { mode: 0o600 });
  const check = createPool(runtime.toString());
  try {
    const { rows } = await check.query(
      "SELECT has_table_privilege(current_user,'meter_app.reports','INSERT') AS can_save, has_table_privilege(current_user,'meter_app.report_revisions','UPDATE') AS can_rewrite, has_schema_privilege(current_user,'meter_app','CREATE') AS can_ddl",
    );
    if (!rows[0].can_save || rows[0].can_rewrite || rows[0].can_ddl)
      throw new Error('Runtime grants need review.');
    console.log('Restricted runtime role verified; .env.local updated. No credentials printed.');
  } finally {
    await check.end();
  }
} catch {
  console.error(
    'Runtime role setup failed. Existing roles are never overwritten. Check database access and .env.local before retrying.',
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
