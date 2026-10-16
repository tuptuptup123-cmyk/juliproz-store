-- Purchase costs stay private; each sale keeps its own historical cost snapshot.
begin;
create table store_private.product_costs (
 product_id bigint primary key,
 purchase_per_unit numeric check(purchase_per_unit between 0 and 999999999 and purchase_per_unit=trunc(purchase_per_unit)),
 expenses_per_unit numeric check(expenses_per_unit between 0 and 999999999 and expenses_per_unit=trunc(expenses_per_unit)),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table store_private.product_costs enable row level security;
revoke all on store_private.product_costs from public,anon,authenticated,service_role;
create trigger product_costs_audit after insert or update on store_private.product_costs
 for each row execute function store_private.audit_finance_change();
create index finance_entries_product on store_private.finance_entries(product_id,report_on desc,id desc) where sale_id is not null and merged_into is null;

create function store_private.product_finance(p_product bigint,p_before uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if not exists(select 1 from public.products where id=p_product) then raise exception 'Карточка не найдена'; end if;
 with sales as (
  select e.*,case when expenses is not null and (case when on_commission then owner_due else purchase_cost end) is not null
   then amount-expenses-(case when on_commission then owner_due else purchase_cost end) end as margin
  from store_private.finance_entries e where product_id=p_product and sale_id is not null and merged_into is null
 ), page as (
  select * from sales where p_before is null or (report_on,id)<(select report_on,id from sales where id=p_before)
  order by report_on desc,id desc limit 31
 )
 select jsonb_build_object(
  'terms',coalesce((select to_jsonb(c) from store_private.product_costs c where product_id=p_product),jsonb_build_object('product_id',p_product,'revision',0,'purchase_per_unit',null,'expenses_per_unit',null)),
  'rows',coalesce((select jsonb_agg(to_jsonb(p) order by report_on desc,id desc) from page p),'[]'::jsonb),
  'summary',(select jsonb_build_object('count',count(*) filter(where status='completed'),'quantity',coalesce(sum(quantity) filter(where status='completed'),0),
   'amount',coalesce(sum(amount) filter(where status='completed'),0),'profit_known',coalesce(sum(margin) filter(where status='completed'),0),
   'profit_missing',count(*) filter(where status='completed' and margin is null)) from sales)) into result;
 return result;
end $$;

create function store_private.save_product_costs(p_product bigint,p_revision bigint,p_purchase numeric,p_expenses numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_cost store_private.product_costs%rowtype; saved store_private.product_costs%rowtype;
begin
 perform store_private.require_workspace_admin(true);
 -- Same first lock as recording a sale: snapshot and cost edits cannot interleave.
 perform 1 from public.products where id=p_product for update;
 if not found then raise exception 'Карточка не найдена'; end if;
 select * into old_cost from store_private.product_costs where product_id=p_product for update;
 if p_revision is null or p_revision<>coalesce(old_cost.revision,0) then
  -- An identical retry after a lost response is safe and does not add audit noise.
  if old_cost.revision=p_revision+1 and old_cost.purchase_per_unit is not distinct from p_purchase and old_cost.expenses_per_unit is not distinct from p_expenses then return to_jsonb(old_cost); end if;
  raise exception 'Закупка уже изменена. Откройте карточку заново и сравните суммы.' using errcode='40001';
 end if;
 if old_cost.product_id is not null and old_cost.purchase_per_unit is not distinct from p_purchase and old_cost.expenses_per_unit is not distinct from p_expenses then return to_jsonb(old_cost); end if;
 insert into store_private.product_costs(product_id,purchase_per_unit,expenses_per_unit,updated_by)
 values(p_product,p_purchase,p_expenses,auth.uid()) on conflict(product_id) do update set purchase_per_unit=excluded.purchase_per_unit,
  expenses_per_unit=excluded.expenses_per_unit,revision=product_costs.revision+1,updated_at=now(),updated_by=auth.uid() returning * into saved;
 return to_jsonb(saved);
end $$;

create or replace function store_private.sync_sale_finance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into store_private.finance_entries(sale_id,product_id,product_label,kind,status,on_commission,on_order,opened_on,completed_on,quantity,amount,purchase_cost,expenses,owner_due,owner_ref,updated_by)
  select new.id,new.product_id,left(new.product_label,300),'sale',case when new.voided_at is null then 'completed' else 'cancelled' end,
   coalesce(p.on_commission,false),coalesce(p.fulfillment_status='on_order',false),new.sold_on,new.sold_on,new.quantity,new.amount,
   case when not coalesce(p.on_commission,false) and c.purchase_per_unit*new.quantity<=999999999 then c.purchase_per_unit*new.quantity end,
   case when c.expenses_per_unit*new.quantity<=999999999 then c.expenses_per_unit*new.quantity end,
   case when p.on_commission and t.due_per_unit*new.quantity<=999999999 then t.due_per_unit*new.quantity end,
   case when p.on_commission then coalesce(t.owner_ref,'') else '' end,new.actor_id
  from (select 1) seed left join public.products p on p.id=new.product_id
   left join store_private.commission_terms t on t.product_id=p.id left join store_private.product_costs c on c.product_id=p.id;
 elsif new.voided_at is distinct from old.voided_at then
  update store_private.finance_entries set status=case when new.voided_at is null then 'completed' else 'cancelled' end,
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where sale_id=new.id;
 end if;
 return new;
end $$;
revoke all on function store_private.sync_sale_finance() from public,anon,authenticated,service_role;
create function public.store_product_finance(p_product bigint,p_before uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.product_finance(p_product,p_before); $$;
create function public.store_save_product_costs(p_product bigint,p_revision bigint,p_purchase numeric,p_expenses numeric) returns jsonb
language sql security invoker set search_path='' as $$ select store_private.save_product_costs(p_product,p_revision,p_purchase,p_expenses); $$;
do $$ declare fn text;begin
 foreach fn in array array['product_finance(bigint,uuid)','save_product_costs(bigint,bigint,numeric,numeric)'] loop
  execute 'revoke all on function store_private.'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function store_private.'||fn||' to authenticated';
  execute 'revoke all on function public.store_'||fn||' from public,anon,authenticated,service_role';
  execute 'grant execute on function public.store_'||fn||' to authenticated';
 end loop;
end $$;
commit;
