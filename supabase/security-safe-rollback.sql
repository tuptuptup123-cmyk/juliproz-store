-- Roll back behavior without deleting products, memberships or audit history.
begin;
drop trigger if exists audit_product_changes on public.products;
drop trigger if exists audit_admin_changes on public.store_admins;
alter table public.products drop constraint if exists products_required_text_valid;
alter table public.products drop constraint if exists products_finite_price_valid;
alter table public.products drop constraint if exists products_photo_limits_valid;
-- Keep store_private.store_change_log intact for incident review.
commit;

