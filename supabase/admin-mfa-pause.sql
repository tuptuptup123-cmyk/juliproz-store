-- Temporarily pause MFA for the owner's existing admin account.
-- Keep enrolled factors and membership policies intact.
-- Re-enable: delete this user's row from store_private.admin_mfa_pauses,
-- then remove mfaPausedUserId from config.js in the same release.
begin;
create table if not exists store_private.admin_mfa_pauses (
 user_id uuid primary key references public.store_admins(user_id) on delete cascade,
 paused_at timestamptz not null default now()
);
alter table store_private.admin_mfa_pauses enable row level security;
revoke all on store_private.admin_mfa_pauses from public, anon, authenticated;
insert into store_private.admin_mfa_pauses(user_id)
values ('f5a3ca3a-d730-451d-9759-7145325f29b7') on conflict do nothing;
create or replace function store_private.admin_mfa_satisfied()
returns boolean language sql stable security definer set search_path to ''
as $function$
 select auth.uid() is not null and (
  auth.jwt()->>'aal' = 'aal2'
  or exists (
   select 1 from store_private.admin_mfa_pauses p
   join public.store_admins a on a.user_id=p.user_id
   where p.user_id=auth.uid()
  )
  or (
   not exists(select 1 from store_private.admin_mfa_enforcement where user_id=auth.uid())
   and not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
  )
 );
$function$;
commit;
