-- A reservation blocks ordering without changing public catalogue visibility.
begin;
alter table public.products add column if not exists reserved boolean not null default false;
grant select (reserved) on public.products to anon, authenticated;
grant insert (reserved), update (reserved) on public.products to authenticated;
grant delete on public.products to authenticated;
create policy "Admins delete products" on public.products for delete to authenticated
 using (exists(select 1 from public.store_admins where user_id=(select auth.uid())));
create policy "store_mfa_product_delete" on public.products as restrictive for delete to authenticated
 using ((select store_private.admin_mfa_satisfied()));
notify pgrst, 'reload schema';
commit;
