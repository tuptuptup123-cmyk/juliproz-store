-- Preserve historical events; new product events record their category at the time of the action.
alter table store_private.analytics_events add column category text check(category is null or length(category) between 1 and 80);
alter table store_private.analytics_events drop constraint analytics_events_event_check;
alter table store_private.analytics_events add constraint analytics_events_event_check check(event in ('visit','category_view','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier','channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet'));

CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text, p_channel text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_channel is null or p_channel not in ('website','telegram','legacy') then return false;end if;
 if p_event not in ('visit','heartbeat','category_view','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier','channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet') or p_visitor is null or p_session is null or p_event_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then return false;end if;
 if p_event is null or (p_page is not null and p_page not in ('catalog','wishlist','cart','home','about','services','sell','hermes','outlet')) then return false;end if;
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
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page,channel,category) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_channel,(select nullif(btrim(category),'') from public.products where id=p_product)) on conflict(event_id) do nothing;end if;
 -- Daily cron owns retention; ingestion only records the event.
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;

-- New named parameter selects this overload. Cached clients retain the old signature.
create function public.store_analytics_gateway_ingest_attributed(
 p_secret text,p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,
 p_product bigint,p_page text,p_fingerprint text,p_channel text,p_source text,p_category text)
returns boolean language plpgsql security definer set search_path='' as $$
declare accepted boolean; already_recorded boolean;
begin
 if p_event='category_view' then
  if p_category is null or length(p_category)>80 or p_product is not null or p_page is null or p_page not in ('catalog','hermes')
   or not exists(select 1 from public.products where available and category=p_category) then return false;end if;
 elsif p_category is not null then return false;end if;
 already_recorded:=exists(select 1 from store_private.analytics_events where event_id=p_event_id);
 accepted:=public.store_analytics_gateway_ingest_attributed(p_secret,p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_fingerprint,p_channel,p_source);
 if accepted and not already_recorded and p_event='category_view' then
  update store_private.analytics_events set category=p_category where event_id=p_event_id and visitor_id=p_visitor and session_id=p_session and channel=p_channel and category is null;
 end if;
 return accepted;
end; $$;
revoke all on function public.store_analytics_gateway_ingest_attributed(text,uuid,uuid,uuid,text,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.store_analytics_gateway_ingest_attributed(text,uuid,uuid,uuid,text,bigint,text,text,text,text,text) to anon;
-- Read-only report; existing owner/session/MFA checks also apply to direct calls.
create or replace function store_private.website_analytics_report(p_days integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; since timestamptz:=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
begin
 if not store_private.statistics_owner() then raise exception 'Статистика доступна только главному администратору' using errcode='42501';end if;
 with events as materialized (
  select e.*,coalesce(e.category,nullif(btrim(p.category),''),'Без категории') category_name,
   (e.event='checkout_open' or e.event like 'manager_%') is_contact
  from store_private.analytics_events e left join public.products p on p.id=e.product_id
  where e.channel='website' and e.created_at>=since-(now()-since) and e.created_at<=now()
 ), current_events as materialized(select * from events where created_at>=since),
 totals as (
  select created_at>=since current_period,count(distinct visitor_id) visitors,count(distinct session_id) sessions,
   count(*) filter(where event='product_view') product_view,count(*) filter(where event='wishlist_add') wishlist_add,
   count(*) filter(where event='cart_add') cart_add,count(*) filter(where is_contact) contacts,
   count(distinct visitor_id) filter(where event='product_view') product_visitors,
   count(distinct visitor_id) filter(where event='wishlist_add') wishlist_visitors,
   count(distinct visitor_id) filter(where event='cart_add') cart_visitors,
   count(distinct visitor_id) filter(where is_contact) contact_visitors
  from events group by 1
 ), day_counts as (
  select (created_at at time zone store_private.business_time_zone())::date as "day",
   count(distinct visitor_id) visitors,count(distinct session_id) sessions,count(*) filter(where event='page_view') page_views,
   count(*) filter(where event='product_view') views,count(*) filter(where event='wishlist_add') wishlist,
   count(*) filter(where event='cart_add') cart,count(*) filter(where is_contact) contacts,
   count(distinct visitor_id) filter(where is_contact) contact_visitors
  from current_events group by 1
 ), days as (
  select d::date as "day",coalesce(c.visitors,0) visitors,coalesce(c.sessions,0) sessions,coalesce(c.page_views,0) page_views,
   coalesce(c.views,0) views,coalesce(c.wishlist,0) wishlist,coalesce(c.cart,0) cart,coalesce(c.contacts,0) contacts,
   coalesce(c.contact_visitors,0) contact_visitors
  from generate_series((since at time zone store_private.business_time_zone())::date::timestamp,
   (now() at time zone store_private.business_time_zone())::date::timestamp,interval '1 day') d
  left join day_counts c on c.day=d::date
 ), catalog_categories as (
  select coalesce(nullif(btrim(category),''),'Без категории') category,count(*) visible_products
  from public.products where available group by 1
 ), category_counts as (
  select category_name category,count(*) filter(where event='category_view') visits,
   count(distinct visitor_id) filter(where event='category_view') visitors,
   count(*) filter(where event='product_view') views,count(*) filter(where event='wishlist_add') wishlist,
   count(*) filter(where event='cart_add') cart,count(*) filter(where event in ('manager_product','manager_search_product')) contacts
  from current_events where event='category_view' or product_id is not null group by 1
 ), categories as (
  select coalesce(c.category,e.category) category,coalesce(c.visible_products,0) visible_products,
   coalesce(e.visits,0) visits,coalesce(e.visitors,0) visitors,coalesce(e.views,0) views,
   coalesce(e.wishlist,0) wishlist,coalesce(e.cart,0) cart,coalesce(e.contacts,0) contacts
  from catalog_categories c full join category_counts e using(category)
 ), product_steps as (
  select visitor_id,session_id,min(created_at) filter(where event='product_view') viewed
  from current_events group by 1,2
 ), cart_steps as (
  select p.visitor_id,p.session_id,p.viewed,min(e.created_at) added
  from product_steps p left join current_events e on e.session_id=p.session_id and e.visitor_id=p.visitor_id and e.event='cart_add' and e.created_at>=p.viewed
  group by p.visitor_id,p.session_id,p.viewed
 ), steps as (
  select c.visitor_id,c.session_id,c.viewed,c.added,bool_or(e.event_id is not null) contacted
  from cart_steps c left join current_events e on e.session_id=c.session_id and e.visitor_id=c.visitor_id and e.is_contact and e.created_at>=c.added
  group by c.visitor_id,c.session_id,c.viewed,c.added
 )
 select coalesce((select jsonb_object_agg(event,n) from(select event,count(*) n from current_events group by event) t),'{}'::jsonb)
 || coalesce((select to_jsonb(t)-'current_period' from totals t where current_period),'{"visitors":0,"sessions":0,"product_view":0,"wishlist_add":0,"cart_add":0,"contacts":0,"product_visitors":0,"wishlist_visitors":0,"cart_visitors":0,"contact_visitors":0}'::jsonb)
 || jsonb_build_object('channel','website','report_version',2,
  'period',jsonb_build_object('from',since,'to',now(),'previous_from',since-(now()-since),'timezone',store_private.business_time_zone()),
  'category_tracking_since','2026-10-18T05:37:22Z',
  'previous',coalesce((select to_jsonb(t)-'current_period' from totals t where not current_period),'{}'::jsonb),
  'active',(select count(distinct visitor_id) from store_private.analytics_sessions where channel='website' and last_seen>=now()-interval '2 minutes'),
  'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from current_events group by event) t),'{}'::jsonb),
  'daily',coalesce((select jsonb_agg(to_jsonb(d) order by "day") from days d),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by visits desc,views desc,category) from categories c),'[]'::jsonb),
  'funnel',(select jsonb_build_object('visitors',count(distinct visitor_id),'product',count(distinct visitor_id) filter(where viewed is not null),'cart',count(distinct visitor_id) filter(where added is not null),'contact',count(distinct visitor_id) filter(where contacted)) from steps),
  'pages',coalesce((select jsonb_agg(to_jsonb(t) order by views desc,page) from(select coalesce(page,'unknown') page,count(*) views,count(distinct visitor_id) visitors from current_events where event='page_view' group by 1) t),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(t) order by views desc,id) from(
   select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,
    count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart,
    count(*) filter(where e.event='manager_product') contacts,count(*) filter(where e.event='manager_search_product') search_contacts
   from current_events e join public.products p on p.id=e.product_id group by p.id,p.brand,p.name
   order by views desc,p.id limit 20) t),'[]'::jsonb),
  'acquisition',coalesce((select jsonb_agg(to_jsonb(t) order by visitors desc,source) from(
   select coalesce(source,'unknown') source,count(distinct visitor_id) visitors,count(distinct session_id) sessions,
    count(*) filter(where is_contact) contacts,count(distinct visitor_id) filter(where is_contact) contact_visitors
   from current_events group by 1) t),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function store_private.website_analytics_report(integer) from public,anon,authenticated,service_role;
grant execute on function store_private.website_analytics_report(integer) to authenticated;

-- Leave bot/archive reports and the 24-hour overview unchanged.
do $$ declare definition text; needle text:='since=now()-make_interval'; begin
 definition:=pg_get_functiondef('public.store_analytics_summary(integer,text)'::regprocedure);
 if position('if not store_private.statistics_owner()' in definition)=0 or position(needle in definition)=0 then raise exception 'Unexpected statistics definition';end if;
 definition:=replace(definition,needle,'if p_channel=''website'' then return store_private.website_analytics_report(p_days);end if; '||needle);
 execute definition;
end; $$;
notify pgrst,'reload schema';
