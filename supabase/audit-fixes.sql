begin;
-- Retire the unused enrollment path without deleting invitations or owner membership.
drop policy if exists "Auth enrolls verified invited admins" on public.store_admins;
drop function if exists store_private.enroll_verified_store_admin();
revoke all on store_private.admin_invitations from public,anon,authenticated,supabase_auth_admin;

create or replace function store_private.own_admin_security_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 return jsonb_build_object('paused',exists(select 1 from store_private.admin_mfa_pauses where user_id=auth.uid()));
end;$$;
revoke all on function store_private.own_admin_security_status() from public,anon;
grant execute on function store_private.own_admin_security_status() to authenticated;
create or replace function public.store_admin_security_status() returns jsonb language sql security invoker set search_path='' as $$select store_private.own_admin_security_status();$$;
revoke all on function public.store_admin_security_status() from public,anon;
grant execute on function public.store_admin_security_status() to authenticated;

create or replace function store_private.enforce_own_admin_mfa() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' or not exists(select 1 from public.store_admins where user_id=auth.uid()) or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') then raise exception 'Verified administrator MFA required' using errcode='42501';end if;
 insert into store_private.admin_mfa_enforcement(user_id) values(auth.uid()) on conflict do nothing;
 delete from store_private.admin_mfa_pauses where user_id=auth.uid();
 return true;
end;$$;

create or replace function store_private.valid_product_photos(value jsonb) returns boolean
language plpgsql immutable strict set search_path='' as $$
declare photo jsonb;
begin
 if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>20 then return false;end if;
 for photo in select * from jsonb_array_elements(value) loop
  if jsonb_typeof(photo)<>'string' or length(photo #>> '{}')>2048 or not coalesce(store_private.valid_product_image(photo #>> '{}'),false) then return false;end if;
 end loop;
 return true;
end;$$;


-- No first-factor grace period: only AAL2 or the existing explicit recovery pause.
create or replace function store_private.admin_mfa_satisfied() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  (auth.jwt()->>'aal')='aal2'
  or exists(select 1 from store_private.admin_mfa_pauses p join public.store_admins a on a.user_id=p.user_id where p.user_id=auth.uid())
 );
$$;

-- Separate analytics secret; never returned to the browser or committed as a value.
create table if not exists store_private.analytics_secret(singleton boolean primary key default true check(singleton),seed bytea not null);
alter table store_private.analytics_secret enable row level security;
revoke all on store_private.analytics_secret from public,anon,authenticated;
grant select on store_private.analytics_secret to service_role;
insert into store_private.analytics_secret(singleton,seed) values(true,extensions.gen_random_bytes(32)) on conflict do nothing;
create or replace function public.store_analytics_daily_salt() returns text language sql security invoker set search_path='' as $$
 select encode(extensions.hmac(convert_to(current_date::text,'UTF8'),seed,'sha256'),'hex') from store_private.analytics_secret where singleton;
$$;
revoke all on function public.store_analytics_daily_salt() from public,anon,authenticated;
grant execute on function public.store_analytics_daily_salt() to service_role;
create or replace function public.store_analytics_ingest(p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,p_product bigint,p_page text,p_fingerprint text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;k text;new_session boolean;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open') or p_visitor is null or p_session is null or p_event_id is null or length(p_fingerprint)<>64 then return false;end if;
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return true;end if;
 foreach k in array array['global:minute','global:day:'||current_date::text,'ip:'||p_fingerprint,'visitor:'||p_visitor::text] loop
  insert into store_private.analytics_limits as l(key,window_at,hits) values(k,case when k like 'global:day:%' then date_trunc('day',now()) else date_trunc('minute',now()) end,1)
  on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
  if n>(case when k='global:minute' then 120 when k like 'global:day:%' then 10000 else 30 end) then return false;end if;
 end loop;
 new_session:=not exists(select 1 from store_private.analytics_sessions where session_id=p_session);
 if new_session then
  foreach k in array array['sessions:global','sessions:ip:'||p_fingerprint] loop
   insert into store_private.analytics_limits as l(key,window_at,hits) values(k,date_trunc('minute',now()),1)
   on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
   if n>(case when k='sessions:global' then 20 else 5 end) then return false;end if;
  end loop;
 end if;
 insert into store_private.analytics_sessions as s(session_id,visitor_id) values(p_session,p_visitor) on conflict(session_id) do update set last_seen=now() where s.visitor_id=excluded.visitor_id;
 if not found then return false;end if;
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page) on conflict(event_id) do nothing;end if;
 -- Bounded retention; cleanup on a small fraction of traffic.
 if random()<0.01 then
  delete from store_private.analytics_limits where window_at<now()-interval '1 day';
  delete from store_private.analytics_events where created_at<now()-interval '90 days';
  delete from store_private.analytics_sessions where last_seen<now()-interval '90 days';
 end if;
 return true;
end; $$;
revoke all on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text) to service_role;

notify pgrst,'reload schema';
commit;
