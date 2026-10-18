-- Additive changes; do not modify historical financial records.
begin;
CREATE OR REPLACE FUNCTION store_private.void_product_sale(p_sale_id bigint, p_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s store_private.product_sales%rowtype; p public.products%rowtype; label text; target bigint;
begin
 perform store_private.require_workspace_admin(true);
 if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Укажите причину отмены (от 3 до 1000 символов)'; end if;
 select product_id into target from store_private.product_sales where id=p_sale_id;
 -- Same lock order as recording: product first, then ledger.
 select * into p from public.products where id=target for update;
 select * into s from store_private.product_sales where id=p_sale_id for update;
 if not found then raise exception 'Продажа не найдена'; end if;
 if s.voided_at is not null then return jsonb_build_object('product',case when p.id is null then null else to_jsonb(p) end,'already_voided',true); end if;
 if p.id is not null then
  if p_revision is null or p_revision<>p.revision then raise exception 'Карточка изменилась. Обновите список и повторите'; end if;
  if exists(select 1 from store_private.product_sales where product_id=p.id and id>s.id and voided_at is null)
  or jsonb_build_object('available',p.available,'archive_status',p.archive_status,'reserved',p.reserved,'stock_quantities',p.stock_quantities) is distinct from s.after_state then
   raise exception 'После продажи остатки или статус изменились. Сначала отмените более поздние продажи и проверьте карточку';
  end if;
 end if;
 select coalesce(nullif(a.display_name,''),u.email,auth.uid()::text) into label from public.store_admins a join auth.users u on u.id=a.user_id where a.user_id=auth.uid();
 update store_private.product_sales set voided_at=now(),voided_by=auth.uid(),voided_label=label,void_reason=btrim(p_reason) where id=s.id;
 if p.id is not null then
  update public.products set available=(s.before_state->>'available')::boolean,archive_status=s.before_state->>'archive_status',reserved=coalesce((s.before_state->>'reserved')::boolean,false),stock_quantities=nullif(s.before_state->'stock_quantities','null'::jsonb) where id=p.id returning * into p;
 end if;
 return jsonb_build_object('product',case when p.id is null then null else to_jsonb(p) end);
end $function$;
alter table public.products add column if not exists name_en text, add column if not exists description_en text;
alter table public.products add constraint products_name_en_length check(name_en is null or char_length(name_en)<=250), add constraint products_description_en_length check(description_en is null or char_length(description_en)<=5000);
grant select(name_en,description_en) on public.products to anon,authenticated;
grant insert(name_en,description_en), update(name_en,description_en) on public.products to authenticated;
-- A changed source must not retain an old translation by accident, including API edits.
create or replace function store_private.invalidate_product_translation()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.name is distinct from old.name and new.name_en is not distinct from old.name_en then new.name_en:=null; end if;
 if new.description is distinct from old.description and new.description_en is not distinct from old.description_en then new.description_en:=null; end if;
 return new;
end $$;
revoke all on function store_private.invalidate_product_translation() from public,anon,authenticated;
create trigger invalidate_product_translation before update on public.products for each row execute function store_private.invalidate_product_translation();
notify pgrst, 'reload schema';
commit;
