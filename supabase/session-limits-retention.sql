-- Strict administrative deadlines are checked on every protected SQL operation,
-- independently of JWT refresh and of when Supabase removes expired sessions.
CREATE TABLE store_private.admin_session_activity (
 session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
 last_seen timestamptz NOT NULL
);
ALTER TABLE store_private.admin_session_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.admin_session_activity FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION store_private.admin_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  LEFT JOIN store_private.admin_session_activity a ON a.session_id=s.id
  WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid()
   AND s.created_at>now()-interval '12 hours'
   AND coalesce(a.last_seen,s.created_at)>now()-interval '30 minutes'
   AND (s.not_after IS NULL OR s.not_after>now())
   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
 );
$$;

CREATE FUNCTION store_private.touch_own_admin_session()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE s auth.sessions%ROWTYPE; t timestamptz; seen timestamptz; deadline timestamptz;
BEGIN
 -- Lock the actual caller's session; do not accept a client-selected session ID or time.
 SELECT ss.* INTO s FROM auth.sessions ss JOIN auth.users u ON u.id=ss.user_id
 WHERE ss.id::text=auth.jwt()->>'session_id' AND ss.user_id=auth.uid()
 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
 FOR UPDATE OF ss;
 t:=clock_timestamp();
 IF s.id IS NULL OR s.created_at IS NULL THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501';END IF;
 SELECT last_seen INTO seen FROM store_private.admin_session_activity WHERE session_id=s.id;
 deadline:=least(s.created_at+interval '12 hours',s.not_after);
 IF deadline<=t OR coalesce(seen,s.created_at)<=t-interval '30 minutes' THEN
  RAISE EXCEPTION 'Session expired; sign in again' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_admins WHERE user_id=s.user_id)
 AND NOT EXISTS(SELECT 1 FROM auth.users u JOIN store_private.admin_invitations i ON lower(i.email)=lower(u.email)
  WHERE u.id=s.user_id AND u.email_confirmed_at IS NOT NULL AND i.expires_at>t) THEN
  RAISE EXCEPTION 'Administrator or current invitation required' USING ERRCODE='42501';
 END IF;
 INSERT INTO store_private.admin_session_activity(session_id,last_seen) VALUES(s.id,t)
 ON CONFLICT(session_id) DO UPDATE SET last_seen=greatest(admin_session_activity.last_seen,excluded.last_seen);
 RETURN jsonb_build_object('server_now',t,'expires_at',deadline,'idle_expires_at',least(t+interval '30 minutes',deadline));
END; $$;
REVOKE ALL ON FUNCTION store_private.touch_own_admin_session() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION store_private.touch_own_admin_session() TO authenticated;
CREATE FUNCTION public.touch_store_admin_session() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT store_private.touch_own_admin_session();$$;
REVOKE ALL ON FUNCTION public.touch_store_admin_session() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.touch_store_admin_session() TO authenticated;

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

-- pg_net has no application callers or queued work. Its objects belong to
-- supabase_admin, so application-role REVOKE cannot remove those owner grants.
-- Remove the unused extension using the documented supported operation.
DROP EXTENSION IF EXISTS pg_net;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier') or p_visitor is null or p_session is null or p_event_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then return false;end if;
 if p_event is null or (p_page is not null and p_page not in ('catalog','wishlist','cart')) then return false;end if;
 if p_event in ('product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','manager_product','manager_search_product') and p_product is null then return false;end if;
 if p_product is not null and not exists(select 1 from public.products where id=p_product and available=true) then return false;end if;

 begin
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return true;end if;
 foreach k in array array['ip:'||p_fingerprint,'visitor:'||p_visitor::text,'global:minute','global:day:'||current_date::text,'ip:day:'||current_date::text||':'||p_fingerprint] loop
  insert into store_private.analytics_limits as l(key,window_at,hits) values(k,case when k like 'global:day:%' or k like 'ip:day:%' then date_trunc('day',now()) else date_trunc('minute',now()) end,1)
  on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
  if n>(case when k='global:minute' then 2400 when k like 'global:day:%' then 250000 when k like 'ip:day:%' then 20000 when k like 'ip:%' then 600 else 120 end) then raise exception using errcode='JP429',message='analytics refused';end if;
 end loop;
 new_session:=not exists(select 1 from store_private.analytics_sessions where session_id=p_session);
 if new_session then
  foreach k in array array['sessions:global','sessions:ip:'||p_fingerprint] loop
   insert into store_private.analytics_limits as l(key,window_at,hits) values(k,date_trunc('minute',now()),1)
   on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
   if n>(case when k='sessions:global' then 300 else 150 end) then raise exception using errcode='JP429',message='analytics refused';end if;
  end loop;
 end if;
 insert into store_private.analytics_sessions as s(session_id,visitor_id) values(p_session,p_visitor) on conflict(session_id) do update set last_seen=now() where s.visitor_id=excluded.visitor_id;
 if not found then raise exception using errcode='JP429',message='analytics refused';end if;
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page) on conflict(event_id) do nothing;end if;
 -- Daily cron owns retention; ingestion only records the event.
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;

-- The gateway capability permits only bounded anonymous analytics ingestion.
-- No service_role credential is stored in Vercel or sent by the browser.
CREATE TABLE store_private.analytics_gateway_secret (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 secret_hash bytea NOT NULL CHECK(octet_length(secret_hash)=32)
);
ALTER TABLE store_private.analytics_gateway_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.analytics_gateway_secret FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.store_analytics_gateway_ingest(p_secret text,p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,p_product bigint,p_page text,p_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_secret IS NULL OR length(p_secret)<>64 OR NOT EXISTS(
  SELECT 1 FROM store_private.analytics_gateway_secret WHERE singleton AND secret_hash=sha256(convert_to(p_secret,'UTF8'))
 ) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 RETURN public.store_analytics_ingest(p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_fingerprint);
END; $$;
REVOKE ALL ON FUNCTION public.store_analytics_gateway_ingest(text,uuid,uuid,uuid,text,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_analytics_gateway_ingest(text,uuid,uuid,uuid,text,bigint,text,text) TO anon;
NOTIFY pgrst,'reload schema';
