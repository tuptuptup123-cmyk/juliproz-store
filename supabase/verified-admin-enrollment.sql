begin;
create schema if not exists store_private;
revoke all on schema store_private from public,anon,authenticated;
grant usage on schema store_private to supabase_auth_admin;
create table if not exists store_private.admin_invitations(email text primary key check(email=lower(email)));
alter table store_private.admin_invitations enable row level security;
revoke all on store_private.admin_invitations from public,anon,authenticated;
grant select on store_private.admin_invitations to supabase_auth_admin;
create policy "Auth reads admin invitations" on store_private.admin_invitations for select to supabase_auth_admin using(true);
grant insert on public.store_admins to supabase_auth_admin;
create policy "Auth enrolls verified invited admins" on public.store_admins for insert to supabase_auth_admin with check(exists(select 1 from auth.users u join store_private.admin_invitations i on lower(u.email)=i.email where u.id=store_admins.user_id and u.email_confirmed_at is not null));
create or replace function store_private.enroll_verified_store_admin() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(select 1 from store_private.admin_invitations where email=lower(new.email)) then
   insert into public.store_admins(user_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function store_private.enroll_verified_store_admin() from public,anon,authenticated;
grant execute on function store_private.enroll_verified_store_admin() to supabase_auth_admin;
create trigger enroll_verified_store_admin after insert or update of email,email_confirmed_at on auth.users for each row execute function store_private.enroll_verified_store_admin();
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
commit;
