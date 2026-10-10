alter table public.products add column if not exists original_price numeric;
alter table public.products add constraint products_discount_price_check check (original_price is null or (price is not null and price >= 0 and original_price > price and original_price < 'Infinity'::numeric));
grant select(original_price) on public.products to anon, authenticated;
grant insert(original_price), update(original_price) on public.products to authenticated;
notify pgrst, 'reload schema';
