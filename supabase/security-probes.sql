begin;
do $$
declare owner uuid; fixture bigint; affected integer; logged integer;
begin
 select user_id into owner from public.store_admins limit 1;
 if owner is null then raise exception 'No owner available for safe probe'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated','aal','aal1')::text,true);
 execute 'set local role authenticated';
 insert into public.products(brand,name,category,currency,price,image_url,photos,available,creation_key)
 values('Security probe','Temporary rollback fixture','Аксессуары','EUR',null,
 'https://juliproz-store.vercel.app/images/security-probe.webp','[]',false,gen_random_uuid()) returning id into fixture;
 begin update public.products set name=repeat('x',251) where id=fixture; raise exception 'Overlong name accepted'; exception when check_violation then null; end;
 begin update public.products set brand=' ' where id=fixture; raise exception 'Empty brand accepted'; exception when check_violation then null; end;
 begin update public.products set currency=null where id=fixture; raise exception 'Null currency accepted'; exception when check_violation then null; end;
 begin update public.products set price='NaN'::numeric where id=fixture; raise exception 'NaN accepted'; exception when check_violation then null; end;
 begin update public.products set price='Infinity'::numeric where id=fixture; raise exception 'Infinity accepted'; exception when check_violation then null; end;
 begin update public.products set photos=(select jsonb_agg('https://juliproz-store.vercel.app/images/test.webp'::text) from generate_series(1,21)) where id=fixture; raise exception '21 photos accepted'; exception when check_violation then null; end;
 update public.products set name='Changed rollback fixture' where id=fixture;
 begin perform count(*) from store_private.store_change_log; raise exception 'Browser can read audit log'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 select count(*) into logged from store_private.store_change_log where entity='products' and record_id=fixture::text and actor_id=owner;
 if logged<>2 then raise exception 'Expected 2 audit records, got %',logged; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
 execute 'set local role authenticated';
 update public.products set name='Unauthorized' where id=fixture;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Nonadmin changed product'; end if;
 begin insert into public.store_admins(user_id) values('00000000-0000-4000-8000-000000000001'); raise exception 'Self enrollment accepted'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.products where id=fixture) then raise exception 'Nonadmin read hidden product'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 execute 'set local role anon';
 if exists(select 1 from public.products where id=fixture) then raise exception 'Anonymous read hidden product'; end if;
 begin update public.products set name='Anonymous write' where id=fixture; raise exception 'Anonymous update accepted'; exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
select 'PASS: owner valid writes, hidden row isolation, six invalid payloads rejected, private audit and anonymous/nonadmin write denial; all fixture changes rolled back' as verification;
rollback;

