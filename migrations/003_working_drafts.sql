CREATE TABLE meter_app.working_drafts (
 owner_id uuid PRIMARY KEY REFERENCES meter_app.users(id) ON DELETE CASCADE,
 workspace jsonb CHECK (workspace IS NULL OR jsonb_typeof(workspace)='object'),
 version integer NOT NULL CHECK (version > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meter_app_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON meter_app.working_drafts TO meter_app_runtime;
 END IF;
END $$;
