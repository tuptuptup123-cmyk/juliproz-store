-- Reports belong to the owner. Keep normal MFA/session checks for read-only analytics;
-- financial operations retain their existing owner + fresh-MFA protection.
create or replace function store_private.statistics_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select store_private.admin_mfa_satisfied() and exists(
  select 1 from public.store_admins where user_id=auth.uid() and access_role='owner'
 )
$$;
revoke all on function store_private.statistics_owner() from public,anon,authenticated,service_role;
grant execute on function store_private.statistics_owner() to authenticated;

alter policy analytics_admin_read on store_private.analytics_events
 using ((select store_private.statistics_owner()));
alter policy analytics_admin_read on store_private.analytics_sessions
 using ((select store_private.statistics_owner()));

CREATE OR REPLACE FUNCTION public.store_analytics_summary(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; since timestamptz;
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where created_at>=since group by event)t;
 result=result||jsonb_build_object(
 'active',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=now()-interval '2 minutes'),
 'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=since),
 'sessions',(select count(*) from store_private.analytics_sessions where started_at>=since),
 'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from store_private.analytics_events where created_at>=since group by event)t),'{}'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(t) order by "day") from(
 select (created_at at time zone store_private.business_time_zone())::date as "day",count(distinct visitor_id) visitors,
 count(*) filter(where event='product_view') views,
 count(*) filter(where event='cart_add') cart,
 count(*) filter(where event='checkout_open' or event like 'manager_%') contacts
 from store_private.analytics_events where created_at>=since group by 1)t),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,
 count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart,
 count(*) filter(where e.event='manager_product') contacts,
 count(*) filter(where e.event='manager_search_product') search_contacts
 from store_private.analytics_events e join public.products p on p.id=e.product_id where e.created_at>=since
 group by p.id,p.brand,p.name order by count(*) filter(where e.event='product_view') desc,p.id limit 20)t),'[]'::jsonb));
 return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.store_analytics_summary(p_days integer, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; since timestamptz;
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 if p_channel is null or p_channel not in ('website','telegram','legacy') then raise exception 'invalid analytics channel' using errcode='22023';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where channel=p_channel and created_at>=since group by event)t;
 result=result||jsonb_build_object(
 'channel',p_channel,
 'active',(select count(distinct visitor_id) from store_private.analytics_sessions where channel=p_channel and last_seen>=now()-interval '2 minutes'),
 'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where channel=p_channel and last_seen>=since),
 'sessions',(select count(*) from store_private.analytics_sessions where channel=p_channel and started_at>=since),
 'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from store_private.analytics_events where channel=p_channel and created_at>=since group by event)t),'{}'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(t) order by "day") from(
 select (created_at at time zone store_private.business_time_zone())::date as "day",count(distinct visitor_id) visitors,
 count(*) filter(where event='product_view') views,
 count(*) filter(where event='cart_add') cart,
 count(*) filter(where event='checkout_open' or event like 'manager_%') contacts
 from store_private.analytics_events where channel=p_channel and created_at>=since group by 1)t),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,
 count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart,
 count(*) filter(where e.event='manager_product') contacts,
 count(*) filter(where e.event='manager_search_product') search_contacts
 from store_private.analytics_events e join public.products p on p.id=e.product_id where e.channel=p_channel and e.created_at>=since
 group by p.id,p.brand,p.name order by count(*) filter(where e.event='product_view') desc,p.id limit 20)t),'[]'::jsonb));
 return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.store_product_wishlist_counts(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare days integer=greatest(1,least(30,coalesce(p_days,30)));counts jsonb;
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 select coalesce(jsonb_object_agg(product_id::text,n),'{}'::jsonb) into counts from(select product_id,count(*) n from store_private.analytics_events where event='wishlist_add' and product_id is not null and created_at>=now()-make_interval(days=>days) group by product_id)t;
 return jsonb_build_object('days',days,'counts',counts);
end;$function$
;

CREATE OR REPLACE FUNCTION store_private.own_analytics_health()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 return exists(select 1 from store_private.analytics_limits where
 (key='global:minute' and window_at=date_trunc('minute',now()) and hits>=1920) or
 (key='global:day:'||current_date::text and window_at=date_trunc('day',now()) and hits>=200000) or
 (key like 'ip:day:'||current_date::text||':%' and window_at=date_trunc('day',now()) and hits>=16000) or
 (key='sessions:global' and window_at=date_trunc('minute',now()) and hits>=240));
end; $function$
;

CREATE OR REPLACE FUNCTION store_private.own_bot_health()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 return exists(select 1 from store_private.telegram_limit_global where
 (minute_start=date_trunc('minute',now()) and minute_count>=480) or
 (day_start=date_trunc('day',now()) and day_count>=16000));
end; $function$
;

CREATE OR REPLACE FUNCTION store_private.own_retention_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE completed timestamptz; active_job boolean; backlog boolean; failed boolean;
BEGIN
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 SELECT completed_at INTO completed FROM store_private.analytics_retention_state WHERE singleton;
 SELECT active INTO active_job FROM cron.job WHERE jobname='store-analytics-retention';
 SELECT status NOT IN ('succeeded','running','starting') INTO failed FROM cron.job_run_details
  WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='store-analytics-retention') ORDER BY runid DESC LIMIT 1;
 backlog:=EXISTS(SELECT 1 FROM store_private.analytics_events WHERE created_at<now()-interval '91 days')
  OR EXISTS(SELECT 1 FROM store_private.analytics_sessions WHERE last_seen<now()-interval '91 days');
 RETURN jsonb_build_object('healthy',coalesce(active_job,false) AND coalesce(completed>now()-interval '26 hours',false) AND NOT backlog AND NOT coalesce(failed,false),'last_completed_at',completed,'retention_days',90);
END; $function$
;

CREATE OR REPLACE FUNCTION store_private.operational_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 return jsonb_build_object('server_now',now(),
  'errors_24h',coalesce((select sum(hits) from store_private.client_errors where bucket_at>=now()-interval '24 hours'),0),
  'error_alerts',coalesce((select jsonb_agg(to_jsonb(t)) from(select surface,kind,asset,line_no,column_no,release,sum(hits) hits,max(last_seen) last_seen from store_private.client_errors where bucket_at>=date_trunc('minute',now()-interval '24 hours') group by surface,kind,asset,line_no,column_no,release order by max(last_seen) desc limit 30)t),'[]'::jsonb),
  'bot',jsonb_build_object('pending',(select count(*) from store_private.bot_outbox where state in ('pending','retry','sending')),
   'delivered_24h',(select count(*) from store_private.bot_outbox where state='delivered' and finished_at>=now()-interval '24 hours'),
   'failed_24h',(select count(*) from store_private.bot_outbox where state='failed' and finished_at>=now()-interval '24 hours'),
   'overdue',(select count(*) from store_private.bot_outbox where state in ('pending','retry','sending') and created_at<now()-interval '5 minutes')));
end $function$
;
