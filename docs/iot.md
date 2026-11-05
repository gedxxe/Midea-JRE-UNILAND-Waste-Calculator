# Power Meter Reading

This is an opt-in website foundation, not a completed hardware commissioning or an industrial certification. The existing reports, ratios, autosave and history are untouched. Device observations cannot automatically populate them. Phase 1 registers one meter/profile per device source ID. Fleet mapping, additional electrical metrics, retention policies and report Review & Apply are later work.

## Transport and security

ESP32 reads Modbus locally, persists accepted records, then POSTs JSON to `/api/iot-ingest` using TLS certificate verification. The website GETs `/api/iot-readings` through its existing authenticated session. It does not GET a private ESP32 address, expose the device key in a browser or connect firmware to Neon. Do not put credentials in URLs. CORS/origin protection on existing browser mutations is unchanged.

Each source has a random 256-bit bearer credential; only its SHA-256 hash is stored in the database. Never log payload headers or keys. Revocation/rotation is checked on each upload. Source/meter/profile binding and an active owner are required. Uploads are limited to 16 KiB and 120 authenticated attempts per minute per source, serialized under a database row lock. This is not a substitute for platform/WAF abuse protection. Telemetry should normally upload no more often than every 30 seconds.

Events are append-only through the API. `(device_id,event_id)` is the deduplication identity: an identical canonical retry returns 200, a new committed event returns 201, different content with the same identity returns 409. Retry IDs and exact decimal strings must survive reboot. Backfill is allowed; latest observations are ordered by capture time, not arrival time. No deletion/retention job is installed. Size the database and agree a retention policy before fleet rollout.

HTTPS protects transport and the existing PostgreSQL client verifies remote TLS certificates. Database/platform encryption at rest and access policy require deployment verification; this code does not add a second custom encryption scheme or certify the installation.

## Development activation

1. Keep `IOT_ENABLED=0` in production. Make a development database recovery point and inspect `migrations/009_iot_readings.sql`. Run the existing explicit migration tool against **development only**. Builds do not migrate. No production migration is authorized by this implementation.
2. Use a separate restricted runtime role. In addition to its existing grants it needs `SELECT` on `meter_app.iot_devices`, `UPDATE(hits,window_start,last_received_at)` on that table, and `SELECT,INSERT` on `meter_app.iot_readings`. Device creation/rotation/revocation uses the privileged local maintenance connection only.
3. Create a separate [development account](accounts.md) first; do not reuse production account credentials or copy production data. Register a synthetic source for that development account UUID. The CLI reads `DATABASE_MIGRATION_URL`, never browser credentials:

   ```sh
   node --env-file=.env.local scripts/iot-device.mjs create OWNER_UUID dev_source JRE meter_1 fort
   ```

   Substitute the owner's UUID and the exact stable meter/profile identifiers chosen for firmware. The generated key goes to an ignored `.vercel/iot/*.local.txt` file, not stdout. Keep it private, provision it locally into the device and never commit it. A failed provisioning attempt can leave an unused private key file; it is not proof a device was registered.

4. Set server-only `IOT_ENABLED=1` in the development deployment and configure its normal `DATABASE_URL`, `AUTH_SECRET`, `APP_ORIGIN`. Production stays off until reviewed migration, recovery, runtime grants and end-to-end tests are complete.
5. Open `/iot-power-meter-reading` after login. Manual refresh is default; optional refresh runs every 30 seconds only while visible/open. The page shows at most 100 observations and the last accepted receipt. It does not claim an online connection merely from a recent receipt. Closing the page or changing account aborts pending reads and clears private display data.

Rotate with `rotate OWNER_UUID dev_source JRE meter_1 fort`, using the same CLI; it writes a new local key and invalidates the old one. Revoke with `revoke OWNER_UUID dev_source`. Do not move an existing source identity between meters or owners; register a new identity so historical provenance stays meaningful.

## Firmware contract v1

Headers: `Content-Type: application/json`, `X-Device-ID: <registered source ID>`, `Authorization: Bearer <private source key>`.

```json
{
  "schema_version": 1,
  "event_id": "boot_4_checkpoint_20261105_0800",
  "device_id": "dev_source",
  "meter_id": "meter_1",
  "meter_profile": "fort",
  "event_type": "checkpoint",
  "scheduled_at": "2026-11-05T01:00:00Z",
  "started_at": "2026-11-05T01:00:01Z",
  "captured_at": "2026-11-05T01:00:02Z",
  "readings": { "active_energy_kwh": "123.000001" },
  "quality": "valid"
}
```

All times are strict UTC ISO seconds ending in Z. Values above are synthetic. Energy is cumulative **primary kWh**, already normalized by firmware with CT/PT applied once, sent as a nonnegative decimal **string** with up to six decimal places. No extra multiplication occurs on the website. IDs use 1–64 ASCII letters/digits/underscore/hyphen, beginning with a letter/digit. Unknown fields/metrics, invalid dates, future timestamps more than five minutes ahead, invalid/missed quality, and mismatched registered identity are rejected.

Checkpoint schedule verified from the reference firmware: 06:00, 06:30, 07:00, 07:30, 08:00; 17:00, 17:30, 18:00, 18:30, 19:00 WIB. A sample starts at/after the scheduled target and finishes within five seconds, with at most two seconds between start/capture. Do not send a late value for a missed checkpoint. For `telemetry`, omit `scheduled_at` and `started_at`; keep the actual `captured_at`. Voltage, frequency and reactive energy are deliberately not yet accepted by this minimal contract.

Firmware should upload from a separate bounded task/queue, never block Modbus/RTC checkpoint acquisition on HTTP. Preserve checkpoints and a persistent outbox locally before transmission; acknowledge/remove from the outbox only after 200/201 **and** a matching returned event ID. On timeout/503 retry the same event with bounded exponential backoff/jitter. Honor 429 Retry-After. Stop/review 400/403/409 payload or binding errors; 401 requires credential repair. Do not disable TLS verification or embed website account passwords, Neon credentials or keys in firmware Git history. Review/replace any public default recovery-AP credentials before connecting a field device.

## Acceptance before production

Test one source/meter in development: TLS trust failure, owner isolation, invalid/revoked credentials, reboot with pending uploads, identical retry after a lost response, conflicting event IDs, out-of-order backfill, rate limits, strict capture windows, unavailable server and unchanged report/autosave tables. Compare accepted normalized kWh against the physical meter. Verify actual capture timing and firmware nonblocking behavior on hardware. Run database integration gates and restore checks before production activation.

References reviewed: [firmware overview](https://github.com/gedxxe/esp32-modbus-energy), [checkpoint engine](https://github.com/gedxxe/esp32-modbus-energy/blob/main/firmware/include/checkpoint_log.h). These establish a reference contract, not proof that an HTTPS uploader already exists. No firmware implementation was copied or modified here.
