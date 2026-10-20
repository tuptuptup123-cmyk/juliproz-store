-- Private account-bound partner workspace. No client table access.
create table store_private.partners (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (id ~ '^P[0-9]{2,6}$'),
 name text not null check (length(name) between 1 and 150),
 geography text not null default '',
 category text not null default '',
 facts text not null default '',
 contact text not null default '',
 source_url text not null check (source_url ~ '^https://'),
 priority text not null check (priority in ('A','B','C')),
 idea text not null default '',
 checked_on date not null,
 status text not null default 'Не связывались' check (status in ('Не связывались','На проверке','Связались','Переговоры','Тестовый заказ','Партнёр','Отказ','Отложено')),
 favorite boolean not null default false,
 notes text not null default '' check (length(notes)<=10000),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
alter table store_private.partners enable row level security;
revoke all on store_private.partners from public,anon,authenticated;

create function store_private.partner_list() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform store_private.require_workspace_admin();
 if not exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner') then
  raise exception 'Раздел доступен только владельцу' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(p)-'owner_id' order by p.priority,p.id) from store_private.partners p where p.owner_id=auth.uid()),'[]'::jsonb);
end $$;
create function store_private.partner_update(p_id text,p_revision bigint,p_status text,p_favorite boolean,p_notes text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin();
 if not exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner') then
  raise exception 'Раздел доступен только владельцу' using errcode='42501';
 end if;
 if p_id is null or p_revision is null or p_status is null or p_favorite is null or p_notes is null
  or p_status not in ('Не связывались','На проверке','Связались','Переговоры','Тестовый заказ','Партнёр','Отказ','Отложено')
  or length(p_notes)>10000 then raise exception 'Проверьте статус и длину заметки' using errcode='22023';end if;
 update store_private.partners p set status=p_status,favorite=p_favorite,notes=p_notes,revision=revision+1,updated_at=now()
 where p.owner_id=auth.uid() and p.id=p_id and p.revision=p_revision
 returning to_jsonb(p)-'owner_id' into result;
 if result is null then raise exception 'Карточка изменилась или недоступна. Обновите список; скопируйте заметку перед обновлением.' using errcode='40001';end if;
 return result;
end $$;
revoke all on function store_private.partner_list(),store_private.partner_update(text,bigint,text,boolean,text) from public,anon;
grant execute on function store_private.partner_list(),store_private.partner_update(text,bigint,text,boolean,text) to authenticated;
create function public.store_partner_list() returns jsonb language sql security invoker set search_path='' as $$select store_private.partner_list();$$;
create function public.store_partner_update(p_id text,p_revision bigint,p_status text,p_favorite boolean,p_notes text) returns jsonb language sql security invoker set search_path='' as $$select store_private.partner_update(p_id,p_revision,p_status,p_favorite,p_notes);$$;
revoke all on function public.store_partner_list(),public.store_partner_update(text,bigint,text,boolean,text) from public,anon;
grant execute on function public.store_partner_list(),public.store_partner_update(text,bigint,text,boolean,text) to authenticated;
