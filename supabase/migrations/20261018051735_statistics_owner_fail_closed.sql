-- A malformed/missing MFA claim must fail closed, including SECURITY DEFINER health reports.
create or replace function store_private.statistics_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(store_private.admin_mfa_satisfied(),false) and exists(
  select 1 from public.store_admins where user_id=auth.uid() and access_role='owner'
 )
$$;
revoke all on function store_private.statistics_owner() from public,anon,authenticated,service_role;
grant execute on function store_private.statistics_owner() to authenticated;
