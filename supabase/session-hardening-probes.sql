-- Run against the deployed guards; synthetic users and products always roll back.
begin;
do $$
declare actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); other_sid uuid:=gen_random_uuid(); fixture bigint; affected integer;
begin
 insert into auth.users(id,email,email_confirmed_at) values(actor,'session-probe-'||actor||'@example.invalid',now()),(other_actor,'session-probe-'||other_actor||'@example.invalid',now());
 insert into public.store_admins(user_id,display_name,access_role) values(actor,'Session probe','owner');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now()),(other_sid,other_actor,now(),now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2','session_id',sid)::text,true);
 set local role authenticated;
 if not store_private.admin_session_active() then raise exception 'Active session denied';end if;
 insert into public.products(brand,name,category,currency,image_url,photos,available,creation_key) values('Security probe','Session rollback fixture','Аксессуары','EUR','https://juliproz-store.vercel.app/images/security-probe.webp','[]',false,gen_random_uuid()) returning id into fixture;
 insert into public.product_admin_notes(product_id,note) values(fixture,'Private rollback fixture');
 perform public.store_workspace_history(null,fixture,null);
 -- A valid session for another user cannot be substituted.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2','session_id',other_sid)::text,true);
 if store_private.admin_session_active() then raise exception 'Cross-user session accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2')::text,true);
 if store_private.admin_session_active() then raise exception 'Missing session accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2','session_id',sid)::text,true);
 reset role;
 update auth.sessions set not_after=now()-interval '1 second' where id=sid;
 set local role authenticated;
 if store_private.admin_session_active() then raise exception 'Expired session accepted';end if;
 reset role;update auth.sessions set not_after=null where id=sid;
 update auth.users set banned_until=now()+interval '1 hour' where id=actor;
 set local role authenticated;
 if store_private.admin_session_active() then raise exception 'Banned user accepted';end if;
 reset role;update auth.users set banned_until=null where id=actor;
 -- Supabase signout deletes this row. The unchanged access-token claims must stop working.
 delete from auth.sessions where id=sid;
 set local role authenticated;
 if store_private.admin_mfa_satisfied() then raise exception 'Logged-out token passed MFA guard';end if;
 if exists(select 1 from public.products where id=fixture) then raise exception 'Logged-out token read hidden inventory';end if;
 if exists(select 1 from public.product_admin_notes where product_id=fixture) then raise exception 'Logged-out token read private notes';end if;
 if exists(select 1 from public.store_admins) then raise exception 'Logged-out token read membership';end if;
 update public.products set name='Forbidden edit' where id=fixture;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Logged-out token edited inventory';end if;
 begin perform public.store_workspace_history();raise exception 'Logged-out token read history';exception when insufficient_privilege then null;end;
 begin perform public.store_admin_security_status();raise exception 'Logged-out token read security status';exception when insufficient_privilege then null;end;
 begin perform public.enforce_store_mfa();raise exception 'Logged-out token changed MFA';exception when insufficient_privilege then null;end;
 reset role;
end $$;
select 'PASS: active session allowed; missing, cross-user, expired, banned and logged-out sessions denied; all fixtures rolled back' as verification;
rollback;
