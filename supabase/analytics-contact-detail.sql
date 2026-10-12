begin;
alter table store_private.analytics_events drop constraint analytics_events_event_check;
alter table store_private.analytics_events add constraint analytics_events_event_check check(event in ('visit','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier'));
CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier') or p_visitor is null or p_session is null or p_event_id is null or length(p_fingerprint)<>64 then return false;end if;
 begin
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return true;end if;
 foreach k in array array['ip:'||p_fingerprint,'visitor:'||p_visitor::text,'global:minute','global:day:'||current_date::text] loop
  insert into store_private.analytics_limits as l(key,window_at,hits) values(k,case when k like 'global:day:%' then date_trunc('day',now()) else date_trunc('minute',now()) end,1)
  on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
  if n>(case when k='global:minute' then 2400 when k like 'global:day:%' then 250000 when k like 'ip:%' then 600 else 120 end) then raise exception using errcode='JP429',message='analytics refused';end if;
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
 -- Bounded retention; cleanup on a small fraction of traffic.
 if random()<0.01 then
  delete from store_private.analytics_limits where window_at<now()-interval '1 day';
  delete from store_private.analytics_events where created_at<now()-interval '90 days';
  delete from store_private.analytics_sessions where last_seen<now()-interval '90 days';
 end if;
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;

create or replace function public.store_analytics_summary(p_days integer default 7)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; since timestamptz;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where created_at>=since group by event)t;
 result=result||jsonb_build_object(
 'active',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=now()-interval '2 minutes'),
 'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=since),
 'sessions',(select count(*) from store_private.analytics_sessions where started_at>=since),
 'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from store_private.analytics_events where created_at>=since group by event)t),'{}'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(t) order by "day") from(
 select (created_at at time zone 'Asia/Bangkok')::date as "day",count(distinct visitor_id) visitors,
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
end; $$;
commit;
