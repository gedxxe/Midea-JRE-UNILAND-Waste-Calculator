-- Optional metadata for site-level engineering area filters.
-- Additive only; does not change device/meter/profile binding, energy data or firmware.
-- Apply manually after a verified backup, NOT as part of build/deploy.
SET LOCAL lock_timeout = '5s';
ALTER TABLE meter_app.iot_devices
  ADD COLUMN area text NOT NULL DEFAULT '',
  ADD CONSTRAINT iot_area_length CHECK (length(area) <= 64);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meter_app_runtime') THEN
    GRANT UPDATE(area) ON meter_app.iot_devices TO meter_app_runtime;
  END IF;
END $$;
