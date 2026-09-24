import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';

import { createPool, transaction } from '../server/db.js';
import { hashPassword, username, secretToken } from '../server/password.js';
import { migrate } from './migrations.mjs';
try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const action = process.argv[2];
let db;
try {
  db = createPool(
    action === 'check'
      ? process.env.DATABASE_URL
      : process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL,
  );
  if (action === 'check') {
    await db.query('SELECT 1');
    console.log('Database connection succeeded.');
  } else if (action === 'migrate') {
    if (!process.argv.includes('--apply'))
      throw new Error('Add --apply to run additive migrations on the configured database.');
    console.log(JSON.stringify({ applied: await migrate(db) }));
  } else if (action === 'bootstrap' || action === 'reset-admin') {
    const name = username(process.argv[3]);
    const password = secretToken();
    const encoded = await hashPassword(password);
    const path = '.admin-setup.local.txt';
    // Exclusive creation prevents accidentally overwriting existing recovery information.
    const { open } = await import('node:fs/promises');
    const handle = await open(path, 'wx', 0o600);
    try {
      await transaction(db, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(728402)');
        if (action === 'bootstrap') {
          const count = (
            await client.query("SELECT count(*)::int AS n FROM meter_app.users WHERE role='admin'")
          ).rows[0].n;
          if (count)
            throw new Error('An admin already exists. Use reset-admin for explicit recovery.');
          await client.query(
            "INSERT INTO meter_app.users(id,username,password_hash,role) VALUES ($1,$2,$3,'admin')",
            [randomUUID(), name, encoded],
          );
        } else {
          if (!process.argv.includes('--apply'))
            throw new Error('Admin recovery requires --apply.');
          const row = (
            await client.query(
              "UPDATE meter_app.users SET password_hash=$2,must_change_password=true,auth_version=auth_version+1,active=true,updated_at=now() WHERE username=$1 AND role='admin' RETURNING id",
              [name, encoded],
            )
          ).rows[0];
          if (!row) throw new Error('Admin not found.');
          await client.query('DELETE FROM meter_app.sessions WHERE user_id=$1', [row.id]);
        }
        await handle.writeFile(
          'Username: ' +
            name +
            '\nTemporary password: ' +
            password +
            '\nChange this password at first login, then delete this local file.\n',
        );
      });
    } finally {
      await handle.close();
    }
    console.log(
      'Admin credentials saved to .admin-setup.local.txt. Password change required at first login.',
    );
  } else if (action === 'cleanup') {
    await db.query(
      "DELETE FROM meter_app.rate_limits WHERE window_start < now() - interval '1 day'",
    );
    await db.query('DELETE FROM meter_app.sessions WHERE expires_at < now()');
    console.log('Expired sessions and old rate limits removed.');
  } else
    throw new Error(
      'Use check, migrate --apply, bootstrap USERNAME, reset-admin USERNAME --apply, or cleanup.',
    );
} catch (error) {
  // Database/driver errors can contain connection details. Print only known application messages.
  const safe = [
    'An admin already exists.',
    'Add --apply',
    'Admin recovery',
    'Admin not found.',
    'Use check',
    'Applied migration changed:',
  ];
  console.error(
    safe.some((prefix) => error.message?.startsWith(prefix))
      ? error.message
      : 'Database operation failed. Check configuration, access, and whether the local credentials file already exists.',
  );
  process.exitCode = 1;
} finally {
  if (db) await db.end();
}
