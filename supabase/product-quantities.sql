alter table public.products add column if not exists stock_quantities jsonb default null constraint products_stock_quantities_valid check (stock_quantities is null or (jsonb_typeof(stock_quantities) = 'object' and not jsonb_path_exists(stock_quantities, '$.* ? (@.type() != "number" || @ < 0 || @ > 9999 || @ % 1 != 0)')));
grant select(stock_quantities) on public.products to anon,authenticated;
grant insert(stock_quantities),update(stock_quantities) on public.products to authenticated;
notify pgrst, 'reload schema';
