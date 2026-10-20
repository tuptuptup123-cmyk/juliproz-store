begin;
create or replace function store_private.business_overview(p_month date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone store_private.business_time_zone())::date;
 first_day date:=coalesce(p_month,date_trunc('month',today)::date);last_day date;result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if first_day<date '2000-01-01' or first_day>today or extract(day from first_day)<>1 then
  raise exception 'Выберите текущий или прошедший месяц' using errcode='22023';end if;
 last_day:=least(today,(first_day+interval '1 month'-interval '1 day')::date);
 with stock as (
  select p.*,case when stock_quantities is null then 1 else coalesce((select sum(value::integer) from jsonb_each_text(stock_quantities)),0) end units
  from public.products p where (available or archive_status='hidden') and fulfillment_status='in_stock'
 ), inventory as (
  select count(*) filter(where units>0) cards,coalesce(sum(units),0) units,
   coalesce(sum(price*units) filter(where price>0 and currency in ('EUR','€')),0) catalogue_value,
   count(*) filter(where units>0 and (price is null or price=0 or currency not in ('EUR','€'))) price_missing,
   coalesce(sum(price*units) filter(where not on_commission and price>0 and currency in ('EUR','€')),0) own_value,
   coalesce(sum(price*units) filter(where on_commission and price>0 and currency in ('EUR','€')),0) commission_value,
   count(*) filter(where units>0 and not available) hidden_cards,
   coalesce(sum(units) filter(where reserved),0) reserved_units
  from stock
 ), sales as (
  select e.*,case when expenses is not null and (case when on_commission then owner_due else purchase_cost end) is not null
   then amount-expenses-(case when on_commission then owner_due else purchase_cost end) end margin
  from store_private.finance_entries e where merged_into is null and status='completed' and report_on between first_day and last_day
 ), totals as (
  select count(*) sold_count,coalesce(sum(quantity),0) sold_units,coalesce(sum(amount),0) revenue,
   coalesce(sum(margin),0) profit_known,count(*) filter(where margin is null) profit_missing from sales
 ), capital as (select * from store_private.monthly_capital where month=first_day)
 select jsonb_build_object('month',first_day,'through',last_day,'today',today,'time_zone',store_private.business_time_zone(),
  'inventory',(select to_jsonb(i) from inventory i),
  'sales',(select to_jsonb(t)||jsonb_build_object('profit',case when profit_missing=0 then profit_known end,
   'net_profit',case when profit_missing=0 then profit_known-(select monthly_expenses from capital) end) from totals t),
  'capital',coalesce((select to_jsonb(c) from capital c),jsonb_build_object('month',first_day,'invested_capital',null,'monthly_expenses',null,'revision',0)),
  'goal',jsonb_build_object('target_percent',10,'target',(select invested_capital*0.10 from capital),
   'return_percent',(select case when t.profit_missing=0 then round((t.profit_known-c.monthly_expenses)/c.invested_capital*100,4) end from totals t cross join capital c)),
  'legacy_count',(select count(*) from public.products where archive_status='legacy')) into result;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
