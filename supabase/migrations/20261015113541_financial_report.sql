-- Additive, owner-only finance workspace. No customer data enters public products.
begin;
create table store_private.finance_entries (
 id uuid primary key default gen_random_uuid(),
 sale_id bigint unique references store_private.product_sales(id),
 product_id bigint,
 product_label text not null check(char_length(btrim(product_label)) between 1 and 300),
 kind text not null check(kind in ('sale','order')),
 status text not null check(status in ('active','completed','cancelled','linked')),
 on_commission boolean not null default false,
 on_order boolean not null default false,
 opened_on date not null check(opened_on between date '2000-01-01' and date '2100-12-31'),
 completed_on date check(completed_on between opened_on and date '2100-12-31'),
 report_on date generated always as(coalesce(completed_on,opened_on)) stored,
 quantity integer not null check(quantity between 1 and 9999),
 amount numeric not null check(amount between 0 and 999999999 and amount=trunc(amount)),
 received numeric check(received between 0 and amount and received=trunc(received)),
 purchase_cost numeric check(purchase_cost between 0 and 999999999 and purchase_cost=trunc(purchase_cost)),
 expenses numeric check(expenses between 0 and 999999999 and expenses=trunc(expenses)),
 owner_due numeric check(owner_due between 0 and 999999999 and owner_due=trunc(owner_due)),
 owner_paid numeric check(owner_paid between 0 and 999999999 and owner_paid=trunc(owner_paid)),
 owner_ref text not null default '' check(char_length(owner_ref)<=100),
 client_ref text not null default '' check(char_length(client_ref)<=100),
 note text not null default '' check(char_length(note)<=2000),
 merged_into uuid references store_private.finance_entries(id),
 revision bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 check(status<>'completed' or completed_on is not null),
 check((status='linked')=(merged_into is not null)),
 check(merged_into is distinct from id),
 check((on_commission and purchase_cost is null) or (not on_commission and owner_due is null and owner_paid is null and owner_ref='')),
 check(owner_paid is null or (owner_due is not null and owner_paid<=owner_due))
);
create index finance_entries_report on store_private.finance_entries(report_on desc,id desc) where merged_into is null;
create index finance_entries_merged on store_private.finance_entries(merged_into) where merged_into is not null;
create table store_private.commission_terms (
 product_id bigint primary key,
 owner_ref text not null default '' check(char_length(owner_ref)<=100),
 due_per_unit numeric check(due_per_unit between 0 and 999999999 and due_per_unit=trunc(due_per_unit)),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
create table store_private.finance_changes (
 id bigint generated always as identity primary key,
 entity text not null,
 record_id text not null,
 changed_at timestamptz not null default now(),
 actor_id uuid,
 actor_label text not null,
 before_data jsonb,
 after_data jsonb
);
create index finance_changes_record on store_private.finance_changes(entity,record_id,id desc);
alter table store_private.finance_entries enable row level security;
alter table store_private.commission_terms enable row level security;
alter table store_private.finance_changes enable row level security;
revoke all on store_private.finance_entries,store_private.commission_terms,store_private.finance_changes from public,anon,authenticated,service_role;
revoke all on sequence store_private.finance_changes_id_seq from public,anon,authenticated,service_role;

create function store_private.audit_finance_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into store_private.finance_changes(entity,record_id,actor_id,actor_label,before_data,after_data)
 values(tg_table_name,case when tg_table_name='finance_entries' then to_jsonb(new)->>'id' else to_jsonb(new)->>'product_id' end,
 auth.uid(),coalesce((select nullif(display_name,'') from public.store_admins where user_id=auth.uid()),'Система'),
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function store_private.audit_finance_change() from public,anon,authenticated,service_role;
create trigger finance_entry_audit after insert or update on store_private.finance_entries for each row execute function store_private.audit_finance_change();
create trigger commission_terms_audit after insert or update on store_private.commission_terms for each row execute function store_private.audit_finance_change();

-- Capture classification and agreed payout at sale time, never from today's card in reports.
create function store_private.sync_sale_finance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into store_private.finance_entries(sale_id,product_id,product_label,kind,status,on_commission,on_order,opened_on,completed_on,quantity,amount,owner_due,owner_ref,updated_by)
  select new.id,new.product_id,left(new.product_label,300),'sale',case when new.voided_at is null then 'completed' else 'cancelled' end,
   coalesce(p.on_commission,false),coalesce(p.fulfillment_status='on_order',false),new.sold_on,new.sold_on,new.quantity,new.amount,
   case when p.on_commission and t.due_per_unit*new.quantity<=999999999 then t.due_per_unit*new.quantity end,
   case when p.on_commission then coalesce(t.owner_ref,'') else '' end,new.actor_id
  from (select 1) seed left join public.products p on p.id=new.product_id left join store_private.commission_terms t on t.product_id=p.id;
 elsif new.voided_at is distinct from old.voided_at then
  update store_private.finance_entries set status=case when new.voided_at is null then 'completed' else 'cancelled' end,
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where sale_id=new.id;
 end if;
 return new;
end $$;
revoke all on function store_private.sync_sale_finance() from public,anon,authenticated,service_role;
create trigger product_sale_finance after insert or update of voided_at on store_private.product_sales for each row execute function store_private.sync_sale_finance();
insert into store_private.finance_entries(sale_id,product_id,product_label,kind,status,on_commission,on_order,opened_on,completed_on,quantity,amount,updated_by)
select s.id,s.product_id,left(s.product_label,300),'sale',case when s.voided_at is null then 'completed' else 'cancelled' end,
 coalesce(p.on_commission,false),coalesce(p.fulfillment_status='on_order',false),s.sold_on,s.sold_on,s.quantity,s.amount,s.actor_id
from store_private.product_sales s left join public.products p on p.id=s.product_id;

create function store_private.finance_report(p_from date,p_to date,p_group text default 'all',p_before uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if p_from is null or p_to is null or p_from>p_to or p_from<date '2000-01-01' or p_to>date '2100-12-31' or p_to-p_from>3660
  or p_group is null or p_group not in ('all','sales','commission','orders') then raise exception 'Проверьте период и раздел отчёта (не более 10 лет)'; end if;
 with filtered as (
  select e.*,case when expenses is not null and (case when on_commission then owner_due else purchase_cost end) is not null
   then amount-expenses-(case when on_commission then owner_due else purchase_cost end) end as margin
  from store_private.finance_entries e where merged_into is null and report_on between p_from and p_to
   and (p_group='all' or (p_group='sales' and status='completed') or (p_group='commission' and on_commission) or (p_group='orders' and (kind='order' or on_order)))
 ), page as (
  select * from filtered where p_before is null or (report_on,id)<(select report_on,id from store_private.finance_entries where id=p_before)
  order by report_on desc,id desc limit 31
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by report_on desc,id desc) from page p),'[]'::jsonb),
  'summary',(select jsonb_build_object(
   'sold_count',count(*) filter(where status='completed'),'sold_units',coalesce(sum(quantity) filter(where status='completed'),0),
   'gross',coalesce(sum(amount) filter(where status='completed'),0),
   'profit_known',coalesce(sum(margin) filter(where status='completed'),0),
   'profit_missing',count(*) filter(where status='completed' and margin is null),
   'received',coalesce(sum(received) filter(where status<>'cancelled'),0),
   'received_missing',count(*) filter(where status<>'cancelled' and received is null),
   'receivable',coalesce(sum(amount-received) filter(where status<>'cancelled'),0),
   'owner_due',coalesce(sum(owner_due) filter(where status='completed' and on_commission),0),
   'owner_paid',coalesce(sum(owner_paid) filter(where status='completed' and on_commission),0),
   'owner_unpaid',coalesce(sum(owner_due-owner_paid) filter(where status='completed' and on_commission),0),
   'owner_missing',count(*) filter(where status='completed' and on_commission and (owner_due is null or owner_paid is null)),
   'active_count',count(*) filter(where status='active'),'active_amount',coalesce(sum(amount) filter(where status='active'),0),
   'refund_due',coalesce(sum(received) filter(where status='cancelled'),0),
   'refund_unknown',count(*) filter(where status='cancelled' and received is null),
   'cancelled_count',count(*) filter(where status='cancelled')
  ) from filtered),
  'today',(now() at time zone 'Europe/Kyiv')::date,'from',p_from,'to',p_to,
  'legacy_count',(select count(*) from public.products where archive_status='legacy')) into result;
 return result;
end $$;

create function store_private.save_finance_entry(p_id uuid,p_revision bigint,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e store_private.finance_entries%rowtype; previous store_private.finance_entries%rowtype; existing boolean; target_sale bigint; today date:=(now() at time zone 'Europe/Kyiv')::date;
begin
 perform store_private.require_workspace_admin(true);
 if p_id is null or p_revision is null or p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Некорректная запись'; end if;
 if exists(select 1 from jsonb_object_keys(p_values) k where k not in ('product_id','product_label','status','on_commission','opened_on','completed_on','quantity','amount','received','purchase_cost','expenses','owner_due','owner_paid','owner_ref','client_ref','note')) then raise exception 'Неизвестное поле финансовой записи'; end if;
 -- Same order as the sale-void transaction: sale ledger, then finance row.
 select sale_id into target_sale from store_private.finance_entries where id=p_id;
 if target_sale is not null then perform 1 from store_private.product_sales where id=target_sale for update; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,160215));
 select * into previous from store_private.finance_entries where id=p_id for update;existing:=found;
 if p_revision<>(case when existing then previous.revision else 0 end) then raise exception 'Запись уже изменена. Обновите отчёт и откройте её заново.' using errcode='40001'; end if;
 if previous.merged_into is not null then raise exception 'Заказ связан с продажей. Редактируйте объединённую запись.'; end if;
 if existing then e:=previous;
 else e.id:=p_id;e.kind:='order';e.status:='active';e.on_order:=true;e.on_commission:=false;e.quantity:=1;e.owner_ref:='';e.client_ref:='';e.note:=''; end if;
 if e.sale_id is not null and p_values ?| array['product_id','product_label','status','on_commission','opened_on','completed_on','quantity','amount'] then
  raise exception 'Дату, сумму и статус продажи изменяют через историю продаж';
 end if;
 e:=jsonb_populate_record(e,p_values);
 if e.product_label is null or e.amount is null or e.quantity is null or e.on_commission is null or e.opened_on is null
  or e.opened_on<date '2000-01-01' or e.opened_on>today or e.completed_on>today
  or e.status is null or e.status not in ('active','completed','cancelled')
  or (e.status='active' and e.completed_on is not null) then raise exception 'Проверьте название, сумму, количество, дату и статус'; end if;
 if e.product_id is not null and (not existing or e.product_id is distinct from previous.product_id)
  and not exists(select 1 from public.products where id=e.product_id) then raise exception 'Товар с таким артикулом не найден'; end if;
 if existing then
  update store_private.finance_entries set product_id=e.product_id,product_label=btrim(e.product_label),status=e.status,on_commission=e.on_commission,
   opened_on=e.opened_on,completed_on=e.completed_on,quantity=e.quantity,amount=e.amount,received=e.received,purchase_cost=e.purchase_cost,expenses=e.expenses,
   owner_due=e.owner_due,owner_paid=e.owner_paid,owner_ref=btrim(e.owner_ref),client_ref=btrim(e.client_ref),note=btrim(e.note),
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into e;
 else
  insert into store_private.finance_entries(id,product_id,product_label,kind,status,on_commission,on_order,opened_on,completed_on,quantity,amount,received,purchase_cost,expenses,owner_due,owner_paid,owner_ref,client_ref,note,updated_by)
  values(p_id,e.product_id,btrim(e.product_label),'order',e.status,e.on_commission,true,e.opened_on,e.completed_on,e.quantity,e.amount,e.received,e.purchase_cost,e.expenses,e.owner_due,e.owner_paid,btrim(e.owner_ref),btrim(e.client_ref),btrim(e.note),auth.uid()) returning * into e;
 end if;
 return to_jsonb(e);
end $$;

-- Merge an independently entered order into its real catalogue sale, once.
create function store_private.link_finance_order(p_order uuid,p_sale uuid,p_order_revision bigint,p_sale_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o store_private.finance_entries%rowtype;s store_private.finance_entries%rowtype; sid bigint;k text;
begin
 perform store_private.require_workspace_admin(true);
 if p_order is null or p_sale is null or p_order=p_sale then raise exception 'Выберите заказ и продажу'; end if;
 select sale_id into sid from store_private.finance_entries where id=p_sale;
 if sid is null then raise exception 'Продажа не найдена'; end if;
 perform 1 from store_private.product_sales where id=sid for update;
 perform 1 from store_private.finance_entries where id in (p_order,p_sale) order by id for update;
 select * into o from store_private.finance_entries where id=p_order;select * into s from store_private.finance_entries where id=p_sale;
 if o.id is null or o.sale_id is not null or o.status in ('linked','cancelled') or s.sale_id is null or s.status<>'completed'
  or exists(select 1 from store_private.finance_entries where merged_into=s.id) then raise exception 'Этот заказ или продажу уже нельзя связать'; end if;
 if p_order_revision is distinct from o.revision or p_sale_revision is distinct from s.revision then raise exception 'Запись изменилась. Обновите отчёт.' using errcode='40001'; end if;
 if o.amount<>s.amount or o.quantity<>s.quantity or o.on_commission<>s.on_commission or o.opened_on>s.completed_on
  or (o.product_id is not null and o.product_id is distinct from s.product_id) then raise exception 'Сверьте сумму, количество, комиссию, дату заказа и артикул с выбранной продажей'; end if;
 foreach k in array array['received','purchase_cost','expenses','owner_due','owner_paid'] loop
  if (to_jsonb(o)->>k) is not null and (to_jsonb(s)->>k) is not null and to_jsonb(o)->k<>to_jsonb(s)->k then raise exception 'В заказе и продаже разные финансовые данные (%). Сначала сверьте суммы.',k; end if;
 end loop;
 update store_private.finance_entries set kind='order',on_order=true,opened_on=o.opened_on,
  received=coalesce(o.received,s.received),purchase_cost=coalesce(o.purchase_cost,s.purchase_cost),expenses=coalesce(o.expenses,s.expenses),
  owner_due=coalesce(o.owner_due,s.owner_due),owner_paid=coalesce(o.owner_paid,s.owner_paid),owner_ref=coalesce(nullif(o.owner_ref,''),s.owner_ref),
  client_ref=coalesce(nullif(o.client_ref,''),s.client_ref),note=left(concat_ws(E'\n',nullif(s.note,''),nullif(o.note,'')),2000),
  revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=p_sale;
 update store_private.finance_entries set status='linked',merged_into=p_sale,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=p_order;
 return jsonb_build_object('saved',true,'id',p_sale);
end $$;

create function store_private.finance_sale_choices(p_query text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if p_query is null or char_length(p_query)>150 then raise exception 'Слишком длинный поиск';end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by completed_on desc,id desc),'[]'::jsonb) into result from (
  select id,sale_id::text,product_label,amount,quantity,completed_on,revision from store_private.finance_entries e
  where sale_id is not null and status='completed' and not exists(select 1 from store_private.finance_entries o where o.merged_into=e.id)
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(product_label))>0 or sale_id::text=btrim(p_query))
  order by completed_on desc,id desc limit 30
 ) s;return result;
end $$;

create function store_private.finance_commission(p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 with current_items as (
  select p.id::text as product_id,concat_ws(' ',p.brand,p.name) as product_label,p.price,p.reserved,p.fulfillment_status,
   case when p.stock_quantities is null then 1 else coalesce((select sum(value::integer) from jsonb_each_text(p.stock_quantities)),0) end as quantity,
   coalesce(t.owner_ref,'') as owner_ref,t.due_per_unit,coalesce(t.revision,0) as revision
  from public.products p left join store_private.commission_terms t on t.product_id=p.id where p.available and p.on_commission
 ), page as (select * from current_items where p_before is null or product_id::bigint<p_before order by product_id::bigint desc limit 31)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by product_id::bigint desc) from page p),'[]'::jsonb),
  'summary',(select jsonb_build_object('cards',count(*),'units',coalesce(sum(quantity),0),'catalogue_value',coalesce(sum(price*quantity),0),
   'price_missing',count(*) filter(where price is null),'terms_missing',count(*) filter(where due_per_unit is null)) from current_items)) into result;
 return result;
end $$;

create function store_private.save_commission_terms(p_product bigint,p_revision bigint,p_owner text,p_due numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing bigint;result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if p_product is null or p_revision is null or p_owner is null or char_length(p_owner)>100 then raise exception 'Проверьте владельца и артикул';end if;
 perform 1 from public.products where id=p_product and on_commission and available for update;
 if not found then raise exception 'Вещь больше не находится на комиссии в каталоге';end if;
 select revision into existing from store_private.commission_terms where product_id=p_product for update;
 if p_revision<>coalesce(existing,0) then raise exception 'Условия уже изменены. Обновите список.' using errcode='40001';end if;
 insert into store_private.commission_terms(product_id,owner_ref,due_per_unit,updated_by) values(p_product,btrim(p_owner),p_due,auth.uid())
 on conflict(product_id) do update set owner_ref=excluded.owner_ref,due_per_unit=excluded.due_per_unit,revision=store_private.commission_terms.revision+1,updated_at=now(),updated_by=auth.uid()
 returning to_jsonb(commission_terms) into result;return result;
end $$;

create function store_private.finance_history(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 select coalesce(jsonb_agg(to_jsonb(c) order by id desc),'[]'::jsonb) into result from (
  select id::text,changed_at,actor_label,before_data,after_data from store_private.finance_changes where entity='finance_entries' and record_id=p_id::text order by id desc limit 20
 ) c;return result;
end $$;

create function public.store_finance_report(p_from date,p_to date,p_group text default 'all',p_before uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.finance_report(p_from,p_to,p_group,p_before); $$;
create function public.store_save_finance_entry(p_id uuid,p_revision bigint,p_values jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.save_finance_entry(p_id,p_revision,p_values); $$;
create function public.store_link_finance_order(p_order uuid,p_sale uuid,p_order_revision bigint,p_sale_revision bigint) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.link_finance_order(p_order,p_sale,p_order_revision,p_sale_revision); $$;
create function public.store_finance_sale_choices(p_query text default '') returns jsonb
language sql security invoker set search_path='' as $$ select store_private.finance_sale_choices(p_query); $$;
create function public.store_finance_commission(p_before bigint default null) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.finance_commission(p_before); $$;
create function public.store_save_commission_terms(p_product bigint,p_revision bigint,p_owner text,p_due numeric) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.save_commission_terms(p_product,p_revision,p_owner,p_due); $$;
create function public.store_finance_history(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.finance_history(p_id); $$;
do $$ declare fn text;begin
 foreach fn in array array['finance_report(date,date,text,uuid)','save_finance_entry(uuid,bigint,jsonb)','link_finance_order(uuid,uuid,bigint,bigint)','finance_sale_choices(text)','finance_commission(bigint)','save_commission_terms(bigint,bigint,text,numeric)','finance_history(uuid)'] loop
  execute 'revoke all on function store_private.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function store_private.'||fn||' to authenticated';
  execute 'revoke all on function public.store_'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function public.store_'||fn||' to authenticated';
 end loop;
end $$;
commit;
