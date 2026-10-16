-- Synthetic records only; never impersonate a real employee. Everything rolls back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();owner_sid uuid:=gen_random_uuid();staff_sid uuid:=gen_random_uuid();
 p bigint;rev bigint;sale1 bigint;sale2 bigint;e1 uuid;e2 uuid;r jsonb;s jsonb;operation uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,email_confirmed_at) values(owner_id,owner_id||'@example.invalid',now()),(staff_id,staff_id||'@example.invalid',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_sid,owner_id,now(),now()),(staff_sid,staff_id,now(),now());
 insert into public.store_admins(user_id,display_name,access_role) values(owner_id,'Product finance probe owner','owner'),(staff_id,'Product finance probe staff','admin');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender,on_commission,stock_quantities)
 values('CP Company','Product finance probe','Обувь',300,'EUR','40','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex',false,'{"40":4}') returning id into p;
 r:=public.store_product_finance(p);
 if r->'terms'->>'revision'<>'0' or r->'terms'->>'purchase_per_unit' is not null then raise exception 'Unknown cost became zero';end if;
 r:=public.store_save_product_costs(p,0,200,0);
 if r->>'revision'<>'1' then raise exception 'Cost not saved';end if;
 r:=public.store_save_product_costs(p,0,200,0);
 if r->>'revision'<>'1' then raise exception 'Identical retry duplicated cost';end if;
 begin perform public.store_save_product_costs(p,0,199,0);raise exception 'Stale update accepted';exception when serialization_failure then null;end;
 begin perform public.store_save_product_costs(p,1,-1,0);raise exception 'Negative accepted';exception when check_violation then null;end;
 begin perform public.store_save_product_costs(p,1,0.5,0);raise exception 'Fraction accepted';exception when check_violation then null;end;
 select revision into rev from public.products where id=p;
 -- Record a two-unit wholesale sale as an ordinary admin: totals remain private to owner.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',staff_sid)::text,true);
 r:=public.store_record_product_sale(operation,p,rev,date '2001-01-15',500,'40',2);sale1:=(r->>'sale_id')::bigint;
 if r->'product' ?| array['purchase_per_unit','purchase_cost','expenses_per_unit'] then raise exception 'Private cost leaked through sale response';end if;
 r:=public.store_record_product_sale(operation,p,rev,date '2001-01-15',500,'40',2);
 if (r->>'sale_id')::bigint<>sale1 then raise exception 'Sale duplicate';end if;
 begin perform public.store_product_finance(p);raise exception 'Staff read costs';exception when insufficient_privilege then null;end;
 begin perform public.store_save_product_costs(p,1,0,0);raise exception 'Staff wrote costs';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 r:=public.store_product_finance(p);s:=r->'rows'->0;e1:=(s->>'id')::uuid;
 if s->>'amount'<>'500' or s->>'purchase_cost'<>'400' or s->>'expenses'<>'0' or s->>'margin'<>'100' or r->'summary'->>'quantity'<>'2' then raise exception 'Wholesale calculation failed: %',r;end if;
 if (select price from public.products where id=p)<>300 then raise exception 'Public price changed';end if;
 perform public.store_save_product_costs(p,1,220,10);
 r:=public.store_product_finance(p);
 if r->'rows'->0->>'purchase_cost'<>'400' then raise exception 'Historical snapshot overwritten';end if;
 select revision into rev from public.products where id=p;
 r:=public.store_record_product_sale(gen_random_uuid(),p,rev,date '2001-01-16',210,'40',1);sale2:=(r->>'sale_id')::bigint;
 r:=public.store_product_finance(p);s:=r->'rows'->0;e2:=(s->>'id')::uuid;
 if s->>'purchase_cost'<>'220' or s->>'expenses'<>'10' or s->>'margin'<>'-20' then raise exception 'New cost/loss snapshot failed: %',s;end if;
 r:=public.store_finance_report(date '2001-01-01',date '2001-01-31');
 if r->'summary'->>'gross'<>'710' or r->'summary'->>'profit_known'<>'80' then raise exception 'Report does not use actual amounts: %',r->'summary';end if;
 -- Correct an old sale cost through the same financial entry; catalogue terms stay unchanged.
 perform public.store_save_finance_entry(e1,1,'{"purchase_cost":380,"expenses":0}');
 r:=public.store_product_finance(p);
 if r->'summary'->>'profit_known'<>'100' or r->'terms'->>'purchase_per_unit'<>'220' then raise exception 'Per-sale correction failed';end if;
 select revision into rev from public.products where id=p;
 perform public.store_void_product_sale(sale2,rev,'Synthetic return');
 r:=public.store_product_finance(p);
 if r->'summary'->>'amount'<>'500' or r->'summary'->>'quantity'<>'2' or jsonb_array_length(r->'rows')<>2 then raise exception 'Void not excluded or erased history';end if;
 perform public.store_save_product_costs(p,2,null,null);
 select revision into rev from public.products where id=p;
 perform public.store_record_product_sale(gen_random_uuid(),p,rev,date '2001-01-17',0,'40',1);
 r:=public.store_product_finance(p);
 if r->'rows'->0->>'purchase_cost' is not null or r->'summary'->>'profit_missing'<>'1' then raise exception 'Missing cost treated as zero';end if;
 -- MFA/session revocation and anonymous access must still be enforced.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1','session_id',owner_sid)::text,true);
 begin perform public.store_product_finance(p);raise exception 'MFA bypass';exception when insufficient_privilege then null;end;
 reset role;
 if has_table_privilege('anon','store_private.product_costs','select') or has_table_privilege('authenticated','store_private.product_costs','select') or has_table_privilege('authenticated','store_private.product_costs','update') or has_function_privilege('anon','public.store_product_finance(bigint,uuid)','execute') then raise exception 'Private grants leaked';end if;
 if not exists(select 1 from store_private.finance_changes where entity='product_costs' and record_id=p::text and before_data->>'purchase_per_unit'='200' and after_data->>'purchase_per_unit'='220') then raise exception 'Cost audit missing';end if;
 delete from auth.sessions where id=owner_sid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 begin perform public.store_product_finance(p);raise exception 'Revoked session accepted';exception when insufficient_privilege then null;end;
 reset role;
end $$;
select 'PASS: private product costs, wholesale totals, historical snapshots, real report income, loss, correction, cancellation, missing values, retry, stale edits, audit, roles, MFA and revoked session' as result;
rollback;
