-- Additive, dev-first request mailbox. No energy observations, reports or
-- operator drafts are rewritten. Apply explicitly after backup/approval.
SET LOCAL lock_timeout = '5s';
CREATE TABLE meter_app.iot_refresh_requests (
  device_id text PRIMARY KEY REFERENCES meter_app.iot_devices(device_id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);
-- Existing restricted development role; no grants to PUBLIC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meter_app_runtime') THEN
    GRANT SELECT, INSERT ON meter_app.iot_refresh_requests TO meter_app_runtime;
    GRANT UPDATE(requested_at,completed_at) ON meter_app.iot_refresh_requests TO meter_app_runtime;
  END IF;
END $$;
