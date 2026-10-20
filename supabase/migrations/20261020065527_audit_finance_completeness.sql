begin;
-- Read-only reporting and owner-authorized commission editing; no business rows are changed.
CREATE OR REPLACE FUNCTION store_private.finance_commission(p_before bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 with current_items as (
  select p.id::text as product_id,concat_ws(' ',p.brand,p.name) as product_label,p.price,p.reserved,p.fulfillment_status,p.available,p.archive_status,
   case when p.stock_quantities is null then 1 else coalesce((select sum(value::integer) from jsonb_each_text(p.stock_quantities)),0) end as quantity,
   coalesce(t.owner_ref,'') as owner_ref,t.due_per_unit,coalesce(t.revision,0) as revision
  from public.products p left join store_private.commission_terms t on t.product_id=p.id where p.on_commission and (p.available or p.archive_status='hidden')
 ), page as (select * from current_items where p_before is null or product_id::bigint<p_before order by product_id::bigint desc limit 31)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by product_id::bigint desc) from page p),'[]'::jsonb),
  'summary',(select jsonb_build_object('cards',count(*),'units',coalesce(sum(quantity),0),'catalogue_value',coalesce(sum(price*quantity),0),
   'hidden_cards',count(*) filter(where not available),
   'price_missing',count(*) filter(where price is null or price=0),'terms_missing',count(*) filter(where due_per_unit is null or btrim(owner_ref)='')) from current_items)) into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION store_private.finance_report(p_from date, p_to date, p_group text DEFAULT 'all'::text, p_before uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if p_from is null or p_to is null or p_from>p_to or p_from<date '2000-01-01' or p_to>date '2100-12-31' or p_to-p_from>3660
  or p_group is null or p_group not in ('all','sales','commission','orders','incomplete') then raise exception 'Проверьте период и раздел отчёта (не более 10 лет)'; end if;
 with source as (
  select e.*,case when expenses is not null and (case when on_commission then owner_due else purchase_cost end) is not null
   then amount-expenses-(case when on_commission then owner_due else purchase_cost end) end as margin,
   (received is null or (status <> 'cancelled' and (expenses is null
    or (not on_commission and purchase_cost is null)
    or (on_commission and (owner_due is null or owner_paid is null or btrim(owner_ref)=''))))) as needs_attention
  from store_private.finance_entries e where merged_into is null and report_on between p_from and p_to
 ), filtered as (
  select * from source where (p_group='all' or (p_group='sales' and status='completed') or (p_group='commission' and on_commission) or (p_group='orders' and (kind='order' or on_order)) or (p_group='incomplete' and needs_attention))
 ), page as (
  select * from filtered where p_before is null or (report_on,id)<(select report_on,id from store_private.finance_entries where id=p_before)
  order by report_on desc,id desc limit 31
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by report_on desc,id desc) from page p),'[]'::jsonb),
  'summary',(select jsonb_build_object(
   'incomplete_count',count(*) filter(where needs_attention),
   'commission_count',count(*) filter(where status='completed' and on_commission),
   'owner_due_missing',count(*) filter(where status='completed' and on_commission and owner_due is null),
   'owner_paid_missing',count(*) filter(where status='completed' and on_commission and owner_paid is null),
   'sold_count',count(*) filter(where status='completed'),'sold_units',coalesce(sum(quantity) filter(where status='completed'),0),
   'gross',coalesce(sum(amount) filter(where status='completed'),0),
   'profit_known',coalesce(sum(margin) filter(where status='completed'),0),
   'profit_missing',count(*) filter(where status='completed' and margin is null),
   'received',coalesce(sum(received) filter(where status<>'cancelled'),0),
   'received_missing',count(*) filter(where status<>'cancelled' and received is null),
   'receivable',coalesce(sum(amount-received) filter(where status<>'cancelled'),0),
   'owner_due',coalesce(sum(owner_due) filter(where status='completed' and on_commission),0),
   'owner_paid',coalesce(sum(owner_paid) filter(where status='completed' and on_commission),0),
   'owner_unpaid',coalesce(sum(owner_due-owner_paid) filter(where status='completed' and on_commission),0),
   'owner_missing',count(*) filter(where status='completed' and on_commission and (owner_due is null or owner_paid is null)),
   'active_count',count(*) filter(where status='active'),'active_amount',coalesce(sum(amount) filter(where status='active'),0),
   'refund_due',coalesce(sum(received) filter(where status='cancelled'),0),
   'refund_unknown',count(*) filter(where status='cancelled' and received is null),
   'cancelled_count',count(*) filter(where status='cancelled')
  ) from filtered),
  'today',(now() at time zone store_private.business_time_zone())::date,'from',p_from,'to',p_to,
  'legacy_count',(select count(*) from public.products where archive_status='legacy')) into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION store_private.save_commission_terms(p_product bigint, p_revision bigint, p_owner text, p_due numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing bigint;result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 if p_product is null or p_revision is null or p_owner is null or char_length(p_owner)>100 then raise exception 'Проверьте владельца и артикул';end if;
 perform 1 from public.products where id=p_product and on_commission and (available or archive_status='hidden') for update;
 if not found then raise exception 'Вещь больше не находится на комиссии: проверьте её статус';end if;
 select revision into existing from store_private.commission_terms where product_id=p_product for update;
 if p_revision<>coalesce(existing,0) then raise exception 'Условия уже изменены. Обновите список.' using errcode='40001';end if;
 insert into store_private.commission_terms(product_id,owner_ref,due_per_unit,updated_by) values(p_product,btrim(p_owner),p_due,auth.uid())
 on conflict(product_id) do update set owner_ref=excluded.owner_ref,due_per_unit=excluded.due_per_unit,revision=store_private.commission_terms.revision+1,updated_at=now(),updated_by=auth.uid()
 returning to_jsonb(commission_terms) into result;return result;
end $function$;

-- Replacements preserve the existing grants; retain explicit owner checks in each body.
commit;
