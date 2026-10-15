-- Synthetic identities only. Every fixture and financial change is rolled back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();
 owner_sid uuid:=gen_random_uuid();staff_sid uuid:=gen_random_uuid();other_sid uuid:=gen_random_uuid();
 p1 bigint;p2 bigint;sale1 bigint;sale2 bigint;entry1 uuid;entry2 uuid;order1 uuid:=gen_random_uuid();order2 uuid:=gen_random_uuid();
 r jsonb;summary jsonb;rev bigint;refused boolean;before_count bigint;i integer;
begin
 insert into auth.users(id,email,email_confirmed_at) values(owner_id,owner_id||'@example.invalid',now()),(staff_id,staff_id||'@example.invalid',now()),(other_id,other_id||'@example.invalid',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_sid,owner_id,now(),now()),(staff_sid,staff_id,now(),now()),(other_sid,other_id,now(),now());
 insert into public.store_admins(user_id,display_name,access_role) values(owner_id,'Finance probe owner','owner'),(staff_id,'Finance probe staff','admin');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender,on_commission,stock_quantities)
 values('Gucci','Finance probe commission','Сумки',1000,'EUR','One Size','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex',true,'{"One Size":2}') returning id into p1;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender,on_commission,stock_quantities)
 values('Gucci','Finance probe own','Сумки',1000,'EUR','One Size','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'on_order','unisex',false,'{"One Size":1}') returning id into p2;
 perform public.store_save_commission_terms(p1,0,'Owner <script>fixture</script>',700);
 begin perform public.store_save_commission_terms(p1,0,'Stale',800);raise exception 'Stale terms accepted';exception when serialization_failure then null;end;
 select revision into rev from public.products where id=p1;
 r:=public.store_record_product_sale(gen_random_uuid(),p1,rev,date '2001-01-15',2000,'One Size',2);sale1:=(r->>'sale_id')::bigint;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','all',null);
 select (value->>'id')::uuid into entry1 from jsonb_array_elements(r->'rows') where (value->>'sale_id')::bigint=sale1;
 if entry1 is null then raise exception 'Sale did not create finance entry';end if;
 select value into r from jsonb_array_elements(r->'rows') where value->>'id'=entry1::text;
 if r->>'owner_due'<>'1400' or r->>'owner_ref'<>'Owner <script>fixture</script>' or r->>'received' is not null or r->>'margin' is not null then raise exception 'Payout snapshot or missing-data semantics failed: %',r;end if;
 perform public.store_save_finance_entry(entry1,1,'{"received":2000,"expenses":100,"owner_paid":500}');
 begin perform public.store_save_finance_entry(entry1,1,'{"expenses":999}');raise exception 'Stale finance update accepted';exception when serialization_failure then null;end;
 refused:=false;begin perform public.store_save_finance_entry(entry1,2,'{"amount":5}');exception when others then refused:=true;end;if not refused then raise exception 'Source sale amount editable';end if;
 refused:=false;begin perform public.store_save_finance_entry(entry1,2,'{"received":2001}');exception when check_violation then refused:=true;end;if not refused then raise exception 'Overpayment accepted';end if;
 refused:=false;begin perform public.store_save_finance_entry(entry1,2,'{"expenses":1.5}');exception when check_violation then refused:=true;end;if not refused then raise exception 'Fractional amount accepted';end if;
 refused:=false;begin perform public.store_save_finance_entry(entry1,2,'{"expenses":"NaN"}');exception when check_violation then refused:=true;end;if not refused then raise exception 'NaN accepted';end if;
 -- An order's deposit is tracked without calling it revenue.
 perform public.store_save_finance_entry(order1,0,jsonb_build_object('product_id',p2,'product_label','Finance probe customer order','opened_on','2001-01-10','quantity',1,'amount',1000,'received',300,'purchase_cost',600,'expenses',50,'client_ref','Private fixture'));
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','all',null);summary:=r->'summary';
 if summary->>'gross'<>'2000' or summary->>'profit_known'<>'500' or summary->>'active_amount'<>'1000' or summary->>'received'<>'2300' or summary->>'receivable'<>'700' or summary->>'owner_unpaid'<>'900' then raise exception 'Incorrect sales/deposit/payout summary: %',summary;end if;
 select revision into rev from public.products where id=p2;
 r:=public.store_record_product_sale(gen_random_uuid(),p2,rev,date '2001-01-16',1000,'One Size',1);sale2:=(r->>'sale_id')::bigint;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','all',null);
 select (value->>'id')::uuid into entry2 from jsonb_array_elements(r->'rows') where (value->>'sale_id')::bigint=sale2;
 perform public.store_link_finance_order(order1,entry2,1,1);
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','all',null);summary:=r->'summary';
 if summary->>'gross'<>'3000' or summary->>'profit_known'<>'850' or summary->>'active_count'<>'0' or summary->>'received'<>'2300' or summary->>'receivable'<>'700' or jsonb_array_length(r->'rows')<>2 then raise exception 'Order/sale merge double-counted: %',summary;end if;
 refused:=false;begin perform public.store_save_finance_entry(order1,2,'{"received":400}');exception when others then refused:=true;end;if not refused then raise exception 'Merged order edited separately';end if;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','orders',null);if jsonb_array_length(r->'rows')<>1 then raise exception 'Order filter failed';end if;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','commission',null);if jsonb_array_length(r->'rows')<>1 then raise exception 'Commission filter failed';end if;
 -- A catalogue edit or removal cannot rewrite a historical financial classification.
 update public.products set on_commission=false where id=p1;
 delete from public.products where id=p1;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','commission',null);if jsonb_array_length(r->'rows')<>1 then raise exception 'Deleting card changed historical commission';end if;
 perform public.store_void_product_sale(sale1,null,'Finance fixture return');
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','all',null);summary:=r->'summary';
 if summary->>'gross'<>'1000' or summary->>'profit_known'<>'350' or summary->>'refund_due'<>'2000' or summary->>'cancelled_count'<>'1' then raise exception 'Voided sale inflated revenue or hid refund: %',summary;end if;
 perform public.store_save_finance_entry(entry1,3,'{"received":0}');
 for i in 1..25 loop perform public.store_save_finance_entry(entry1,3+i,jsonb_build_object('note','History event '||i));end loop;
 r:=public.store_finance_history(entry1);if jsonb_array_length(r)<>20 or r->0->'after_data'->>'note'<>'History event 25' or r->19->'after_data'->>'note'<>'History event 6' then raise exception 'Financial audit page not ordered numerically: %',r;end if;
 -- Independent order with known zero expense, then negative profit, is legitimate.
 perform public.store_save_finance_entry(order2,0,'{"product_label":"Finance probe loss","opened_on":"2001-01-12","status":"completed","completed_on":"2001-02-01","quantity":1,"amount":100,"received":0,"purchase_cost":120,"expenses":0}');
 r:=public.store_finance_report(date '2001-02-01',date '2001-02-01','all',null);if r->'summary'->>'profit_known'<>'-20' then raise exception 'Loss or date boundary lost';end if;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31','all',entry1);if jsonb_array_length(r->'rows')<>0 then raise exception 'Cursor repeated an entry';end if;
 reset role;
 if has_function_privilege('anon','public.store_finance_report(date,date,text,uuid)','execute') or has_table_privilege('authenticated','store_private.finance_entries','select') or has_table_privilege('authenticated','store_private.commission_terms','update') then raise exception 'Private finance data exposed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',staff_sid)::text,true);
 set local role authenticated;
 begin perform public.store_finance_report(date '2001-01-01',date '2001-01-31');raise exception 'Staff read private finance';exception when insufficient_privilege then null;end;
 begin perform public.store_save_finance_entry(gen_random_uuid(),0,'{}');raise exception 'Staff wrote finance';exception when insufficient_privilege then null;end;
 begin perform public.store_finance_history(entry1);raise exception 'Staff read financial audit';exception when insufficient_privilege then null;end;
 begin perform public.store_finance_commission();raise exception 'Staff read commission terms';exception when insufficient_privilege then null;end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated','aal','aal2','session_id',other_sid)::text,true);
 set local role authenticated;
 begin perform public.store_finance_sale_choices();raise exception 'Unapproved user read finance';exception when insufficient_privilege then null;end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1','session_id',owner_sid)::text,true);
 set local role authenticated;
 begin perform public.store_finance_report(date '2001-01-01',date '2001-01-31');raise exception 'No MFA read finance';exception when insufficient_privilege then null;end;
 reset role;
 update auth.sessions set created_at=now()-interval '30 days' where id=owner_sid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 begin perform public.store_finance_report(date '2001-01-01',date '2001-01-31');raise exception 'Expired session read finance';exception when insufficient_privilege then null;end;
 reset role;
end $$;
rollback;
select 'PASS: real sale trigger, commission snapshot and quantities, unknown costs, deposits, source immutability, revision conflicts, invalid money, order linking without duplication, dates, loss, cancellation/refund, deleted products, history, owner-only access, MFA and session expiry; all fixtures rolled back' as verification;
