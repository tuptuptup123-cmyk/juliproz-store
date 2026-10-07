begin;
-- Column grants fail closed if private columns are added later.
revoke all on public.products from anon;
revoke select,delete,truncate,references,trigger on public.products from authenticated;
grant select(id,created_at,brand,name,category,size,price,currency,image_url,available,description,photos) on public.products to anon,authenticated;
alter table public.products enable row level security;
-- Existing owner-only INSERT/UPDATE and available-only SELECT policies remain.
create or replace function store_private.valid_product_image(value text)
returns boolean language sql immutable strict security invoker set search_path='' as $$
 select value ~ '^https://(juliproz-store[.]vercel[.]app/images/|qhgzzhgxwpcctafpzjid[.]supabase[.]co/storage/v1/object/public/product-photos/)[^[:space:]]+$'
   and value !~ '[\\?#]' and value !~ '/[.][.](/|$)';
$$;
create or replace function store_private.valid_product_photos(value jsonb)
returns boolean language plpgsql immutable strict security invoker set search_path='' as $$
declare photo jsonb;
begin
 if jsonb_typeof(value)<>'array' then return false; end if;
 if jsonb_array_length(value)>20 then return false; end if;
 for photo in select * from jsonb_array_elements(value) loop
   if jsonb_typeof(photo)<>'string' or char_length(photo #>> '{}')>2048 or not coalesce(store_private.valid_product_image(photo #>> '{}'),false) then return false; end if;
 end loop;
 return true;
end;
$$;
revoke all on function store_private.valid_product_image(text),store_private.valid_product_photos(jsonb) from public,anon;
grant usage on schema store_private to authenticated,service_role;
grant execute on function store_private.valid_product_image(text),store_private.valid_product_photos(jsonb) to authenticated,service_role;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_trusted_image') then alter table public.products add constraint products_trusted_image check(image_url is null or store_private.valid_product_image(image_url)); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_trusted_photos') then alter table public.products add constraint products_trusted_photos check(store_private.valid_product_photos(photos)); end if; end $$;
commit;

