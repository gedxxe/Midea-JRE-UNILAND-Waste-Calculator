CREATE TABLE meter_app.consumption_imports (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES meter_app.users(id),
 source_name text NOT NULL,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
 imported_rows integer NOT NULL CHECK (imported_rows >= 0),
 skipped_rows integer NOT NULL CHECK (skipped_rows >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,manifest_sha256)
);
CREATE TABLE meter_app.consumption_history (
 id uuid PRIMARY KEY,
 import_id uuid NOT NULL REFERENCES meter_app.consumption_imports(id),
 owner_id uuid NOT NULL REFERENCES meter_app.users(id),
 plant text NOT NULL CHECK (plant IN ('JRE','UNILAND')),
 start_date date NOT NULL,
 end_date date NOT NULL CHECK (end_date > start_date),
 metric_values jsonb NOT NULL CHECK (jsonb_typeof(metric_values)='object'),
 source_sheet text NOT NULL,
 source_row integer NOT NULL CHECK (source_row > 0),
 source_range text NOT NULL,
 UNIQUE(owner_id,plant,start_date,end_date)
);
CREATE INDEX history_owner_dates ON meter_app.consumption_history(owner_id,plant,start_date);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meter_app_runtime') THEN
  GRANT SELECT ON meter_app.consumption_history,meter_app.consumption_imports TO meter_app_runtime;
 END IF;
END $$;
