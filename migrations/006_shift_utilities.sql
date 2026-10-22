-- Protect newly recorded shift utilities when older application code is used for rollback.
-- No readings, report output, IDs or existing revisions are rewritten.
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION meter_app.preserve_working_hours_draft() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection text; plant text;
BEGIN
 IF NEW.workspace IS NOT NULL THEN
  IF (OLD.workspace ? 'workingHours' AND NOT (NEW.workspace ? 'workingHours')) OR
     (OLD.workspace ? 'nightShifts' AND NOT (NEW.workspace ? 'nightShifts')) THEN
   RAISE EXCEPTION 'Draft format requires newer client' USING ERRCODE='23514';
  END IF;
  FOREACH collection IN ARRAY ARRAY['workingHours','nightShifts'] LOOP
   FOREACH plant IN ARRAY ARRAY['JRE','UNILAND'] LOOP
    IF OLD.workspace->collection->plant->>'utilityLayout'='1' AND
       NEW.workspace->collection->plant->>'utilityLayout' IS DISTINCT FROM '1' THEN
     RAISE EXCEPTION 'Shift utilities require newer client' USING ERRCODE='23514';
    END IF;
   END LOOP;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION meter_app.preserve_shift_report_utilities() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.snapshot->'draft'->>'utilityLayout' IS DISTINCT FROM '1' AND EXISTS (
  SELECT 1 FROM meter_app.report_revisions
  WHERE report_id=NEW.report_id AND snapshot->'draft'->>'utilityLayout'='1'
 ) THEN
  RAISE EXCEPTION 'Shift utilities require newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_shift_report_utilities BEFORE INSERT ON meter_app.report_revisions
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_shift_report_utilities();
