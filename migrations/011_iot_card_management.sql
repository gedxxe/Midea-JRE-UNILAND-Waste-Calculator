-- Reversible card management only. Device bindings and observations stay intact.
SET LOCAL lock_timeout = '5s';
ALTER TABLE meter_app.iot_devices
  ADD COLUMN display_name text NOT NULL DEFAULT '',
  ADD COLUMN archived_at timestamptz,
  ADD CONSTRAINT iot_display_name_length CHECK (length(display_name) <= 80),
  ADD CONSTRAINT iot_archived_inactive CHECK (archived_at IS NULL OR NOT active);
-- Keep transport identifiers, ownership and observations outside these grants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meter_app_runtime') THEN
    GRANT UPDATE(display_name,archived_at) ON meter_app.iot_devices TO meter_app_runtime;
  END IF;
END $$;
