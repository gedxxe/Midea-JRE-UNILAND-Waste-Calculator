import { mkdir, writeFile } from 'node:fs/promises';
import { secretToken, tokenHash } from '../server/password.js';
import { createPool } from '../server/db.js';
import { iotIdentifier } from '../iot-contract.js';
const [action, owner, id, plant, meter, profile] = process.argv.slice(2);
if (
  !['create', 'rotate', 'revoke'].includes(action) ||
  !/^\w{8}-[\w-]{27}$/.test(owner || '') ||
  !iotIdentifier(id) ||
  !process.env.DATABASE_MIGRATION_URL
)
  throw Error('Use a maintenance connection and documented device arguments.');
const db = createPool(process.env.DATABASE_MIGRATION_URL);
try {
  if (action === 'revoke') {
    const r = await db.query(
      'UPDATE meter_app.iot_devices SET active=false WHERE owner_id=$1 AND device_id=$2 RETURNING device_id',
      [owner, id],
    );
    if (r.rowCount !== 1) throw Error('Device not found');
    console.log('Device credential revoked.');
  } else {
    if (!['JRE', 'UNILAND'].includes(plant) || !iotIdentifier(meter) || !iotIdentifier(profile))
      throw Error('Invalid device binding');
    const key = secretToken(),
      file = '.vercel/iot/' + id + '-' + Date.now() + '.local.txt';
    await mkdir('.vercel/iot', { recursive: true });
    await writeFile(file, key + '\n', { flag: 'wx', mode: 0o600 });
    const r =
      action === 'create'
        ? await db.query(
            'INSERT INTO meter_app.iot_devices(owner_id,device_id,plant,meter_id,meter_profile,token_hash) SELECT id,$2,$3,$4,$5,$6 FROM meter_app.users WHERE id=$1 AND active RETURNING device_id',
            [owner, id, plant, meter, profile, tokenHash(key)],
          )
        : await db.query(
            'UPDATE meter_app.iot_devices SET token_hash=$6,active=true WHERE owner_id=$1 AND device_id=$2 AND plant=$3 AND meter_id=$4 AND meter_profile=$5 RETURNING device_id',
            [owner, id, plant, meter, profile, tokenHash(key)],
          );
    if (r.rowCount !== 1) throw Error('Owner or binding not found');
    console.log('Credential written locally: ' + file + '. Never commit or log its contents.');
  }
} catch {
  console.error(
    'Provisioning failed. Check owner, binding, migration and local credential file; no key was printed.',
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
