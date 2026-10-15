-- Additive migration: no historical sale is inferred from available=false.
begin;
create table store_private.product_archive_migration_backup as
 select id,available,reserved,revision,now() as captured_at from public.products;
alter table store_private.product_archive_migration_backup add primary key(id);
alter table store_private.product_archive_migration_backup enable row level security;
revoke all on store_private.product_archive_migration_backup from public,anon,authenticated,service_role;

alter table public.products add column archive_status text
 check(archive_status in ('hidden','sold','legacy'));
update public.products set archive_status='legacy' where not available;
alter table public.products add constraint products_archive_consistent
 check((available and archive_status is null) or (not available and archive_status is not null));
grant select(archive_status),insert(archive_status),update(archive_status) on public.products to authenticated;

-- No FK to products/users: historical snapshots survive removal of either.
create table store_private.product_sales (
 id bigint generated always as identity primary key,
 operation_id uuid not null unique,
 product_id bigint not null,
 product_label text not null,
 variant text not null,
 quantity integer not null check(quantity between 1 and 9999),
 amount numeric not null check(amount>=0 and amount<=999999999 and amount=trunc(amount)),
 sold_on date not null,
 recorded_at timestamptz not null default now(),
 actor_id uuid not null,
 actor_label text not null,
 legacy boolean not null default false,
 before_state jsonb not null,
 after_state jsonb not null,
 voided_at timestamptz,
 voided_by uuid,
 voided_label text,
 void_reason text check(char_length(void_reason)<=1000)
);
alter table store_private.product_sales enable row level security;
revoke all on store_private.product_sales from public,anon,authenticated,service_role;
revoke all on sequence store_private.product_sales_id_seq from public,anon,authenticated,service_role;
create index product_sales_date_id on store_private.product_sales(sold_on desc,id desc);
create index product_sales_product on store_private.product_sales(product_id,id desc);

-- Old clients can still hide a card, but cannot manufacture a confirmed sale.
create function store_private.guard_product_archive()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.available then new.archive_status:=null;
 elsif new.archive_status is null then new.archive_status:='legacy'; end if;
 if tg_op='UPDATE' and old.archive_status='sold' and new.archive_status is distinct from 'sold'
 and exists(select 1 from store_private.product_sales where product_id=old.id and voided_at is null and after_state->>'archive_status'='sold') then
  raise exception 'Для возврата проданной вещи отмените продажу в истории продаж';
 end if;
 if new.archive_status='sold' and not exists(select 1 from store_private.product_sales where product_id=new.id and voided_at is null and after_state->>'archive_status'='sold') then
  raise exception 'Отметьте продажу через форму с датой и суммой';
 end if;
 if not new.available then new.reserved:=false; end if;
 return new;
end $$;
revoke all on function store_private.guard_product_archive() from public,anon,authenticated,service_role;
create trigger guard_product_archive before insert or update on public.products
 for each row execute function store_private.guard_product_archive();

create function store_private.record_product_sale(p_operation_id uuid,p_product_id bigint,p_revision bigint,p_sold_on date,p_amount numeric,p_variant text,p_quantity integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; previous store_private.product_sales%rowtype;
 q jsonb; stock integer; remaining integer; archive text; visible boolean; before_data jsonb; after_data jsonb; label text; sale_id bigint;
begin
 perform store_private.require_workspace_admin();
 if p_operation_id is null or p_product_id is null or p_revision is null or p_sold_on is null or p_sold_on<'2000-01-01'::date or p_sold_on>(now() at time zone 'Pacific/Kiritimati')::date
 or p_amount is null or not(p_amount>=0 and p_amount<=999999999 and p_amount=trunc(p_amount))
 or p_variant is null or char_length(p_variant)>100 or p_quantity is null or p_quantity not between 1 and 9999 then
  raise exception 'Проверьте дату, целую сумму в EUR и количество';
 end if;
 select * into p from public.products where id=p_product_id for update;
 select * into previous from store_private.product_sales where operation_id=p_operation_id;
 if found then
  if previous.actor_id<>auth.uid() or previous.product_id<>p_product_id or previous.sold_on<>p_sold_on or previous.amount<>p_amount or previous.variant<>p_variant or previous.quantity<>p_quantity then raise exception 'Эта операция уже записана с другими данными'; end if;
  return jsonb_build_object('sale_id',previous.id::text,'product',case when p.id is null then null else to_jsonb(p) end,'already_recorded',true);
 end if;
 if p.id is null then raise exception 'Товар больше не существует'; end if;
 if p.revision<>p_revision then raise exception 'Карточка изменилась. Обновите список и повторите продажу'; end if;
 if p.archive_status='sold' then raise exception 'Вещь уже продана'; end if;
 before_data:=jsonb_build_object('available',p.available,'archive_status',p.archive_status,'reserved',p.reserved,'stock_quantities',p.stock_quantities);
 q:=p.stock_quantities; visible:=p.available; archive:=p.archive_status;
 if p.archive_status='legacy' then
  -- A historical confirmation must not invent or deduct a historical balance.
  visible:=false;archive:='sold';
 else
  if q is null then
   if p_quantity<>1 then raise exception 'Сначала укажите остатки по размерам в карточке'; end if;
   -- Legacy stock semantics are one item per card until explicit quantities exist.
   visible:=false;archive:='sold';
  else
   if not(q ? p_variant) then raise exception 'Размер изменился. Обновите карточку'; end if;
   stock:=(q->>p_variant)::integer;
   if p_quantity>stock then raise exception 'Недостаточно остатка выбранного размера'; end if;
   q:=jsonb_set(q,array[p_variant],to_jsonb(stock-p_quantity));
   select coalesce(sum(value::integer),0) into remaining from jsonb_each_text(q);
   if remaining=0 then visible:=false;archive:='sold'; end if;
  end if;
 end if;
 after_data:=jsonb_build_object('available',visible,'archive_status',archive,'reserved',false,'stock_quantities',q);
 select coalesce(nullif(a.display_name,''),u.email,auth.uid()::text) into label from public.store_admins a join auth.users u on u.id=a.user_id where a.user_id=auth.uid();
 insert into store_private.product_sales(operation_id,product_id,product_label,variant,quantity,amount,sold_on,actor_id,actor_label,legacy,before_state,after_state)
 values(p_operation_id,p.id,concat_ws(' ',p.brand,p.name),p_variant,p_quantity,p_amount,p_sold_on,auth.uid(),label,p.archive_status is not distinct from 'legacy',before_data,after_data) returning id into sale_id;
 update public.products set available=visible,archive_status=archive,reserved=false,stock_quantities=q where id=p.id returning * into p;
 return jsonb_build_object('sale_id',sale_id::text,'product',to_jsonb(p));
end $$;

create function store_private.void_product_sale(p_sale_id bigint,p_revision bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s store_private.product_sales%rowtype; p public.products%rowtype; label text; target bigint;
begin
 perform store_private.require_workspace_admin();
 if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Укажите причину отмены (от 3 до 1000 символов)'; end if;
 select product_id into target from store_private.product_sales where id=p_sale_id;
 -- Same lock order as recording: product first, then ledger.
 select * into p from public.products where id=target for update;
 select * into s from store_private.product_sales where id=p_sale_id for update;
 if not found then raise exception 'Продажа не найдена'; end if;
 if s.voided_at is not null then return jsonb_build_object('product',case when p.id is null then null else to_jsonb(p) end,'already_voided',true); end if;
 if p.id is not null then
  if p_revision is null or p_revision<>p.revision then raise exception 'Карточка изменилась. Обновите список и повторите'; end if;
  if exists(select 1 from store_private.product_sales where product_id=p.id and id>s.id and voided_at is null)
  or jsonb_build_object('available',p.available,'archive_status',p.archive_status,'reserved',p.reserved,'stock_quantities',p.stock_quantities) is distinct from s.after_state then
   raise exception 'После продажи остатки или статус изменились. Сначала отмените более поздние продажи и проверьте карточку';
  end if;
 end if;
 select coalesce(nullif(a.display_name,''),u.email,auth.uid()::text) into label from public.store_admins a join auth.users u on u.id=a.user_id where a.user_id=auth.uid();
 update store_private.product_sales set voided_at=now(),voided_by=auth.uid(),voided_label=label,void_reason=btrim(p_reason) where id=s.id;
 if p.id is not null then
  update public.products set available=(s.before_state->>'available')::boolean,archive_status=s.before_state->>'archive_status',reserved=false,stock_quantities=nullif(s.before_state->'stock_quantities','null'::jsonb) where id=p.id returning * into p;
 end if;
 return jsonb_build_object('product',case when p.id is null then null else to_jsonb(p) end);
end $$;

create function store_private.product_sales_history(p_before bigint default null,p_query text default '',p_from date default null,p_to date default null,p_state text default 'active')
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; summary jsonb;
begin
 perform store_private.require_workspace_admin();
 if p_state is null or p_state not in ('active','voided','all') or p_query is null or char_length(p_query)>150 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Проверьте фильтры истории'; end if;
 with filtered as (
  select s.* from store_private.product_sales s where (p_from is null or s.sold_on>=p_from) and (p_to is null or s.sold_on<=p_to)
  and (p_state='all' or (p_state='active' and s.voided_at is null) or (p_state='voided' and s.voided_at is not null))
  and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(s.product_label))>0 or s.product_id::text=btrim(p_query))
 ), page as (
  select s.* from filtered s where p_before is null or (s.sold_on,s.id)<(select sold_on,id from store_private.product_sales where id=p_before)
  order by s.sold_on desc,s.id desc limit 31
 )
 select (select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'product_id',product_id::text,'product_label',product_label,'variant',variant,'quantity',quantity,'amount',amount,'sold_on',sold_on,'recorded_at',recorded_at,'actor_label',actor_label,'legacy',legacy,'voided_at',voided_at,'voided_label',voided_label,'void_reason',void_reason) order by sold_on desc,id desc),'[]'::jsonb) from page),
 (select jsonb_build_object('count',count(*) filter(where voided_at is null),'quantity',coalesce(sum(quantity) filter(where voided_at is null),0),'amount',coalesce(sum(amount) filter(where voided_at is null),0)) from filtered)
 into rows,summary;
 return jsonb_build_object('rows',rows,'summary',summary);
end $$;

create function public.store_record_product_sale(p_operation_id uuid,p_product_id bigint,p_revision bigint,p_sold_on date,p_amount numeric,p_variant text,p_quantity integer)
returns jsonb language sql security invoker set search_path='' as $$select store_private.record_product_sale(p_operation_id,p_product_id,p_revision,p_sold_on,p_amount,p_variant,p_quantity);$$;
create function public.store_void_product_sale(p_sale_id bigint,p_revision bigint,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$select store_private.void_product_sale(p_sale_id,p_revision,p_reason);$$;
create function public.store_product_sales_history(p_before bigint default null,p_query text default '',p_from date default null,p_to date default null,p_state text default 'active')
returns jsonb language sql security invoker set search_path='' as $$select store_private.product_sales_history(p_before,p_query,p_from,p_to,p_state);$$;
do $$ declare fn text; begin
 foreach fn in array array['record_product_sale(uuid,bigint,bigint,date,numeric,text,integer)','void_product_sale(bigint,bigint,text)','product_sales_history(bigint,text,date,date,text)'] loop
  execute 'revoke all on function store_private.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function store_private.'||fn||' to authenticated';
  execute 'revoke all on function public.store_'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function public.store_'||fn||' to authenticated';
 end loop;
end $$;
commit;
