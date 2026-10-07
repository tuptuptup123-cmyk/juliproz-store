-- Additive production fix: no product changes, no existing grants/policies removed,
-- no tables/data dropped, and no MFA enforcement before owner enrollment.
-- Existing rows were checked beforehand. VALIDATE aborts atomically on an incompatible row.
-- Rollback: remove only the new constraints/triggers; KEEP journal table/data.
begin;
-- Fail closed even for direct authenticated API writes, without changing existing cards.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_required_text_valid') then
  alter table public.products add constraint products_required_text_valid check (
   brand is not null and char_length(btrim(brand))>0 and char_length(brand)<=150 and
   name is not null and char_length(btrim(name))>0 and char_length(name)<=250 and
   category is not null and char_length(btrim(category))>0 and char_length(category)<=100 and
   (size is null or char_length(size)<=100) and
   (description is null or char_length(description)<=5000)
  ) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_finite_price_valid') then
  alter table public.products add constraint products_finite_price_valid check (
   (price is null or (price>=0 and price::text not in ('NaN','Infinity','-Infinity'))) and
   currency is not null and currency in ('EUR','USD','RUB','AED','GBP')
  ) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_photo_limits_valid') then
  alter table public.products add constraint products_photo_limits_valid check (
   char_length(image_url) between 1 and 2048 and
   jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=20 and
   not jsonb_path_exists(photos,'$[*] ? (@.type() != "string")')
  ) not valid;
 end if;
end $$;
alter table public.products validate constraint products_required_text_valid;
alter table public.products validate constraint products_finite_price_valid;
alter table public.products validate constraint products_photo_limits_valid;


-- Append-only to browser roles; project administrators inspect through trusted SQL.
create table if not exists store_private.store_change_log (
 id bigint generated always as identity primary key,
 changed_at timestamptz not null default clock_timestamp(),
 actor_id uuid,
 actor_role text not null,
 entity text not null,
 operation text not null,
 record_id text,
 before_row jsonb,
 after_row jsonb
);
alter table store_private.store_change_log enable row level security;
revoke all on store_private.store_change_log from public,anon,authenticated,service_role;
revoke all on sequence store_private.store_change_log_id_seq from public,anon,authenticated,service_role;

create or replace function store_private.log_store_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); before_data jsonb; after_data jsonb;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('products','store_admins') or tg_when<>'AFTER' then
  raise exception 'Unexpected audit trigger target';
 end if;
 if actor is null and current_setting('role',true)='authenticated' then
  raise exception 'Authenticated actor is required' using errcode='42501';
 end if;
 if tg_op<>'INSERT' then before_data:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_data:=to_jsonb(new); end if;
 insert into store_private.store_change_log(actor_id,actor_role,entity,operation,record_id,before_row,after_row)
 values(actor,coalesce(auth.jwt()->>'role',session_user::text),tg_table_name,tg_op,
  coalesce(after_data->>'id',before_data->>'id',after_data->>'user_id',before_data->>'user_id'),
  before_data,after_data);
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function store_private.log_store_change() from public,anon,authenticated,service_role;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.products'::regclass and tgname='audit_product_changes') then
  create trigger audit_product_changes after insert or update or delete on public.products
   for each row execute function store_private.log_store_change();
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.store_admins'::regclass and tgname='audit_admin_changes') then
  create trigger audit_admin_changes after insert or update or delete on public.store_admins
   for each row execute function store_private.log_store_change();
 end if;
end $$;


notify pgrst,'reload schema';
commit;
