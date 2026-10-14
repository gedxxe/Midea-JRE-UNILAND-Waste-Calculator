-- Additive: old daily clients and snapshots keep their existing behavior.
SET LOCAL lock_timeout = '5s';
ALTER TABLE meter_app.reports ADD COLUMN report_kind text NOT NULL DEFAULT 'daily'
  CHECK (report_kind IN ('daily', 'workingHours'));
ALTER TABLE meter_app.reports DROP CONSTRAINT reports_check;
ALTER TABLE meter_app.reports ADD CONSTRAINT reports_period_check CHECK (
  (report_kind = 'daily' AND end_date > start_date) OR
  (report_kind = 'workingHours' AND end_date = start_date)
);

-- Older code may still read daily data after rollback. It must not discard trial drafts.
CREATE FUNCTION meter_app.preserve_working_hours_draft() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.workspace ? 'workingHours' AND NEW.workspace IS NOT NULL
     AND NOT (NEW.workspace ? 'workingHours') THEN
    RAISE EXCEPTION 'Draft format requires newer client' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_working_hours_draft BEFORE UPDATE ON meter_app.working_drafts
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_working_hours_draft();

