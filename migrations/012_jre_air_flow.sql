-- Prevent rollback writers from discarding the new cumulative JRE air-flow readings.
-- No existing readings, outputs, credentials or revisions are changed.
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION meter_app.has_jre_air_flow_format(draft jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN draft->>'meterLayout' ~ '^[0-9]{1,8}$' THEN
   COALESCE((draft->>'meterLayout')::integer >= 8 AND
   jsonb_typeof(draft->'airCompressor')='object',false) ELSE false END
$$;
CREATE FUNCTION meter_app.preserve_jre_air_flow_workspace() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection text;
BEGIN
 IF NEW.workspace IS NOT NULL THEN
  FOREACH collection IN ARRAY ARRAY['drafts','workingHours','nightShifts'] LOOP
   IF NOT meter_app.has_jre_air_flow_format(NEW.workspace->collection->'JRE') AND (
    meter_app.has_jre_air_flow_format(OLD.workspace->collection->'JRE') OR
    EXISTS (SELECT 1 FROM meter_app.period_autosaves WHERE owner_id=NEW.owner_id AND plant='JRE'
      AND meter_app.has_jre_air_flow_format(snapshot->'draft'))
   ) THEN
    RAISE EXCEPTION 'JRE air-flow readings require newer client' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_jre_air_flow_workspace BEFORE UPDATE ON meter_app.working_drafts
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_jre_air_flow_workspace();
CREATE FUNCTION meter_app.preserve_jre_air_flow_period() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF meter_app.has_jre_air_flow_format(OLD.snapshot->'draft') AND
    NOT meter_app.has_jre_air_flow_format(NEW.snapshot->'draft') THEN
  RAISE EXCEPTION 'JRE air-flow readings require newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_jre_air_flow_period BEFORE UPDATE ON meter_app.period_autosaves
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_jre_air_flow_period();
CREATE FUNCTION meter_app.preserve_jre_air_flow_checkpoint() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT meter_app.has_jre_air_flow_format(NEW.snapshot->'draft') AND (
  EXISTS (SELECT 1 FROM meter_app.report_revisions WHERE report_id=NEW.report_id
    AND meter_app.has_jre_air_flow_format(snapshot->'draft')) OR
  EXISTS (SELECT 1 FROM meter_app.period_autosaves a JOIN meter_app.reports r
   ON r.owner_id=a.owner_id AND r.plant=a.plant AND r.report_kind=a.report_kind
    AND r.start_date=a.start_date AND r.end_date=a.end_date
   WHERE r.id=NEW.report_id AND meter_app.has_jre_air_flow_format(a.snapshot->'draft'))
 ) THEN
  RAISE EXCEPTION 'JRE air-flow readings require newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_jre_air_flow_checkpoint BEFORE INSERT ON meter_app.report_revisions
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_jre_air_flow_checkpoint();
