-- Keep previous unclassified events as legacy; never guess their origin.
-- Old RPC signatures remain available for cached deployments and the all-channel overview.
alter table store_private.analytics_events add column channel text not null default 'legacy'
 check (channel in ('website','telegram','legacy'));
alter table store_private.analytics_sessions add column channel text not null default 'legacy'
 check (channel in ('website','telegram','legacy'));
create index analytics_events_channel_created on store_private.analytics_events(channel,created_at);
create index analytics_sessions_channel_seen on store_private.analytics_sessions(channel,last_seen);

CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text, p_channel text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_channel is null or p_channel not in ('website','telegram','legacy') then return false;end if;
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier') or p_visitor is null or p_session is null or p_event_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then return false;end if;
 if p_event is null or (p_page is not null and p_page not in ('catalog','wishlist','cart')) then return false;end if;
 if p_event in ('product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','manager_product','manager_search_product') and p_product is null then return false;end if;
 if p_product is not null and not exists(select 1 from public.products where id=p_product and available=true) then return false;end if;

 begin
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return exists(select 1 from store_private.analytics_events where event_id=p_event_id and visitor_id=p_visitor and session_id=p_session and channel=p_channel);end if;
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
 insert into store_private.analytics_sessions as s(session_id,visitor_id,channel) values(p_session,p_visitor,p_channel) on conflict(session_id) do update set last_seen=now() where s.visitor_id=excluded.visitor_id and s.channel=excluded.channel;
 if not found then raise exception using errcode='JP429',message='analytics refused';end if;
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page,channel) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_channel) on conflict(event_id) do nothing;end if;
 -- Daily cron owns retention; ingestion only records the event.
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;


revoke all on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text,text) from public,anon,authenticated,service_role;

create function public.store_analytics_gateway_ingest(p_secret text,p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,p_product bigint,p_page text,p_fingerprint text,p_channel text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_secret is null or length(p_secret)<>64 or not exists(
  select 1 from store_private.analytics_gateway_secret where singleton and secret_hash=sha256(convert_to(p_secret,'UTF8'))
 ) then raise exception 'Unauthorized' using errcode='42501';end if;
 return public.store_analytics_ingest(p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_fingerprint,p_channel);
end; $$;
revoke all on function public.store_analytics_gateway_ingest(text,uuid,uuid,uuid,text,bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.store_analytics_gateway_ingest(text,uuid,uuid,uuid,text,bigint,text,text,text) to anon;

create or replace function public.store_analytics_summary(p_days integer,p_channel text)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; since timestamptz;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
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
 select (created_at at time zone 'Asia/Bangkok')::date as "day",count(distinct visitor_id) visitors,
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
end; $$;

revoke all on function public.store_analytics_summary(integer,text) from public,anon,authenticated,service_role;
grant execute on function public.store_analytics_summary(integer,text) to authenticated;
notify pgrst,'reload schema';
