begin;
alter table public.products add column if not exists photos jsonb not null default '[]'::jsonb;
create table if not exists public.store_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.store_admins enable row level security;
revoke all on public.store_admins from anon, authenticated;
grant select on public.store_admins to authenticated;
drop policy if exists "Admins read own membership" on public.store_admins;
create policy "Admins read own membership" on public.store_admins for select to authenticated using(user_id=auth.uid());
alter table public.products enable row level security;
-- Replace existing product policies so old permissive policies cannot bypass admin authorization.
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='products' loop execute format('drop policy %I on public.products',p.policyname); end loop; end $$;
grant select on public.products to anon,authenticated;
grant insert,update on public.products to authenticated;
revoke insert,update,delete on public.products from anon;
revoke delete on public.products from authenticated;
create policy "Catalog available products" on public.products for select to anon,authenticated using (available=true);
create policy "Admins read inventory" on public.products for select to authenticated using (exists(select 1 from public.store_admins where user_id=auth.uid()));
create policy "Admins add products" on public.products for insert to authenticated with check (exists(select 1 from public.store_admins where user_id=auth.uid()));
create policy "Admins edit products" on public.products for update to authenticated using (exists(select 1 from public.store_admins where user_id=auth.uid())) with check (exists(select 1 from public.store_admins where user_id=auth.uid()));
do $$ declare s text; begin s:=pg_get_serial_sequence('public.products','id'); if s is not null then execute format('grant usage,select on sequence %s to authenticated',s); end if; end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-photos','product-photos',true,6291456,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Admins upload product photos" on storage.objects;
create policy "Admins upload product photos" on storage.objects for insert to authenticated with check(bucket_id='product-photos' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.store_admins where user_id=auth.uid()));
drop policy if exists "Admins read product photo metadata" on storage.objects;
create policy "Admins read product photo metadata" on storage.objects for select to authenticated using(bucket_id='product-photos' and exists(select 1 from public.store_admins where user_id=auth.uid()));
commit;
-- After creating the owner in Supabase Authentication, register the UUID:
-- insert into public.store_admins(user_id) values ('OWNER_AUTH_USER_UUID') on conflict do nothing;
