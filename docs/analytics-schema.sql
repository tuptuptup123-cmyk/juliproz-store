create table store_private.analytics_events (
 event_id uuid primary key,visitor_id uuid not null,session_id uuid not null,
 event text not null check(event in ('visit','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open')),
 product_id bigint,page text,created_at timestamptz not null default now()
);
create index analytics_events_created on store_private.analytics_events(created_at);
create table store_private.analytics_sessions(session_id uuid primary key,visitor_id uuid not null,started_at timestamptz not null default now(),last_seen timestamptz not null default now());
create index analytics_sessions_seen on store_private.analytics_sessions(last_seen);
create table store_private.analytics_limits(key text primary key,window_at timestamptz not null,hits integer not null);
alter table store_private.analytics_events enable row level security;
alter table store_private.analytics_sessions enable row level security;
alter table store_private.analytics_limits enable row level security;
revoke all on store_private.analytics_events,store_private.analytics_sessions,store_private.analytics_limits from public,anon,authenticated;
grant usage on schema store_private to service_role,authenticated;
grant all on store_private.analytics_events,store_private.analytics_sessions,store_private.analytics_limits to service_role;
grant select on store_private.analytics_events,store_private.analytics_sessions to authenticated;
create policy analytics_admin_read on store_private.analytics_events for select to authenticated using ((select store_private.admin_mfa_satisfied()) and exists(select 1 from public.store_admins where user_id=(select auth.uid())));
create policy analytics_admin_read on store_private.analytics_sessions for select to authenticated using ((select store_private.admin_mfa_satisfied()) and exists(select 1 from public.store_admins where user_id=(select auth.uid())));
create function public.store_analytics_ingest(p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,p_product bigint,p_page text,p_fingerprint text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;k text;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open') or p_visitor is null or p_session is null or p_event_id is null or length(p_fingerprint)<>64 then return false;end if;
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return true;end if;
 foreach k in array array['ip:'||p_fingerprint,'visitor:'||p_visitor::text] loop
  insert into store_private.analytics_limits as l(key,window_at,hits) values(k,date_trunc('minute',now()),1)
  on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
  if n>(case when k like 'ip:%' then 500 else 60 end) then return false;end if;
 end loop;
 insert into store_private.analytics_sessions as s(session_id,visitor_id) values(p_session,p_visitor) on conflict(session_id) do update set last_seen=now() where s.visitor_id=excluded.visitor_id;
 if not found then return false;end if;
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page) on conflict(event_id) do nothing;end if;
 -- Bounded retention; cleanup on a small fraction of traffic.
 if random()<0.01 then
  delete from store_private.analytics_limits where window_at<now()-interval '1 day';
  delete from store_private.analytics_events where created_at<now()-interval '90 days';
  delete from store_private.analytics_sessions where last_seen<now()-interval '90 days';
 end if;
 return true;
end; $$;
revoke all on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text) to service_role;
create function public.store_analytics_summary(p_days integer default 7) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;since timestamptz;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where created_at>=since group by event)t;
 result=result||jsonb_build_object('active',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=now()-interval '2 minutes'),'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=since),'sessions',(select count(*) from store_private.analytics_sessions where started_at>=since),'products',coalesce((select jsonb_agg(to_jsonb(t)) from(select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart from store_private.analytics_events e join public.products p on p.id=e.product_id where e.created_at>=since group by p.id,p.brand,p.name order by count(*) desc limit 10)t),'[]'::jsonb));
 return result;
end; $$;
revoke all on function public.store_analytics_summary(integer) from public,anon;
grant execute on function public.store_analytics_summary(integer) to authenticated;
