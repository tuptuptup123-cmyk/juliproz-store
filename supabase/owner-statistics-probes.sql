-- Synthetic users and records only. No real account is impersonated; all writes roll back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();
 owner_sid uuid:=gen_random_uuid();staff_sid uuid:=gen_random_uuid();visitor uuid:=gen_random_uuid();
 event_id uuid:=gen_random_uuid();visit_sid uuid:=gen_random_uuid();p bigint;rev bigint;r jsonb;statement text;
 calls text[]:=array[
  'select public.store_analytics_summary(1)',
  'select public.store_analytics_summary(1,''website'')',
  'select public.store_analytics_summary(1,''telegram'')',
  'select public.store_analytics_summary(1,''legacy'')',
  'select public.store_product_wishlist_counts(30)',
  'select public.store_analytics_health()',
  'select public.store_bot_health()',
  'select public.store_analytics_retention_health()',
  'select public.store_operational_health()',
  'select public.store_finance_report(current_date,current_date)',
  'select public.store_finance_commission()',
  'select public.store_finance_sale_choices(''synthetic statistics probe'')',
  'select public.store_finance_history(gen_random_uuid())'
 ];
begin
 insert into auth.users(id,email,email_confirmed_at) values(owner_id,owner_id||'@example.invalid',now()),(staff_id,staff_id||'@example.invalid',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_sid,owner_id,now(),now()),(staff_sid,staff_id,now(),now());
 insert into public.store_admins(user_id,display_name,access_role) values(owner_id,'Statistics probe owner','owner'),(staff_id,'Statistics probe manager','admin');
 insert into store_private.analytics_sessions(session_id,visitor_id,channel) values(visit_sid,visitor,'website');
 insert into store_private.analytics_events(event_id,visitor_id,session_id,event,channel) values(event_id,visitor,visit_sid,'visit','website');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',staff_sid,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now()))))::text,true);
 set local role authenticated;
 foreach statement in array calls loop
  begin execute statement;raise exception 'Manager obtained statistics: %',statement;exception when insufficient_privilege then null;end;
 end loop;
 if store_private.statistics_owner() or exists(select 1 from store_private.analytics_events) or exists(select 1 from store_private.analytics_sessions) then raise exception 'Manager bypassed analytics RLS';end if;
 begin perform 1 from store_private.finance_entries;raise exception 'Direct financial read';exception when insufficient_privilege then null;end;
 -- Inventory and recording an actual sale remain part of the manager's work.
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender,stock_quantities)
 values('Test','Statistics permission probe','Обувь',300,'EUR','40','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex','{"40":2}') returning id,revision into p,rev;
 r:=public.store_record_product_sale(gen_random_uuid(),p,rev,date '2001-01-15',250,'40',1);
 if r->'product' ?| array['purchase_cost','purchase_per_unit','expenses_per_unit'] then raise exception 'Sale response leaked private costs';end if;
 begin perform public.store_product_finance(p);raise exception 'Manager read product finances';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now()))))::text,true);
 if not store_private.statistics_owner() then raise exception 'Owner denied';end if;
 foreach statement in array calls loop execute statement;end loop;
 perform public.store_product_finance(p);
 if not exists(select 1 from store_private.analytics_sessions where session_id=visit_sid) then raise exception 'Owner cannot read analytics';end if;
 -- Owner statistics do not demand a fresh step-up every 15 minutes; finance still does.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())-3600)))::text,true);
 perform public.store_analytics_summary(1);
 begin perform public.store_finance_report(current_date,current_date);raise exception 'Finance step-up bypass';exception when sqlstate 'PT403' then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1','session_id',owner_sid)::text,true);
 begin perform public.store_analytics_summary(1);raise exception 'MFA bypass';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_sid)::text,true);
 if store_private.statistics_owner() is distinct from false then raise exception 'Missing MFA claim not denied';end if;
 foreach statement in array calls[1:9] loop
  begin execute statement;raise exception 'Missing MFA accepted: %',statement;exception when insufficient_privilege then null;end;
 end loop;
 reset role;
 update public.store_admins set access_role='admin' where user_id=owner_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 begin perform public.store_analytics_summary(1);raise exception 'Stale owner role accepted';exception when insufficient_privilege then null;end;
 reset role;
 update public.store_admins set access_role='owner' where user_id=owner_id;
 delete from auth.sessions where id=owner_sid;
 set local role authenticated;
 begin perform public.store_analytics_summary(1);raise exception 'Revoked session accepted';exception when insufficient_privilege then null;end;
 reset role;
 if has_function_privilege('anon','store_private.statistics_owner()','execute') or has_function_privilege('anon','public.store_analytics_summary(integer,text)','execute') then raise exception 'Anonymous grants';end if;
end $$;
select 'PASS: owner reports, manager RPC/RLS denials, private finance, manager inventory/sales, MFA, fresh role, revoked session and anonymous grants' as result;
rollback;
