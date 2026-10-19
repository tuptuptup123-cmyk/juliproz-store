begin;
-- Ownership classification belongs to the staff product workflow. Financial
-- terms, costs and statistics keep their separate owner-only permissions.
create or replace function store_private.guard_product_financial_basis() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' and new.on_commission) or (tg_op='UPDATE' and new.on_commission is distinct from old.on_commission) then
  if auth.uid() is not null or current_setting('role',true) in ('anon','authenticated') then
   perform store_private.require_workspace_admin(false);
  end if;
 end if;
 -- Existing RLS and audit triggers enforce staff access and record the actor.
 new.stock_quantities:=store_private.normalize_stock(new.stock_quantities);
 return new;
end $$;
revoke all on function store_private.guard_product_financial_basis() from public,anon,authenticated,service_role;
commit;
