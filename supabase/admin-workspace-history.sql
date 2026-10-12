-- Additive upgrade. The existing private history and memberships are preserved.
begin;
alter table public.store_admins add column display_name text not null default '' check(char_length(display_name)<=100);
alter table public.store_admins add column access_role text not null default 'admin' check(access_role in ('owner','admin'));
-- Bootstrap only an unambiguous, already-authorized sole administrator.
do $$ begin
 if (select count(*) from public.store_admins)<>1 then raise exception 'Owner must be selected explicitly when multiple administrators exist'; end if;
 update public.store_admins set access_role='owner';
end $$;
alter table public.product_admin_notes add column location text not null default '' check(char_length(location)<=500);
alter table public.product_admin_notes add column custodian text not null default '' check(char_length(custodian)<=500);
alter table store_private.store_change_log add column actor_label text;
create index store_change_log_entity_record_id_idx on store_private.store_change_log(entity,record_id,id desc);
create index store_change_log_actor_id_idx on store_private.store_change_log(actor_id,id desc);

create or replace function store_private.log_store_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); before_data jsonb; after_data jsonb; label text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('products','store_admins','product_admin_notes') or tg_when<>'AFTER' then raise exception 'Unexpected audit trigger target'; end if;
 if actor is null and current_setting('role',true)='authenticated' then raise exception 'Authenticated actor is required' using errcode='42501'; end if;
 if tg_op<>'INSERT' then before_data:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_data:=to_jsonb(new); end if;
 if tg_op='UPDATE' and (before_data-'revision')=(after_data-'revision') then return new; end if;
 if actor is not null then
  select coalesce(nullif(a.display_name,''),u.email,actor::text) into label from auth.users u left join public.store_admins a on a.user_id=u.id where u.id=actor;
 end if;
 insert into store_private.store_change_log(actor_id,actor_label,actor_role,entity,operation,record_id,before_row,after_row)
 values(actor,coalesce(label,case when actor is null then 'Системное изменение' else actor::text end),coalesce(auth.jwt()->>'role',session_user::text),tg_table_name,tg_op,
 coalesce(after_data->>'id',before_data->>'id',after_data->>'user_id',before_data->>'user_id',after_data->>'product_id',before_data->>'product_id'),before_data,after_data);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function store_private.log_store_change() from public,anon,authenticated,service_role;
create trigger audit_internal_information after insert or update or delete on public.product_admin_notes for each row execute function store_private.log_store_change();

create function store_private.require_workspace_admin(owner_only boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.store_admins where user_id=auth.uid() and (not owner_only or access_role='owner')) or not store_private.admin_mfa_satisfied() then
  raise exception 'Доступ только для администраторов магазина' using errcode='42501';
 end if;
 if owner_only and (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'Для управления доступами подтвердите двухфакторную защиту в настройках' using errcode='42501'; end if;
end $$;
revoke all on function store_private.require_workspace_admin(boolean) from public,anon,authenticated,service_role;

create function store_private.workspace_team()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin();
 select jsonb_build_object('current_user_id',auth.uid(),'members',coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'email',u.email,'access_role',a.access_role) order by a.access_role desc,a.display_name,u.email),'[]'::jsonb)) into result from public.store_admins a join auth.users u on u.id=a.user_id;
 return result;
end $$;
create function public.store_workspace_team() returns jsonb language sql security invoker set search_path='' as $$ select store_private.workspace_team(); $$;

create function store_private.save_workspace_profile(p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform store_private.require_workspace_admin();
 if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Имя должно содержать от 1 до 100 символов'; end if;
 update public.store_admins set display_name=btrim(p_name) where user_id=auth.uid();
 return store_private.workspace_team();
end $$;
create function public.store_save_workspace_profile(p_name text) returns jsonb language sql security invoker set search_path='' as $$ select store_private.save_workspace_profile(p_name); $$;

create function store_private.add_workspace_admin(p_email text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform store_private.require_workspace_admin(true);
 if p_email is null or char_length(p_email)>320 or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Укажите email и имя администратора'; end if;
 select id into target from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<now());
 if target is null then raise exception 'Сотрудник должен сначала создать аккаунт и подтвердить свою почту'; end if;
 if exists(select 1 from public.store_admins where user_id=target) then raise exception 'У этого аккаунта уже есть доступ'; end if;
 insert into public.store_admins(user_id,display_name,access_role) values(target,btrim(p_name),'admin');
 return store_private.workspace_team();
end $$;
create function public.store_add_workspace_admin(p_email text,p_name text) returns jsonb language sql security invoker set search_path='' as $$ select store_private.add_workspace_admin(p_email,p_name); $$;

create function store_private.remove_workspace_admin(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform store_private.require_workspace_admin(true);
 if p_user_id=auth.uid() or exists(select 1 from public.store_admins where user_id=p_user_id and access_role='owner') then raise exception 'Доступ владельца нельзя отключить здесь'; end if;
 delete from public.store_admins where user_id=p_user_id and access_role='admin';
 -- Membership checks deny the revoked user even with an unexpired access token.
 return store_private.workspace_team();
end $$;
create function public.store_remove_workspace_admin(p_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select store_private.remove_workspace_admin(p_user_id); $$;

create function store_private.workspace_history(p_before bigint default null,p_product_id bigint default null,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin();
 select coalesce(jsonb_agg(row_data order by id desc),'[]'::jsonb) into result from (
 select l.id,jsonb_build_object('id',l.id::text,'changed_at',l.changed_at,'actor_id',l.actor_id,
 'actor_label',coalesce(l.actor_label,nullif(a.display_name,''),u.email,case when l.actor_id is null then 'Системное изменение' else l.actor_id::text end),
 'entity',l.entity,'operation',l.operation,'record_id',l.record_id,
 'product_label',case when l.entity='products' then concat_ws(' ',coalesce(l.after_row->>'brand',l.before_row->>'brand'),coalesce(l.after_row->>'name',l.before_row->>'name')) when l.entity='product_admin_notes' then (select concat_ws(' ',p.brand,p.name) from public.products p where p.id::text=l.record_id) else null end,
 'changes',(select coalesce(jsonb_object_agg(k,jsonb_build_object('before',l.before_row->k,'after',l.after_row->k)),'{}'::jsonb)
 from (select jsonb_object_keys(coalesce(l.before_row,'{}'::jsonb)) k union select jsonb_object_keys(coalesce(l.after_row,'{}'::jsonb))) keys
 where k not in ('revision','creation_key','created_at','id','product_id','user_id') and (l.before_row->k) is distinct from (l.after_row->k))) row_data
 from store_private.store_change_log l left join public.store_admins a on a.user_id=l.actor_id left join auth.users u on u.id=l.actor_id
 where (p_before is null or l.id<p_before) and (p_actor_id is null or l.actor_id=p_actor_id)
 and (p_product_id is null or (l.entity in ('products','product_admin_notes') and l.record_id=p_product_id::text))
 order by l.id desc limit 31) records;
 return result;
end $$;
create function public.store_workspace_history(p_before bigint default null,p_product_id bigint default null,p_actor_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select store_private.workspace_history(p_before,p_product_id,p_actor_id); $$;

-- Only guarded entry points are callable; underlying history remains completely private.
do $$ declare fn text; begin
 foreach fn in array array['workspace_team()','save_workspace_profile(text)','add_workspace_admin(text,text)','remove_workspace_admin(uuid)','workspace_history(bigint,bigint,uuid)'] loop
  execute 'revoke all on function store_private.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function store_private.'||fn||' to authenticated';
 end loop;
 foreach fn in array array['store_workspace_team()','store_save_workspace_profile(text)','store_add_workspace_admin(text,text)','store_remove_workspace_admin(uuid)','store_workspace_history(bigint,bigint,uuid)'] loop
  execute 'revoke all on function public.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function public.'||fn||' to authenticated';
 end loop;
end $$;
commit;
