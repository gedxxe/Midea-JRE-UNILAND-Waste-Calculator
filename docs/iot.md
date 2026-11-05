# Power Meter Reading

This optional page is for LoRa power-monitoring diagnostics, not a control system or completed hardware commissioning. Device observations do not populate operator tables, autosaves, consumption graphs or reports. Each source binds to one factory, meter and firmware profile ID. The first intended physical source is JRE Warehouse, configured through registration rather than hardcoded in the application. Fleet sharing, additional metrics and retention policies remain separate work. There is no automatic filling or report Apply feature.

## Transport and security

ESP32 reads Modbus locally, persists accepted records, then POSTs JSON to `/api/iot-ingest` using TLS certificate verification. The website GETs `/api/iot-readings` through its existing authenticated session. It does not GET a private ESP32 address, expose the device key in a browser or connect firmware to Neon. Do not put credentials in URLs. CORS/origin protection on existing browser mutations is unchanged.

Each source has a random 256-bit bearer credential; only its SHA-256 hash is stored in the database. Never log payload headers or keys. Revocation/rotation is checked on each upload. Source/meter/profile binding and an active owner are required. Uploads are limited to 16 KiB and 120 authenticated attempts per minute per source, serialized under a database row lock. This is not a substitute for platform/WAF abuse protection. Telemetry should normally upload no more often than every 30 seconds.

Events are append-only through the API. `(device_id,event_id)` is the deduplication identity: an identical canonical retry returns 200, a new committed event returns 201, different content with the same identity returns 409. Retry IDs and exact decimal strings must survive reboot. Backfill is allowed; latest observations are ordered by capture time, not arrival time. No deletion/retention job is installed. Size the database and agree a retention policy before fleet rollout.

HTTPS protects transport and the existing PostgreSQL client verifies remote TLS certificates. Database/platform encryption at rest and access policy require deployment verification; this code does not add a second custom encryption scheme or certify the installation.

## Development activation

1. Keep `IOT_ENABLED=0` in production. Make a development database recovery point and inspect `migrations/009_iot_readings.sql`. Run the existing explicit migration tool against **development only**. Builds do not migrate. No production migration is authorized by this implementation.
2. Use a separate restricted runtime role. In addition to its existing grants it needs `SELECT,INSERT` on `meter_app.iot_devices`, `UPDATE(hits,window_start,last_received_at,token_hash,active)` on that table, and `SELECT,INSERT` on `meter_app.iot_readings`. Do not grant device deletion, owner/meter/profile edits, event update/delete or schema creation. These additional registry grants enable the admin-only website API; migration 009 alone does not grant them. Apply them explicitly to development before enabling the feature, then verify both allowed and denied privileges. Keep the privileged maintenance connection local.
3. Sign in to a separate development admin account; do not reuse production passwords or copy production data. In **Power Meter Reading**, choose **Add power meter** and enter the factory, stable Device ID, Meter ID and firmware profile ID. IDs must exactly match firmware, use 1–64 ASCII letters/digits/underscore/hyphen and begin with a letter/digit. There is no fixed equipment list or mapping to report rows. Choose the IDs with the firmware implementation before registering a physical source. The local maintenance CLI remains available as an alternative and reads `DATABASE_MIGRATION_URL`, never browser credentials:

   ```sh
   node --env-file=.env.local scripts/iot-device.mjs create OWNER_UUID dev_source JRE meter_1 fort
   ```

   The CLI key goes to an ignored `.vercel/iot/*.local.txt` file, not stdout. Website-generated keys appear once in the authenticated page, with the same-origin upload endpoint. Copy the key into the gateway's private configuration before hiding/closing the page; it is cleared on hidden pages, dialog closure and account changes. It is never placed in URLs, browser storage or normal read responses. The database stores only its hash. If a response is lost, refresh the device list; if creation succeeded but the key was lost, use **Replace key**. Do not blindly repeat creation. A failed CLI attempt can leave an unused private key file; it does not prove registration succeeded.

4. Set server-only `IOT_ENABLED=1` in the development deployment and configure its normal `DATABASE_URL`, `AUTH_SECRET`, `APP_ORIGIN`. Production stays off until reviewed migration, recovery, runtime grants and end-to-end tests are complete.
5. Open `/iot-power-meter-reading` after login. Manual refresh is default; optional refresh runs every 30 seconds only while visible/open. The page shows at most 100 observations and the last accepted receipt. It does not claim an online connection merely from a recent receipt. Closing the page or changing account aborts pending reads and clears private display data.

Cards show the latest captured kWh and optional current for each registered source, independently of the 100-row event table and its event-kind filter. Late backfill does not replace a newer capture. Values missing from an observation display as not sent, never zero or a carried-forward current. Recorded zero is displayed. Capture and receipt times are separate; neither certifies live radio connectivity.

Only admins may register, replace keys or disable uploads through `POST /api/iot-devices`. Browser sessions, exact Origin, JSON and matching account headers are required; owner IDs and arbitrary endpoint URLs are rejected. Management uses the existing shared admin budget of 40 mutations per 15-minute window and allows up to 100 registered sources per owner, including disabled ones. Other accounts, including other admins, cannot manage or read that owner's sources. No shared factory fleet view is provided. **Replace key** invalidates the previous credential and re-enables the source; **Disable uploads** blocks ingestion while retaining observations. Confirm both actions in the UI. Identity/binding edits require a new source ID so history cannot silently change attribution.

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

All times are strict UTC ISO seconds ending in Z. Values above are synthetic. Energy is cumulative **primary kWh**, already normalized by firmware with CT/PT applied once, sent as a nonnegative decimal **string** with up to six decimal places. No extra multiplication occurs on the website. The same format applies to optional current values. Send either `current_a` for one explicitly identified current channel, or `current_l1_a`, `current_l2_a`, `current_l3_a` for measured phases; do not send both forms. Missing phases are omitted, never fabricated. The website does not sum phases or infer an average. These values are instantaneous sampled current, not cumulative energy. Old kWh-only payloads remain accepted. IDs use 1–64 ASCII letters/digits/underscore/hyphen, beginning with a letter/digit. Unknown fields/metrics, invalid dates, future timestamps more than five minutes ahead, invalid/missed quality, and mismatched registered identity are rejected.

Checkpoint schedule verified from the reference firmware: 06:00, 06:30, 07:00, 07:30, 08:00; 17:00, 17:30, 18:00, 18:30, 19:00 WIB. A sample starts at/after the scheduled target and finishes within five seconds, with at most two seconds between start/capture. Do not send a late value for a missed checkpoint. For `telemetry`, omit `scheduled_at` and `started_at`; keep the actual `captured_at`. Voltage, frequency and reactive energy are not accepted by this contract. Current must be added to the gateway uploader; this website change is not evidence that the firmware sends it already.

Firmware should upload from a separate bounded task/queue, never block Modbus/RTC checkpoint acquisition on HTTP. Preserve checkpoints and a persistent outbox locally before transmission; acknowledge/remove from the outbox only after 200/201 **and** a matching returned event ID. On timeout/503 retry the same event with bounded exponential backoff/jitter. Honor 429 Retry-After. Stop/review 400/403/409 payload or binding errors; 401 requires credential repair. Do not disable TLS verification or embed website account passwords, Neon credentials or keys in firmware Git history. Review/replace any public default recovery-AP credentials before connecting a field device.

## Acceptance before production

Test one source/meter in development: TLS trust failure, owner isolation, invalid/revoked credentials, reboot with pending uploads, identical retry after a lost response, conflicting event IDs, out-of-order backfill, rate limits, strict capture windows, unavailable server and unchanged report/autosave tables. Compare accepted normalized kWh against the physical meter. Verify actual capture timing and firmware nonblocking behavior on hardware. Run database integration gates and restore checks before production activation.

References reviewed: [firmware overview](https://github.com/gedxxe/esp32-modbus-energy), [checkpoint engine](https://github.com/gedxxe/esp32-modbus-energy/blob/main/firmware/include/checkpoint_log.h). These establish a reference contract, not proof that an HTTPS uploader already exists. No firmware implementation was copied or modified here.
