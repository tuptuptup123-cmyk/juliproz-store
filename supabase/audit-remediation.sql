begin;
create or replace function store_private.valid_product_image(value text)
returns boolean language sql immutable strict security invoker set search_path='' as $$
 select value ~ '^https://(juliproz-store[.]vercel[.]app/images/|qhgzzhgxwpcctafpzjid[.]supabase[.]co/storage/v1/object/public/product-photos/)[^[:space:]]+$'
   and value !~ '[\\?#%]' and value !~ '/[.][.](/|$)';
$$;
create or replace function public.store_analytics_ingest(p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,p_product bigint,p_page text,p_fingerprint text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;k text;new_session boolean;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open') or p_visitor is null or p_session is null or p_event_id is null or length(p_fingerprint)<>64 then return false;end if;
 begin
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return true;end if;
 foreach k in array array['ip:'||p_fingerprint,'visitor:'||p_visitor::text,'global:minute','global:day:'||current_date::text] loop
  insert into store_private.analytics_limits as l(key,window_at,hits) values(k,case when k like 'global:day:%' then date_trunc('day',now()) else date_trunc('minute',now()) end,1)
  on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
  if n>(case when k='global:minute' then 120 when k like 'global:day:%' then 10000 else 30 end) then raise exception using errcode='JP429',message='analytics refused';end if;
 end loop;
 new_session:=not exists(select 1 from store_private.analytics_sessions where session_id=p_session);
 if new_session then
  foreach k in array array['sessions:global','sessions:ip:'||p_fingerprint] loop
   insert into store_private.analytics_limits as l(key,window_at,hits) values(k,date_trunc('minute',now()),1)
   on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
   if n>(case when k='sessions:global' then 20 else 5 end) then raise exception using errcode='JP429',message='analytics refused';end if;
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
end; $$;
revoke all on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text) to service_role;


notify pgrst,'reload schema';
commit;
