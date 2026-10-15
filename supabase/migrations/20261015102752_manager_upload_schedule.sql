-- One daily duty, ten new cards. Historical attribution comes from the existing
-- server audit trigger, never from counters or actor IDs submitted by a browser.
begin;
create table store_private.upload_rotations (
 starts_on date primary key,
 manager_ids uuid[] not null check(cardinality(manager_ids) between 1 and 100),
 manager_labels jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
create table store_private.upload_day_overrides (
 day date primary key,
 manager_id uuid,
 manager_label text not null default '',
 note text not null default '' check(char_length(note)<=300),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
create table store_private.upload_schedule_changes (
 id bigint generated always as identity primary key,
 changed_at timestamptz not null default now(),
 actor_id uuid not null,
 kind text not null check(kind in ('rotation','day','reset_day')),
 day date not null,
 before_data jsonb,
 after_data jsonb
);
alter table store_private.upload_rotations enable row level security;
alter table store_private.upload_day_overrides enable row level security;
alter table store_private.upload_schedule_changes enable row level security;
revoke all on store_private.upload_rotations,store_private.upload_day_overrides,store_private.upload_schedule_changes from public,anon,authenticated,service_role;
create index store_change_log_product_uploads_idx on store_private.store_change_log(changed_at,actor_id) include(record_id,id) where entity='products' and operation='INSERT';

-- Existing approved staff only. Do not create or infer identities from sheet names.
insert into store_private.upload_rotations(starts_on,manager_ids,manager_labels)
select (now() at time zone 'Europe/Kyiv')::date,array_agg(user_id order by display_name collate "C",user_id),
 jsonb_object_agg(user_id::text,coalesce(nullif(display_name,''),'Менеджер'))
from public.store_admins where access_role='admin' having count(*)>0;

create function store_private.upload_duty(p_day date)
returns table(day date,manager_id uuid,manager_label text,target integer,is_override boolean,revision bigint,note text,active boolean)
language sql stable security invoker set search_path='' as $$
 with chosen as (
  select r.manager_ids[1+((p_day-r.starts_on)%cardinality(r.manager_ids))] as id,r.manager_labels
  from store_private.upload_rotations r where r.starts_on<=p_day order by r.starts_on desc limit 1
 ), resolved as (
  select case when o.day is not null then o.manager_id else c.id end as id,
   case when o.day is not null then o.manager_label else c.manager_labels->>c.id::text end as label,
   o.day is not null as overridden,coalesce(o.revision,0) as rev,coalesce(o.note,'') as memo
  from (select 1) seed left join chosen c on true left join store_private.upload_day_overrides o on o.day=p_day
 )
 select p_day,r.id,coalesce(nullif(a.display_name,''),r.label,''),case when r.id is null then 0 else 10 end,
  r.overridden,r.rev,r.memo,a.user_id is not null
 from resolved r left join public.store_admins a on a.user_id=r.id;
$$;
revoke all on function store_private.upload_duty(date) from public,anon,authenticated,service_role;

create function store_private.workspace_upload_schedule(p_month date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'Europe/Kyiv')::date; first_day date; last_day date; result jsonb;
begin
 perform store_private.require_workspace_admin();
 first_day:=date_trunc('month',coalesce(p_month,today))::date;
 if first_day<date '2000-01-01' or first_day>date '2100-12-01' then raise exception 'Недопустимый месяц'; end if;
 last_day:=(first_day+interval '1 month')::date;
 with uploads as (
  select (l.changed_at at time zone 'Europe/Kyiv')::date as day,l.actor_id,
   coalesce(nullif(a.display_name,''),nullif(l.actor_label,''),case when l.actor_id is null then 'Системная загрузка' else 'Бывший сотрудник' end) as label,
   l.record_id,p.id is not null as kept
  from store_private.store_change_log l
  left join public.store_admins a on a.user_id=l.actor_id
  left join public.products p on p.id=case when l.record_id~'^[0-9]{1,18}$' then l.record_id::bigint end
  where l.entity='products' and l.operation='INSERT'
   and l.changed_at>=first_day::timestamp at time zone 'Europe/Kyiv'
   and l.changed_at<last_day::timestamp at time zone 'Europe/Kyiv'
   and not exists(select 1 from store_private.store_change_log old where old.entity='products' and old.operation='INSERT' and old.record_id=l.record_id and old.id<l.id)
 ), counts as (
  select day,actor_id,max(label) as label,count(*) filter(where kept)::integer as count,count(*) filter(where not kept)::integer as deleted_count
  from uploads group by day,actor_id
 ), days as (
  select d.*,coalesce(c.count,0) as uploaded,coalesce(c.deleted_count,0) as deleted_count,
   coalesce((select sum(x.count) from counts x where x.day=d.day and x.actor_id is distinct from d.manager_id),0) as others
  from generate_series(0,(last_day-first_day)-1) s(n)
  cross join lateral store_private.upload_duty(first_day+s.n) d
  left join counts c on c.day=d.day and c.actor_id=d.manager_id
 )
 select jsonb_build_object(
  'today',today,'month',first_day,'time_zone','Europe/Kyiv','current_user_id',auth.uid(),
  'can_manage',exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner'),
  'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from days d),'[]'::jsonb),
  'counts',coalesce((select jsonb_agg(to_jsonb(c) order by c.day,c.label) from counts c),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',coalesce(nullif(a.display_name,''),'Менеджер'),'access_role',a.access_role) order by a.display_name) from public.store_admins a),'[]'::jsonb),
  'rotations',coalesce((select jsonb_agg(to_jsonb(r) order by r.starts_on) from (select starts_on,manager_ids,manager_labels,revision from store_private.upload_rotations order by starts_on desc limit 100) r),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function store_private.save_upload_rotation(p_starts_on date,p_manager_ids uuid[],p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; labels jsonb; existing bigint;
begin
 perform store_private.require_workspace_admin(true);
 if p_starts_on is null or p_starts_on<(now() at time zone 'Europe/Kyiv')::date or p_starts_on>(now() at time zone 'Europe/Kyiv')::date+366 then raise exception 'Новая очередь может начинаться сегодня или в течение следующего года'; end if;
 if p_manager_ids is null or cardinality(p_manager_ids) not between 1 and 100 or array_ndims(p_manager_ids)<>1
  or array_position(p_manager_ids,null) is not null
  or cardinality(p_manager_ids)<>(select count(distinct id) from unnest(p_manager_ids) id) then raise exception 'Выберите менеджеров без повторений'; end if;
 if exists(select 1 from unnest(p_manager_ids) id where not exists(select 1 from public.store_admins a where a.user_id=id)) then raise exception 'Участник очереди должен иметь доступ к админке'; end if;
 -- Serialize same-day edits, including a first insert into an empty date.
 perform pg_advisory_xact_lock(172604,p_starts_on-date '2000-01-01');
 select revision,to_jsonb(r) into existing,before_row from store_private.upload_rotations r where starts_on=p_starts_on for update;
 if p_revision is distinct from coalesce(existing,0) then raise exception 'Очередь уже изменена. Обновите расписание и повторите.' using errcode='40001'; end if;
 select jsonb_object_agg(user_id::text,coalesce(nullif(display_name,''),'Менеджер')) into labels from public.store_admins where user_id=any(p_manager_ids);
 insert into store_private.upload_rotations(starts_on,manager_ids,manager_labels,updated_by)
 values(p_starts_on,p_manager_ids,labels,auth.uid()) on conflict(starts_on) do update set manager_ids=excluded.manager_ids,manager_labels=excluded.manager_labels,revision=store_private.upload_rotations.revision+1,updated_at=now(),updated_by=auth.uid()
 returning to_jsonb(upload_rotations) into after_row;
 insert into store_private.upload_schedule_changes(actor_id,kind,day,before_data,after_data) values(auth.uid(),'rotation',p_starts_on,before_row,after_row);
 return jsonb_build_object('saved',true);
end $$;

create function store_private.save_upload_day(p_day date,p_manager_id uuid,p_note text,p_revision bigint,p_reset boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; label text; existing bigint;
begin
 perform store_private.require_workspace_admin(true);
 if p_day is null or p_day<(now() at time zone 'Europe/Kyiv')::date or p_day>(now() at time zone 'Europe/Kyiv')::date+366 then raise exception 'Можно менять сегодняшнее и будущее дежурство в течение года'; end if;
 if p_note is null or char_length(p_note)>300 or p_reset is null then raise exception 'Примечание: до 300 символов'; end if;
 if p_manager_id is not null then
  select coalesce(nullif(display_name,''),'Менеджер') into label from public.store_admins where user_id=p_manager_id;
  if not found then raise exception 'У менеджера нет доступа к админке'; end if;
 end if;
 perform pg_advisory_xact_lock(172605,p_day-date '2000-01-01');
 select revision,to_jsonb(d) into existing,before_row from store_private.upload_day_overrides d where day=p_day for update;
 if p_revision is distinct from coalesce(existing,0) then raise exception 'Дежурство уже изменено. Обновите расписание и повторите.' using errcode='40001'; end if;
 if p_reset then delete from store_private.upload_day_overrides where day=p_day;
 else
  insert into store_private.upload_day_overrides(day,manager_id,manager_label,note,updated_by)
  values(p_day,p_manager_id,coalesce(label,''),btrim(p_note),auth.uid()) on conflict(day) do update set manager_id=excluded.manager_id,manager_label=excluded.manager_label,note=excluded.note,revision=store_private.upload_day_overrides.revision+1,updated_at=now(),updated_by=auth.uid()
  returning to_jsonb(upload_day_overrides) into after_row;
 end if;
 insert into store_private.upload_schedule_changes(actor_id,kind,day,before_data,after_data) values(auth.uid(),case when p_reset then 'reset_day' else 'day' end,p_day,before_row,after_row);
 return jsonb_build_object('saved',true);
end $$;

create function store_private.workspace_upload_items(p_day date,p_actor_id uuid default null,p_before bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin();
 if p_day is null or p_day<date '2000-01-01' or p_day>date '2100-12-31' then raise exception 'Недопустимая дата'; end if;
 select coalesce(jsonb_agg(row_data order by id desc),'[]'::jsonb) into result from (
  select l.id,jsonb_build_object('id',l.id::text,'product_id',l.record_id,'created_at',l.changed_at,
   'actor_id',l.actor_id,'actor_label',coalesce(nullif(a.display_name,''),nullif(l.actor_label,''),case when l.actor_id is null then 'Системная загрузка' else 'Бывший сотрудник' end),
   'title',concat_ws(' ',l.after_row->>'brand',l.after_row->>'name'),'exists',p.id is not null,
   'available',p.available,'archive_status',p.archive_status) as row_data
  from store_private.store_change_log l left join public.store_admins a on a.user_id=l.actor_id
  left join public.products p on p.id=case when l.record_id~'^[0-9]{1,18}$' then l.record_id::bigint end
  where l.entity='products' and l.operation='INSERT' and l.changed_at>=p_day::timestamp at time zone 'Europe/Kyiv'
   and l.changed_at<(p_day+1)::timestamp at time zone 'Europe/Kyiv'
   and (p_actor_id is null or l.actor_id=p_actor_id) and (p_before is null or l.id<p_before)
   and not exists(select 1 from store_private.store_change_log old where old.entity='products' and old.operation='INSERT' and old.record_id=l.record_id and old.id<l.id)
  order by l.id desc limit 31
 ) rows;
 return result;
end $$;

create function public.store_upload_schedule(p_month date default null) returns jsonb language sql security invoker set search_path='' as $$ select store_private.workspace_upload_schedule(p_month); $$;
create function public.store_save_upload_rotation(p_starts_on date,p_manager_ids uuid[],p_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select store_private.save_upload_rotation(p_starts_on,p_manager_ids,p_revision); $$;
create function public.store_save_upload_day(p_day date,p_manager_id uuid,p_note text,p_revision bigint,p_reset boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select store_private.save_upload_day(p_day,p_manager_id,p_note,p_revision,p_reset); $$;
create function public.store_upload_items(p_day date,p_actor_id uuid default null,p_before bigint default null) returns jsonb language sql security invoker set search_path='' as $$ select store_private.workspace_upload_items(p_day,p_actor_id,p_before); $$;
do $$ declare fn text; begin
 foreach fn in array array['workspace_upload_schedule(date)','save_upload_rotation(date,uuid[],bigint)','save_upload_day(date,uuid,text,bigint,boolean)','workspace_upload_items(date,uuid,bigint)'] loop
  execute 'revoke all on function store_private.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function store_private.'||fn||' to authenticated';
 end loop;
 foreach fn in array array['store_upload_schedule(date)','store_save_upload_rotation(date,uuid[],bigint)','store_save_upload_day(date,uuid,text,bigint,boolean)','store_upload_items(date,uuid,bigint)'] loop
  execute 'revoke all on function public.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function public.'||fn||' to authenticated';
 end loop;
end $$;
commit;
