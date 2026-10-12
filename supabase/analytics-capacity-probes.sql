-- Brief transaction; only anonymous telemetry counter rows are temporarily touched.
-- No changes survive rollback; events contain no customer information.
begin;
do $$
declare visitor uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid(); fingerprint text:=repeat('a',64); i integer; accepted boolean;
begin
 -- Isolate the capacity assertion from traffic already counted this minute.
 update store_private.analytics_limits set hits=0 where key in ('global:minute','global:day:'||current_date::text,'sessions:global');
 for i in 1..100 loop
  accepted:=public.store_analytics_ingest(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'visit',null,'catalog',fingerprint);
  if not accepted then raise exception '100 same-network visitors denied at %',i;end if;
 end loop;
 for i in 1..120 loop
  accepted:=public.store_analytics_ingest(gen_random_uuid(),visitor,session_id,'heartbeat',null,'catalog',repeat('b',64));
  if not accepted then raise exception 'Allowed visitor event denied at %',i;end if;
 end loop;
 if public.store_analytics_ingest(gen_random_uuid(),visitor,session_id,'heartbeat',null,'catalog',repeat('b',64)) then raise exception 'Per-visitor limit bypassed';end if;
 update store_private.analytics_limits set hits=2400,window_at=date_trunc('minute',now()) where key='global:minute';
 if public.store_analytics_ingest(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'visit',null,'catalog',repeat('c',64)) then raise exception 'Global limit bypassed';end if;
 if has_function_privilege('anon','public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text)','EXECUTE') then raise exception 'Anonymous ingest RPC exposed';end if;
end $$;
select 'PASS: 100 same-network visitors accepted; per-visitor and global limits preserved; all telemetry fixtures rolled back' as verification;
rollback;
