-- Keep existing snapshots and report IDs. Day retains its workingHours kind.
SET LOCAL lock_timeout = '5s';
ALTER TABLE meter_app.reports DROP CONSTRAINT reports_report_kind_check;
ALTER TABLE meter_app.reports ADD CONSTRAINT reports_report_kind_check CHECK (report_kind IN ('daily','workingHours','nightShift'));
ALTER TABLE meter_app.reports DROP CONSTRAINT reports_period_check;
ALTER TABLE meter_app.reports ADD CONSTRAINT reports_period_check CHECK (
 (report_kind='daily' AND end_date>start_date) OR
 (report_kind='workingHours' AND end_date=start_date) OR
 (report_kind='nightShift' AND end_date=start_date+1)
);
ALTER TABLE meter_app.reports DROP CONSTRAINT reports_owner_id_plant_start_date_end_date_key;
ALTER TABLE meter_app.reports ADD CONSTRAINT reports_owner_plant_kind_period_key UNIQUE(owner_id,plant,report_kind,start_date,end_date);
CREATE OR REPLACE FUNCTION meter_app.preserve_working_hours_draft() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.workspace IS NOT NULL AND (
  (OLD.workspace ? 'workingHours' AND NOT (NEW.workspace ? 'workingHours')) OR
  (OLD.workspace ? 'nightShifts' AND NOT (NEW.workspace ? 'nightShifts'))
 ) THEN
  RAISE EXCEPTION 'Draft format requires newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
