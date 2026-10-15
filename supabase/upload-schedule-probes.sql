-- All synthetic accounts, cards and schedule edits are rolled back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
 owner_sid uuid:=gen_random_uuid(); staff_sid uuid:=gen_random_uuid(); other_sid uuid:=gen_random_uuid();
 today date:=(now() at time zone 'Europe/Kyiv')::date; initial_revision bigint; result jsonb; row_data jsonb;
 p1 bigint; p2 bigint; p3 bigint; p4 bigint; n integer; refused boolean;
begin
 insert into auth.users(id,email,email_confirmed_at) values(owner_id,owner_id||'@example.invalid',now()),(staff_id,staff_id||'@example.invalid',now()),(other_id,other_id||'@example.invalid',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_sid,owner_id,now(),now()),(staff_sid,staff_id,now(),now()),(other_sid,other_id,now(),now());
 insert into public.store_admins(user_id,display_name,access_role) values(owner_id,'Schedule probe owner','owner'),(staff_id,'Schedule probe staff','admin');
 select coalesce((select revision from store_private.upload_rotations where starts_on=today),0) into initial_revision;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 perform public.store_save_upload_rotation(today,array[staff_id,owner_id],initial_revision);
 result:=public.store_upload_schedule(today);
 select value into row_data from jsonb_array_elements(result->'days') where value->>'day'=today::text;
 if row_data->>'manager_id'<>staff_id::text or (row_data->>'target')::int<>10 then raise exception 'Incorrect initial duty'; end if;
 perform public.store_save_upload_day(today,owner_id,'Temporary replacement',0,false);
 begin perform public.store_save_upload_day(today,staff_id,'Stale update',0,false);raise exception 'Stale override overwrote newer duty';exception when serialization_failure then null;end;
 perform public.store_save_upload_day(today,null,'',1,true);
 -- Future rotation must not change today or the original order before its start.
 perform public.store_save_upload_rotation(today+7,array[owner_id,staff_id],0);
 result:=public.store_upload_schedule(today);
 select value into row_data from jsonb_array_elements(result->'days') where value->>'day'=today::text;
 if row_data->>'manager_id'<>staff_id::text then raise exception 'Future rotation rewrote history';end if;
 refused:=false;begin perform public.store_save_upload_rotation(today-1,array[staff_id],0);exception when others then refused:=true;end;if not refused then raise exception 'Past rotation accepted';end if;
 refused:=false;begin perform public.store_save_upload_rotation(today+1,array[staff_id,staff_id],0);exception when others then refused:=true;end;if not refused then raise exception 'Duplicate managers accepted';end if;
 refused:=false;begin perform public.store_save_upload_rotation(today+1,array[other_id],0);exception when others then refused:=true;end;if not refused then raise exception 'Unapproved manager accepted';end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',staff_sid)::text,true);
 set local role authenticated;
 perform public.store_upload_schedule(today);
 begin perform public.store_save_upload_day(today,staff_id,'Forged assignment',0,false);raise exception 'Staff changed schedule';exception when insufficient_privilege then null;end;
 begin perform public.store_save_upload_rotation(today,array[staff_id],initial_revision+1);raise exception 'Staff changed rotation';exception when insufficient_privilege then null;end;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender)
 values('Gucci','Schedule probe one','Сумки',100,'EUR','One Size','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex') returning id into p1;
 update public.products set name='Schedule probe edited',available=false,archive_status='hidden' where id=p1;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender)
 values('Gucci','Schedule probe delete','Сумки',100,'EUR','One Size','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex') returning id into p2;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender)
 values('Gucci','Schedule probe before midnight','Сумки',100,'EUR','One Size','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex') returning id into p3;
 insert into public.products(brand,name,category,price,currency,size,image_url,photos,available,fulfillment_status,gender)
 values('Gucci','Schedule probe next midnight','Сумки',100,'EUR','One Size','https://juliproz-store.vercel.app/images/test.webp','["https://juliproz-store.vercel.app/images/test.webp"]',true,'in_stock','unisex') returning id into p4;
 reset role;
 update store_private.store_change_log set changed_at=(today::timestamp at time zone 'Europe/Kyiv')-interval '1 millisecond' where entity='products' and operation='INSERT' and record_id=p3::text;
 update store_private.store_change_log set changed_at=(today+1)::timestamp at time zone 'Europe/Kyiv' where entity='products' and operation='INSERT' and record_id=p4::text;
 -- Duplicate ingestion of an insert must not count the same card twice.
 insert into store_private.store_change_log(actor_id,actor_label,actor_role,entity,operation,record_id,after_row)
 select actor_id,actor_label,actor_role,entity,operation,record_id,after_row from store_private.store_change_log where entity='products' and operation='INSERT' and record_id=p1::text order by id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',owner_sid)::text,true);
 set local role authenticated;
 delete from public.products where id=p2;
 result:=public.store_upload_schedule(today);
 select value into row_data from jsonb_array_elements(result->'days') where value->>'day'=today::text;
 if (row_data->>'uploaded')::int<>1 or (row_data->>'deleted_count')::int<>1 then raise exception 'Wrong count after edit, hiding, duplicate insert or deletion: %',row_data;end if;
 result:=public.store_upload_items(today,staff_id,null);
 if jsonb_array_length(result)<>2 then raise exception 'Wrong daily items or midnight boundary';end if;
 if exists(select 1 from jsonb_array_elements(result) v where v->>'actor_id'<>staff_id::text) then raise exception 'Incorrect attribution';end if;
 result:=public.store_upload_items(today,staff_id,(result->1->>'id')::bigint);
 if jsonb_array_length(result)<>0 then raise exception 'Pagination repeats entries';end if;
 reset role;
 if extract(epoch from (((date '2026-10-26')::timestamp at time zone 'Europe/Kyiv')-((date '2026-10-25')::timestamp at time zone 'Europe/Kyiv')))<>90000 then raise exception 'Expected Kyiv DST boundary';end if;
 if has_function_privilege('anon','public.store_upload_schedule(date)','execute') or has_table_privilege('authenticated','store_private.upload_rotations','select') or has_table_privilege('authenticated','store_private.upload_day_overrides','update') then raise exception 'Schedule is directly exposed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated','aal','aal2','session_id',other_sid)::text,true);
 set local role authenticated;
 begin perform public.store_upload_schedule(today);raise exception 'Unapproved user read schedule';exception when insufficient_privilege then null;end;
 begin perform public.store_upload_items(today,null,null);raise exception 'Unapproved user read upload history';exception when insufficient_privilege then null;end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal1','session_id',staff_sid)::text,true);
 set local role authenticated;
 begin perform public.store_upload_schedule(today);raise exception 'Missing MFA accepted';exception when insufficient_privilege then null;end;
 reset role;
 update auth.sessions set created_at=now()-interval '30 days' where id=staff_sid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',staff_sid)::text,true);
 set local role authenticated;
 begin perform public.store_upload_schedule(today);raise exception 'Expired session read schedule';exception when insufficient_privilege then null;end;
 reset role;
end $$;
rollback;
select 'PASS: rotation, day replacement, conflicts, preserved history, audited attribution, no edit/duplicate inflation, deleted cards, Kyiv midnight, DST, private access and expired sessions; all fixtures rolled back' as verification;
