-- XE EUR/USD snapshot, 2026-10-10, asOf 1791612720000.
-- Conversion runs once: only USD rows are updated. Audit trigger records before/after.
lock table public.products in share row exclusive mode;
do $$begin
 if exists(select 1 from public.products where currency is null or currency not in ('EUR','USD')) then
  raise exception 'Unexpected currency: review conversion before proceeding';
 end if;
end$$;
update public.products
 set price=round(price/1.1201722186642982,2),
     original_price=round(original_price/1.1201722186642982,2),currency='EUR'
 where currency='USD';
alter table public.products alter column currency set default 'EUR';
alter table public.products add constraint products_euro_only check(currency is not null and currency='EUR');
alter table public.products add column wear_condition text;
alter table public.products add constraint products_wear_condition_valid check(
 wear_condition is null or (product_condition='pre_owned' and wear_condition in ('like_new','gently_used','used','very_used'))
);
grant select(wear_condition) on public.products to anon,authenticated;
grant insert(wear_condition),update(wear_condition) on public.products to authenticated;
