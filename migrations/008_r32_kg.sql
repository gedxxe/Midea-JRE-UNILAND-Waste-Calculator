-- Protect explicit R32 stock units from older writers. No readings or outputs are rewritten.
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION meter_app.preserve_r32_workspace() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection text;
BEGIN
 IF NEW.workspace IS NOT NULL THEN
  FOREACH collection IN ARRAY ARRAY['drafts','workingHours','nightShifts'] LOOP
   IF NEW.workspace->collection->'JRE'->'gas'->>'version' IS DISTINCT FROM 'jre-2026-11-r32-kg-v2' AND (
      OLD.workspace->collection->'JRE'->'gas'->>'version'='jre-2026-11-r32-kg-v2' OR
      EXISTS (SELECT 1 FROM meter_app.period_autosaves WHERE owner_id=NEW.owner_id AND plant='JRE' AND snapshot->'draft'->'gas'->>'version'='jre-2026-11-r32-kg-v2')
   ) THEN
    RAISE EXCEPTION 'R32 units require newer client' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_r32_workspace BEFORE UPDATE ON meter_app.working_drafts
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_r32_workspace();
CREATE FUNCTION meter_app.preserve_r32_period() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.snapshot->'draft'->'gas'->>'version'='jre-2026-11-r32-kg-v2' AND
    NEW.snapshot->'draft'->'gas'->>'version' IS DISTINCT FROM 'jre-2026-11-r32-kg-v2' THEN
  RAISE EXCEPTION 'R32 units require newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_r32_period BEFORE UPDATE ON meter_app.period_autosaves
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_r32_period();
CREATE FUNCTION meter_app.preserve_r32_checkpoint() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.snapshot->'draft'->'gas'->>'version' IS DISTINCT FROM 'jre-2026-11-r32-kg-v2' AND (
  EXISTS (SELECT 1 FROM meter_app.report_revisions WHERE report_id=NEW.report_id AND snapshot->'draft'->'gas'->>'version'='jre-2026-11-r32-kg-v2') OR
  EXISTS (SELECT 1 FROM meter_app.period_autosaves a JOIN meter_app.reports r
   ON r.owner_id=a.owner_id AND r.plant=a.plant AND r.report_kind=a.report_kind AND r.start_date=a.start_date AND r.end_date=a.end_date
   WHERE r.id=NEW.report_id AND a.snapshot->'draft'->'gas'->>'version'='jre-2026-11-r32-kg-v2')
 ) THEN
  RAISE EXCEPTION 'R32 units require newer client' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_r32_checkpoint BEFORE INSERT ON meter_app.report_revisions
FOR EACH ROW EXECUTE FUNCTION meter_app.preserve_r32_checkpoint();
