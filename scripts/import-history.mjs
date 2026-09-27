import { readFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { createPool } from '../server/db.js';
import { importHistory } from '../server/history-import.js';
const { values } = parseArgs({
  options: {
    environment: { type: 'string' },
    owner: { type: 'string' },
    input: { type: 'string' },
    apply: { type: 'boolean' },
    'expected-plan': { type: 'string' },
  },
});
let db;
try {
  if (!['development', 'production'].includes(values.environment) || !values.owner || !values.input)
    throw new Error('IMPORT_ARGUMENTS_REQUIRED');
  const config = parseEnv(
    await readFile(
      values.environment === 'production' ? '.env.production.local' : '.env.local',
      'utf8',
    ),
  );
  if (!config.DATABASE_MIGRATION_URL) throw new Error('MAINTENANCE_CONNECTION_REQUIRED');
  db = createPool(config.DATABASE_MIGRATION_URL);
  const result = await importHistory(db, {
    username: values.owner,
    input: JSON.parse(await readFile(values.input, 'utf8')),
    apply: !!values.apply,
    expectedPlan: values['expected-plan'],
  });
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  const known = new Set([
    'IMPORT_ARGUMENTS_REQUIRED',
    'MAINTENANCE_CONNECTION_REQUIRED',
    'INVALID_IMPORT',
    'INVALID_IMPORT_ROW',
    'INVALID_IMPORT_VALUE',
    'EMPTY_IMPORT_ROW',
    'INVALID_GROUP_TOTAL',
    'OVERLAPPING_IMPORT_ROWS',
    'IMPORT_OWNER_NOT_ACTIVE',
    'IMPORT_CONFLICT',
    'IMPORT_PLAN_CHANGED',
  ]);
  console.error(
    known.has(e.message)
      ? e.message
      : 'History import failed. No data or connection details printed.',
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
