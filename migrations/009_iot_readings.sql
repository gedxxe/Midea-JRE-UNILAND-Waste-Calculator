-- Additive telemetry storage. No access to report/autosave tables or automatic mapping.
SET LOCAL lock_timeout = '5s';
CREATE TABLE meter_app.iot_devices (
 device_id text PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES meter_app.users(id),
 plant text NOT NULL CHECK(plant IN ('JRE','UNILAND')),
 meter_id text NOT NULL,
 meter_profile text NOT NULL,
 token_hash text NOT NULL CHECK(length(token_hash)=64),
 active boolean NOT NULL DEFAULT true,
 window_start timestamptz NOT NULL DEFAULT now(),
 hits integer NOT NULL DEFAULT 0,
 last_received_at timestamptz
);
CREATE TABLE meter_app.iot_readings (
 device_id text NOT NULL REFERENCES meter_app.iot_devices(device_id),
 event_id text NOT NULL,
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 event_type text NOT NULL CHECK(event_type IN ('telemetry','checkpoint')),
 payload jsonb NOT NULL,
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 PRIMARY KEY(device_id,event_id)
);
CREATE INDEX iot_readings_device_time ON meter_app.iot_readings(device_id,captured_at DESC,event_id);
CREATE INDEX iot_devices_owner ON meter_app.iot_devices(owner_id,device_id);
