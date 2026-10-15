-- Run inside a transaction and roll back: no test events or rate counters persist.
do $$
declare v uuid:=gen_random_uuid(); s uuid; e uuid; ch text; fp text:=repeat('c',64); n integer;
begin
 foreach ch in array array['website','telegram','legacy'] loop
  s:=gen_random_uuid();e:=gen_random_uuid();
  if not public.store_analytics_ingest(e,v,s,'visit',null,'catalog',fp,ch) then raise exception 'channel % visit rejected',ch;end if;
  if not public.store_analytics_ingest(e,v,s,'visit',null,'catalog',fp,ch) then raise exception 'idempotent replay rejected';end if;
  if public.store_analytics_ingest(e,v,s,'visit',null,'catalog',fp,case when ch='website' then 'telegram' else 'website' end) then raise exception 'event relabelled';end if;
  if not public.store_analytics_ingest(gen_random_uuid(),v,s,'heartbeat',null,null,fp,ch) then raise exception 'heartbeat rejected';end if;
  if public.store_analytics_ingest(gen_random_uuid(),v,s,'visit',null,null,fp,case when ch='website' then 'telegram' else 'website' end) then raise exception 'session relabelled';end if;
  select count(*) into n from store_private.analytics_events where visitor_id=v and channel=ch;
  if n<>1 then raise exception 'expected one event in %, got %',ch,n;end if;
  select count(*) into n from store_private.analytics_sessions where visitor_id=v and channel=ch;
  if n<>1 then raise exception 'expected one session in %, got %',ch,n;end if;
 end loop;
 if public.store_analytics_ingest(gen_random_uuid(),v,gen_random_uuid(),'visit',null,null,fp,'invalid') then raise exception 'invalid channel accepted';end if;
 begin
  perform public.store_analytics_summary(7,'website');
  raise exception 'report allowed without admin session';
 exception when insufficient_privilege then null;end;
 begin
  perform public.store_analytics_gateway_ingest(repeat('0',64),gen_random_uuid(),v,gen_random_uuid(),'visit',null,null,fp,'telegram');
  raise exception 'gateway allowed invalid secret';
 exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.store_analytics_summary(integer,text)','EXECUTE') then raise exception 'anonymous report access';end if;
 if has_function_privilege('anon','public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text,text)','EXECUTE') then raise exception 'untrusted direct ingest';end if;
 if not has_function_privilege('authenticated','public.store_analytics_summary(integer,text)','EXECUTE') then raise exception 'admin report unavailable';end if;
end $$;
