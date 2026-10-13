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
