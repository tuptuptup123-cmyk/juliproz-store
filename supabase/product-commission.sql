alter table public.products add column if not exists on_commission boolean not null default false;
grant select(on_commission) on public.products to anon, authenticated;
grant insert(on_commission), update(on_commission) on public.products to authenticated;
notify pgrst, 'reload schema';