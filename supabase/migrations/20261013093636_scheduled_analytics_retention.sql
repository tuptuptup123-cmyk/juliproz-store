-- Retention does not depend on visitor traffic. Delete in bounded batches.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE INDEX IF NOT EXISTS analytics_limits_window_idx ON store_private.analytics_limits(window_at);
CREATE TABLE store_private.analytics_retention_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 completed_at timestamptz NOT NULL,
 events_deleted bigint NOT NULL,
 sessions_deleted bigint NOT NULL,
 limits_deleted bigint NOT NULL
);
ALTER TABLE store_private.analytics_retention_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.analytics_retention_state FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION store_private.purge_analytics_history()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE n bigint; e bigint:=0; s bigint:=0; l bigint:=0; cutoff timestamptz:=now()-interval '90 days';
BEGIN
 IF NOT pg_try_advisory_xact_lock(840120261013::bigint) THEN RETURN jsonb_build_object('skipped',true);END IF;
 FOR i IN 1..50 LOOP
  DELETE FROM store_private.analytics_events WHERE event_id IN
   (SELECT event_id FROM store_private.analytics_events WHERE created_at<cutoff ORDER BY created_at LIMIT 10000);
  GET DIAGNOSTICS n=ROW_COUNT;e:=e+n;EXIT WHEN n<10000;
 END LOOP;
 FOR i IN 1..50 LOOP
  DELETE FROM store_private.analytics_sessions WHERE session_id IN
   (SELECT session_id FROM store_private.analytics_sessions WHERE last_seen<cutoff ORDER BY last_seen LIMIT 10000);
  GET DIAGNOSTICS n=ROW_COUNT;s:=s+n;EXIT WHEN n<10000;
 END LOOP;
 FOR i IN 1..50 LOOP
  DELETE FROM store_private.analytics_limits WHERE key IN
   (SELECT key FROM store_private.analytics_limits WHERE window_at<now()-interval '1 day' ORDER BY window_at LIMIT 10000);
  GET DIAGNOSTICS n=ROW_COUNT;l:=l+n;EXIT WHEN n<10000;
 END LOOP;
 -- Keep one month of this job's operational history, without touching other jobs.
 DELETE FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='store-analytics-retention') AND end_time<now()-interval '30 days';
 INSERT INTO store_private.analytics_retention_state VALUES(true,clock_timestamp(),e,s,l)
 ON CONFLICT(singleton) DO UPDATE SET completed_at=excluded.completed_at,events_deleted=excluded.events_deleted,sessions_deleted=excluded.sessions_deleted,limits_deleted=excluded.limits_deleted;
 RETURN jsonb_build_object('events_deleted',e,'sessions_deleted',s,'limits_deleted',l);
END; $$;
REVOKE ALL ON FUNCTION store_private.purge_analytics_history() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('store-analytics-retention','15 20 * * *',$cron$SET statement_timeout='120s'; SELECT store_private.purge_analytics_history();$cron$);

CREATE FUNCTION store_private.own_retention_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE completed timestamptz; active_job boolean; backlog boolean; failed boolean;
BEGIN
 PERFORM store_private.require_workspace_admin();
 SELECT completed_at INTO completed FROM store_private.analytics_retention_state WHERE singleton;
 SELECT active INTO active_job FROM cron.job WHERE jobname='store-analytics-retention';
 SELECT status NOT IN ('succeeded','running','starting') INTO failed FROM cron.job_run_details
  WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='store-analytics-retention') ORDER BY runid DESC LIMIT 1;
 backlog:=EXISTS(SELECT 1 FROM store_private.analytics_events WHERE created_at<now()-interval '91 days')
  OR EXISTS(SELECT 1 FROM store_private.analytics_sessions WHERE last_seen<now()-interval '91 days');
 RETURN jsonb_build_object('healthy',coalesce(active_job,false) AND coalesce(completed>now()-interval '26 hours',false) AND NOT backlog AND NOT coalesce(failed,false),'last_completed_at',completed,'retention_days',90);
END; $$;
REVOKE ALL ON FUNCTION store_private.own_retention_health() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION store_private.own_retention_health() TO authenticated;
CREATE FUNCTION public.store_analytics_retention_health() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT store_private.own_retention_health();$$;
REVOKE ALL ON FUNCTION public.store_analytics_retention_health() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_analytics_retention_health() TO authenticated;

-- pg_net has no application callers. Keep the extension available for project
-- maintenance but remove anonymous/user SQL access to its network operations.
REVOKE USAGE ON SCHEMA net FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
