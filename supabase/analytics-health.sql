begin;
create or replace function store_private.own_analytics_health() returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.store_admins where user_id=auth.uid()) or not store_private.admin_mfa_satisfied() then raise exception 'Admin access required' using errcode='42501';end if;
 return exists(select 1 from store_private.analytics_limits where
 (key='global:minute' and window_at=date_trunc('minute',now()) and hits>=120) or
 (key='global:day:'||current_date::text and window_at=date_trunc('day',now()) and hits>=10000) or
 (key='sessions:global' and window_at=date_trunc('minute',now()) and hits>=20));
end;$$;
revoke all on function store_private.own_analytics_health() from public,anon;
grant execute on function store_private.own_analytics_health() to authenticated;
create or replace function public.store_analytics_health() returns boolean language sql stable security invoker set search_path='' as $$select store_private.own_analytics_health();$$;
revoke all on function public.store_analytics_health() from public,anon;
grant execute on function public.store_analytics_health() to authenticated;
notify pgrst,'reload schema';
commit;
