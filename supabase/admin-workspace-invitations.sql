begin;
create table store_private.workspace_invite_attempts(id bigint generated always as identity primary key,actor_id uuid not null,attempted_at timestamptz not null default now());
alter table store_private.workspace_invite_attempts enable row level security;
revoke all on store_private.workspace_invite_attempts from public,anon,authenticated,service_role;
revoke all on sequence store_private.workspace_invite_attempts_id_seq from public,anon,authenticated,service_role;
create index workspace_invite_attempts_time_idx on store_private.workspace_invite_attempts(attempted_at);
create function store_private.prepare_workspace_invite(p_email text,p_name text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform store_private.require_workspace_admin(true);
 if p_email is null or char_length(p_email)>320 or btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Укажите корректные email и имя';end if;
 if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email))) then raise exception 'Аккаунт уже существует. Используйте «Добавить существующий аккаунт» или восстановление пароля.';end if;
 perform pg_advisory_xact_lock(840120261012::bigint);
 if (select count(*) from store_private.workspace_invite_attempts where attempted_at>now()-interval '1 hour')>=10 then raise exception 'Лимит приглашений: 10 в час. Попробуйте позже.';end if;
 insert into store_private.workspace_invite_attempts(actor_id) values(auth.uid());
 return true;
end $$;
create function public.store_prepare_workspace_invite(p_email text,p_name text) returns boolean language sql security invoker set search_path='' as $$ select store_private.prepare_workspace_invite(p_email,p_name); $$;
revoke all on function store_private.prepare_workspace_invite(text,text) from public,anon,authenticated,service_role;
revoke all on function public.store_prepare_workspace_invite(text,text) from public,anon,authenticated,service_role;
grant execute on function store_private.prepare_workspace_invite(text,text),public.store_prepare_workspace_invite(text,text) to authenticated;
-- A server-issued email invitation can be approved before it is accepted.
-- Supabase still requires the recipient to redeem the email link before login.
create or replace function store_private.add_workspace_admin(p_email text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform store_private.require_workspace_admin(true);
 if p_email is null or char_length(p_email)>320 or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Укажите email и имя администратора';end if;
 select id into target from auth.users where lower(email)=lower(btrim(p_email)) and (email_confirmed_at is not null or invited_at is not null) and deleted_at is null and (banned_until is null or banned_until<now());
 if target is null then raise exception 'Сначала отправьте сотруднику приглашение или попросите подтвердить его почту';end if;
 if exists(select 1 from public.store_admins where user_id=target) then raise exception 'У этого аккаунта уже есть доступ';end if;
 insert into public.store_admins(user_id,display_name,access_role) values(target,btrim(p_name),'admin');
 return store_private.workspace_team();
end $$;
commit;
