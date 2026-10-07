begin;
alter table public.products add column if not exists revision bigint not null default 1;
alter table public.products add column if not exists creation_key uuid;
create unique index if not exists products_creation_key_unique on public.products(creation_key) where creation_key is not null;
create or replace function public.bump_product_revision() returns trigger language plpgsql set search_path='' as $$begin new.revision:=old.revision+1;return new;end$$;
drop trigger if exists bump_product_revision on public.products;
create trigger bump_product_revision before update on public.products for each row execute function public.bump_product_revision();
update public.products set currency=case currency when '€' then 'EUR' when '$' then 'USD' when '₽' then 'RUB' when '£' then 'GBP' else currency end where currency in ('€','$','₽','£');
alter table public.products add constraint products_price_currency_valid check ((price is null or price>=0) and currency in ('EUR','USD','RUB','AED','GBP')) not valid;
alter table public.products validate constraint products_price_currency_valid;
revoke select,insert,update on public.products from anon,authenticated;
grant select(id,created_at,brand,name,category,size,price,currency,image_url,available,description,photos) on public.products to anon,authenticated;
grant select(revision,creation_key) on public.products to authenticated;
grant insert(brand,name,category,size,price,currency,image_url,available,description,photos,creation_key) on public.products to authenticated;
grant update(brand,name,category,size,price,currency,image_url,available,description,photos) on public.products to authenticated;
-- Owner membership persists; verified email enrollment is no longer needed.
drop trigger if exists enroll_verified_store_admin on auth.users;
notify pgrst,'reload schema';
commit;
