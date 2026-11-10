alter table public.products add column if not exists seo_updated_at timestamptz;
comment on column public.products.seo_updated_at is 'Timestamp of a significant public product change; maintained by trigger, excluded from editor input.';
create or replace function store_private.track_product_seo_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.seo_updated_at := statement_timestamp();
 elsif (to_jsonb(new) - array['revision','creation_key','archive_status','seo_updated_at']) is distinct from
       (to_jsonb(old) - array['revision','creation_key','archive_status','seo_updated_at']) then
  new.seo_updated_at := statement_timestamp();
 else
  new.seo_updated_at := old.seo_updated_at;
 end if;
 return new;
end;
$$;
revoke all on function store_private.track_product_seo_update() from public, anon, authenticated;
create trigger track_product_seo_update before insert or update on public.products for each row execute function store_private.track_product_seo_update();
grant select (seo_updated_at) on public.products to anon, authenticated;
