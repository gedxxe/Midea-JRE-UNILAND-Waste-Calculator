-- Mutable autosaved period copies are separate from immutable manual checkpoints.
SET LOCAL lock_timeout = '5s';
CREATE TABLE meter_app.period_autosaves (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES meter_app.users(id) ON DELETE CASCADE,
 plant text NOT NULL CHECK (plant IN ('JRE','UNILAND')),
 report_kind text NOT NULL CHECK (report_kind IN ('daily','workingHours','nightShift')),
 start_date date NOT NULL,
 end_date date NOT NULL,
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
 saved_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT autosaves_period_check CHECK (
  (report_kind='daily' AND end_date>start_date) OR
  (report_kind='workingHours' AND end_date=start_date) OR
  (report_kind='nightShift' AND end_date=start_date+1)
 ),
 UNIQUE(owner_id,plant,report_kind,start_date,end_date)
);
CREATE INDEX period_autosaves_owner_updated ON meter_app.period_autosaves(owner_id,saved_at DESC,id);
CREATE FUNCTION meter_app.preserve_autosave_workspace() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.workspace->>'autosaveLayout'='1' AND NEW.workspace IS NOT NULL AND
    NEW.workspace->>'autosaveLayout' IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'Autosave format requires newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_autosave_workspace BEFORE UPDATE ON meter_app.working_drafts
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_autosave_workspace();
CREATE FUNCTION meter_app.preserve_autosave_checkpoints() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.snapshot->>'autosaveLayout' IS DISTINCT FROM '1' AND (
  EXISTS (SELECT 1 FROM meter_app.report_revisions WHERE report_id=NEW.report_id AND snapshot->>'autosaveLayout'='1') OR
  EXISTS (SELECT 1 FROM meter_app.period_autosaves a JOIN meter_app.reports r
   ON r.owner_id=a.owner_id AND r.plant=a.plant AND r.report_kind=a.report_kind AND r.start_date=a.start_date AND r.end_date=a.end_date
   WHERE r.id=NEW.report_id)
 ) THEN
  RAISE EXCEPTION 'Autosave checkpoints require newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_autosave_checkpoints BEFORE INSERT ON meter_app.report_revisions
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_autosave_checkpoints();
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meter_app_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON meter_app.period_autosaves TO meter_app_runtime;
 END IF;
END $$;
