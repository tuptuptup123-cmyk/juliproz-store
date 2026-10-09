-- Separate condition from gender, category and fulfillment status.
alter table public.products add column if not exists product_condition text not null default 'new' constraint products_condition_valid check (product_condition in ('new','pre_owned','vintage'));
grant select(product_condition) on public.products to anon,authenticated;
grant insert(product_condition),update(product_condition) on public.products to authenticated;
notify pgrst, 'reload schema';
