-- Immediate denial after Supabase removes a logged-out session.
-- Does not remove sessions or change the existing owner MFA pause.
begin;
create or replace function store_private.admin_session_active()
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
    and (s.not_after is null or s.not_after>now())
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 );
$$;
revoke all on function store_private.admin_session_active() from public,anon,authenticated,service_role;
grant execute on function store_private.admin_session_active() to authenticated;

create or replace function store_private.admin_mfa_satisfied()
returns boolean language sql stable security definer set search_path='' as $$
 select store_private.admin_session_active() and auth.uid() is not null and
 ((auth.jwt()->>'aal')='aal2' or exists(
  select 1 from store_private.admin_mfa_pauses p join public.store_admins a on a.user_id=p.user_id where p.user_id=auth.uid()
 ));
$$;

create or replace function store_private.own_admin_security_status()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not store_private.admin_session_active() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then
  raise exception 'Active administrator session required' using errcode='42501';
 end if;
 return jsonb_build_object('paused',exists(select 1 from store_private.admin_mfa_pauses where user_id=auth.uid()));
end;
$$;

create or replace function store_private.enforce_own_admin_mfa()
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not store_private.admin_session_active() or (auth.jwt()->>'aal') is distinct from 'aal2'
 or not exists(select 1 from public.store_admins where user_id=auth.uid())
 or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') then
  raise exception 'Verified administrator MFA required' using errcode='42501';
 end if;
 insert into store_private.admin_mfa_enforcement(user_id) values(auth.uid()) on conflict do nothing;
 delete from store_private.admin_mfa_pauses where user_id=auth.uid();
 return true;
end;
$$;
drop policy if exists store_active_membership_session on public.store_admins;
create policy store_active_membership_session on public.store_admins as restrictive for select to authenticated
 using ((select store_private.admin_session_active()));
notify pgrst,'reload schema';
commit;
