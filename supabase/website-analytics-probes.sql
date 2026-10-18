-- Read existing aggregates through synthetic roles, then roll back all fixture users.
begin;
set local statement_timeout='15s';
do $$
declare owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();owner_sid uuid:=gen_random_uuid();staff_sid uuid:=gen_random_uuid();r jsonb;expected bigint;total bigint;
begin
 insert into auth.users(id,email,email_confirmed_at) values(owner_id,owner_id||'@example.invalid',now()),(staff_id,staff_id||'@example.invalid',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_sid,owner_id,now(),now()),(staff_sid,staff_id,now(),now());
 insert into public.store_admins(user_id,display_name,access_role) values(owner_id,'Website report probe','owner'),(staff_id,'Website report probe','admin');
 select count(distinct visitor_id) into expected from store_private.analytics_events where channel='website' and created_at>=now()-interval '7 days' and created_at<=now();
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now()))))::text,true);
 set local role authenticated;
 r:=public.store_analytics_summary(7,'website');
 if r->>'report_version'<>'2' or (r->>'visitors')::bigint<>expected or jsonb_array_length(r->'daily')<>8 then raise exception 'Website summary or period mismatch';end if;
 select sum((x->>'views')::bigint) into total from jsonb_array_elements(r->'daily') x;
 if total<>coalesce((r->>'product_view')::bigint,0) then raise exception 'Daily product views mismatch';end if;
 select sum((x->>'contacts')::bigint) into total from jsonb_array_elements(r->'acquisition') x;
 if coalesce(total,0)<>coalesce((r->>'contacts')::bigint,0) then raise exception 'Source contact totals mismatch';end if;
 select sum((x->>'visits')::bigint) into total from jsonb_array_elements(r->'categories') x;
 if coalesce(total,0)<>coalesce((r->>'category_view')::bigint,0) then raise exception 'Category visit totals mismatch';end if;
 if (r->'funnel'->>'contact')::bigint>(r->'funnel'->>'cart')::bigint or (r->'funnel'->>'cart')::bigint>(r->'funnel'->>'product')::bigint then raise exception 'Nonsequential journey';end if;
 perform public.store_analytics_summary(30,'website');
 if public.store_analytics_summary(7,'telegram') ? 'categories' then raise exception 'Website categories leaked into bot report';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',staff_sid,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now()))))::text,true);
 begin perform public.store_analytics_summary(7,'website');raise exception 'Manager obtained website report';exception when insufficient_privilege then null;end;
 begin perform store_private.website_analytics_report(7);raise exception 'Manager obtained private report';exception when insufficient_privilege then null;end;
 if exists(select 1 from store_private.analytics_events) then raise exception 'Manager bypassed event RLS';end if;
 reset role;
 if has_function_privilege('anon','public.store_analytics_summary(integer,text)','EXECUTE') or has_function_privilege('anon','store_private.website_analytics_report(integer)','EXECUTE') then raise exception 'Anonymous report grant';end if;
 set local role anon;
 begin perform public.store_analytics_gateway_ingest_attributed(repeat('0',64),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'visit',null,null,repeat('a',64),'website','direct',null);raise exception 'Gateway accepted invalid secret';exception when insufficient_privilege then null;end;
 reset role;
end; $$;
rollback;
select 'PASS website aggregates, daily/category/source reconciliation, owner-only access and gateway secret protection; all fixtures rolled back' as result;
