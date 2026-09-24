import pg from 'pg';

let pool;
export function createPool(connectionString) {
  if (!connectionString) throw new Error('Database is not configured.');
  const url = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Never let URL parameters weaken certificate verification for a remote database.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const result = new pg.Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
    allowExitOnIdle: true,
    statement_timeout: 15000,
    application_name: 'midea-meter',
  });
  result.on('error', () => console.error(JSON.stringify({ event: 'database.connection_error' })));
  return result;
}

export function getPool() {
  return (pool ||= createPool(process.env.DATABASE_URL));
}

export async function transaction(database, run) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
