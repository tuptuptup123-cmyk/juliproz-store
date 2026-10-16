begin;
create or replace function store_private.business_time_zone() returns text language sql immutable set search_path='' as $$ select 'Europe/Kyiv'::text $$;
create or replace function store_private.business_today() returns date language sql stable set search_path='' as $$ select (now() at time zone store_private.business_time_zone())::date $$;
revoke all on function store_private.business_time_zone(),store_private.business_today() from public,anon;
grant execute on function store_private.business_time_zone(),store_private.business_today() to authenticated,service_role;
create or replace function store_private.admin_mfa_fresh() returns boolean
language sql stable security definer set search_path='' as $$
 select store_private.admin_session_active() and auth.jwt()->>'aal'='aal2' and exists (
  select 1 from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end) a
  where a->>'method'='totp' and case when jsonb_typeof(a->'timestamp')='number' then (a->>'timestamp')::numeric between extract(epoch from now())-900 and extract(epoch from now())+30 else false end)
$$;
revoke all on function store_private.admin_mfa_fresh() from public,anon,authenticated,service_role;
create or replace function store_private.normalize_variant(value text) returns text language plpgsql immutable set search_path='' as $$
declare s text:=btrim(value); latin text;
begin
 s:=regexp_replace(s,'^([0-9]+),([0-9]+)$','\1.\2');
 if s ~* '^(one[ -]?size|o[ /-]?s|единый размер|универсальный)$' then return 'One Size'; end if;
 latin:=upper(translate(s,'ХхМмСс','XXMMSS'));
 latin:=case latin when '2XL' then 'XXL' when '3XL' then 'XXXL' when 'XXXXL' then '4XL' else latin end;
 if latin ~ '^([2-6]?X{1,4}[SL]|[SML])$' then return latin; end if;
 return regexp_replace(s,'^Длинна:','Длина:','i');
end $$;
create or replace function store_private.normalize_stock(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'::jsonb; item record; k text;
begin
 if value is null then return null; end if;
 if jsonb_typeof(value)<>'object' then raise exception 'Остатки должны быть объектом'; end if;
 for item in select * from jsonb_each(value) loop
  k:=store_private.normalize_variant(item.key);
  if result ? k then raise exception 'Размер % указан несколько раз. Проверьте фактический остаток',k; end if;
  result:=result||jsonb_build_object(k,item.value);
 end loop;
 return result;
end $$;
revoke all on function store_private.normalize_variant(text),store_private.normalize_stock(jsonb) from public,anon;
grant execute on function store_private.normalize_variant(text),store_private.normalize_stock(jsonb) to authenticated,service_role;
create or replace function store_private.guard_product_financial_basis() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' and new.on_commission) or (tg_op='UPDATE' and new.on_commission is distinct from old.on_commission) then
  if auth.uid() is not null or current_setting('role',true) in ('anon','authenticated') then perform store_private.require_workspace_admin(true);end if;
 end if;
 -- The existing audit trigger records the old/new flag and authenticated actor.
 new.stock_quantities:=store_private.normalize_stock(new.stock_quantities);return new;
end $$;
revoke all on function store_private.guard_product_financial_basis() from public,anon,authenticated,service_role;
create trigger guard_product_financial_basis before insert or update on public.products for each row execute function store_private.guard_product_financial_basis();
create or replace function store_private.publication_qualified(row_data jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(row_data->>'available'='true' and length(btrim(row_data->>'brand'))>0 and length(btrim(row_data->>'name'))>0 and length(btrim(row_data->>'category'))>0 and store_private.valid_product_image(row_data->>'image_url'),false)
$$;
revoke all on function store_private.publication_qualified(jsonb) from public,anon,authenticated,service_role;
create or replace function store_private.workspace_team_secure() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform store_private.require_workspace_admin(true);return store_private.workspace_team();end $$;
revoke all on function store_private.workspace_team_secure() from public,anon,authenticated,service_role;
create or replace function public.store_workspace_team_secure() returns jsonb language sql security invoker set search_path='' as $$ select store_private.workspace_team_secure() $$;
revoke all on function public.store_workspace_team_secure() from public,anon;
grant execute on function public.store_workspace_team_secure(),store_private.workspace_team_secure() to authenticated;

CREATE OR REPLACE FUNCTION public.store_analytics_summary(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; since timestamptz;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where created_at>=since group by event)t;
 result=result||jsonb_build_object(
 'active',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=now()-interval '2 minutes'),
 'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where last_seen>=since),
 'sessions',(select count(*) from store_private.analytics_sessions where started_at>=since),
 'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from store_private.analytics_events where created_at>=since group by event)t),'{}'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(t) order by "day") from(
 select (created_at at time zone store_private.business_time_zone())::date as "day",count(distinct visitor_id) visitors,
 count(*) filter(where event='product_view') views,
 count(*) filter(where event='cart_add') cart,
 count(*) filter(where event='checkout_open' or event like 'manager_%') contacts
 from store_private.analytics_events where created_at>=since group by 1)t),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,
 count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart,
 count(*) filter(where e.event='manager_product') contacts,
 count(*) filter(where e.event='manager_search_product') search_contacts
 from store_private.analytics_events e join public.products p on p.id=e.product_id where e.created_at>=since
 group by p.id,p.brand,p.name order by count(*) filter(where e.event='product_view') desc,p.id limit 20)t),'[]'::jsonb));
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.store_analytics_summary(p_days integer, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; since timestamptz;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 if p_channel is null or p_channel not in ('website','telegram','legacy') then raise exception 'invalid analytics channel' using errcode='22023';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where channel=p_channel and created_at>=since group by event)t;
 result=result||jsonb_build_object(
 'channel',p_channel,
 'active',(select count(distinct visitor_id) from store_private.analytics_sessions where channel=p_channel and last_seen>=now()-interval '2 minutes'),
 'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where channel=p_channel and last_seen>=since),
 'sessions',(select count(*) from store_private.analytics_sessions where channel=p_channel and started_at>=since),
 'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from store_private.analytics_events where channel=p_channel and created_at>=since group by event)t),'{}'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(t) order by "day") from(
 select (created_at at time zone store_private.business_time_zone())::date as "day",count(distinct visitor_id) visitors,
 count(*) filter(where event='product_view') views,
 count(*) filter(where event='cart_add') cart,
 count(*) filter(where event='checkout_open' or event like 'manager_%') contacts
 from store_private.analytics_events where channel=p_channel and created_at>=since group by 1)t),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,
 count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart,
 count(*) filter(where e.event='manager_product') contacts,
 count(*) filter(where e.event='manager_search_product') search_contacts
 from store_private.analytics_events e join public.products p on p.id=e.product_id where e.channel=p_channel and e.created_at>=since
 group by p.id,p.brand,p.name order by count(*) filter(where e.event='product_view') desc,p.id limit 20)t),'[]'::jsonb));
 return result;
end; $function$;

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
  or p_group is null or p_group not in ('all','sales','commission','orders') then raise exception 'Проверьте период и раздел отчёта (не более 10 лет)'; end if;
 with filtered as (
  select e.*,case when expenses is not null and (case when on_commission then owner_due else purchase_cost end) is not null
   then amount-expenses-(case when on_commission then owner_due else purchase_cost end) end as margin
  from store_private.finance_entries e where merged_into is null and report_on between p_from and p_to
   and (p_group='all' or (p_group='sales' and status='completed') or (p_group='commission' and on_commission) or (p_group='orders' and (kind='order' or on_order)))
 ), page as (
  select * from filtered where p_before is null or (report_on,id)<(select report_on,id from store_private.finance_entries where id=p_before)
  order by report_on desc,id desc limit 31
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by report_on desc,id desc) from page p),'[]'::jsonb),
  'summary',(select jsonb_build_object(
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

CREATE OR REPLACE FUNCTION store_private.record_product_sale(p_operation_id uuid, p_product_id bigint, p_revision bigint, p_sold_on date, p_amount numeric, p_variant text, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.products%rowtype; previous store_private.product_sales%rowtype;
 q jsonb; stock integer; remaining integer; archive text; visible boolean; before_data jsonb; after_data jsonb; label text; sale_id bigint;
begin
 perform store_private.require_workspace_admin();
 if p_operation_id is null or p_product_id is null or p_revision is null or p_sold_on is null or p_sold_on<'2000-01-01'::date or p_sold_on>store_private.business_today()
 or p_amount is null or not(p_amount>=0 and p_amount<=999999999 and p_amount=trunc(p_amount))
 or p_variant is null or char_length(p_variant)>100 or p_quantity is null or p_quantity not between 1 and 9999 then
  raise exception 'Проверьте дату, целую сумму в EUR и количество';
 end if;
 p_variant:=store_private.normalize_variant(p_variant);
 select * into p from public.products where id=p_product_id for update;
 select * into previous from store_private.product_sales where operation_id=p_operation_id;
 if found then
  if previous.actor_id<>auth.uid() or previous.product_id<>p_product_id or previous.sold_on<>p_sold_on or previous.amount<>p_amount or store_private.normalize_variant(previous.variant)<>p_variant or previous.quantity<>p_quantity then raise exception 'Эта операция уже записана с другими данными'; end if;
  return jsonb_build_object('sale_id',previous.id::text,'product',case when p.id is null then null else to_jsonb(p) end,'already_recorded',true);
 end if;
 if p.id is null then raise exception 'Товар больше не существует'; end if;
 if p.revision<>p_revision then raise exception 'Карточка изменилась. Обновите список и повторите продажу'; end if;
 if p.archive_status='sold' then raise exception 'Вещь уже продана'; end if;
 before_data:=jsonb_build_object('available',p.available,'archive_status',p.archive_status,'reserved',p.reserved,'stock_quantities',p.stock_quantities);
 q:=store_private.normalize_stock(p.stock_quantities); visible:=p.available; archive:=p.archive_status;
 if p.archive_status='legacy' then
  -- A historical confirmation must not invent or deduct a historical balance.
  visible:=false;archive:='sold';
 else
  if q is null then
   if p_quantity<>1 then raise exception 'Сначала укажите остатки по размерам в карточке'; end if;
   -- Legacy stock semantics are one item per card until explicit quantities exist.
   visible:=false;archive:='sold';
  else
   if not(q ? p_variant) then raise exception 'Размер изменился. Обновите карточку'; end if;
   stock:=(q->>p_variant)::integer;
   if p_quantity>stock then raise exception 'Недостаточно остатка выбранного размера'; end if;
   q:=jsonb_set(q,array[p_variant],to_jsonb(stock-p_quantity));
   select coalesce(sum(value::integer),0) into remaining from jsonb_each_text(q);
   if remaining=0 then visible:=false;archive:='sold'; end if;
  end if;
 end if;
 after_data:=jsonb_build_object('available',visible,'archive_status',archive,'reserved',false,'stock_quantities',q);
 select coalesce(nullif(a.display_name,''),u.email,auth.uid()::text) into label from public.store_admins a join auth.users u on u.id=a.user_id where a.user_id=auth.uid();
 insert into store_private.product_sales(operation_id,product_id,product_label,variant,quantity,amount,sold_on,actor_id,actor_label,legacy,before_state,after_state)
 values(p_operation_id,p.id,concat_ws(' ',p.brand,p.name),p_variant,p_quantity,p_amount,p_sold_on,auth.uid(),label,p.archive_status is not distinct from 'legacy',before_data,after_data) returning id into sale_id;
 update public.products set available=visible,archive_status=archive,reserved=false,stock_quantities=q where id=p.id returning * into p;
 return jsonb_build_object('sale_id',sale_id::text,'product',to_jsonb(p));
end $function$;

CREATE OR REPLACE FUNCTION store_private.require_workspace_admin(owner_only boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.store_admins where user_id=auth.uid() and (not owner_only or access_role='owner')) or not store_private.admin_mfa_satisfied() then
  raise exception 'Доступ только для администраторов магазина' using errcode='42501';
 end if;
 if owner_only and not store_private.admin_mfa_fresh() then raise exception 'MFA_STEP_UP_REQUIRED' using errcode='PT403'; end if;
end $function$;

CREATE OR REPLACE FUNCTION store_private.save_finance_entry(p_id uuid, p_revision bigint, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e store_private.finance_entries%rowtype; previous store_private.finance_entries%rowtype; existing boolean; target_sale bigint; today date:=(now() at time zone store_private.business_time_zone())::date;
begin
 perform store_private.require_workspace_admin(true);
 if p_id is null or p_revision is null or p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Некорректная запись'; end if;
 if exists(select 1 from jsonb_object_keys(p_values) k where k not in ('product_id','product_label','status','on_commission','opened_on','completed_on','quantity','amount','received','purchase_cost','expenses','owner_due','owner_paid','owner_ref','client_ref','note')) then raise exception 'Неизвестное поле финансовой записи'; end if;
 -- Same order as the sale-void transaction: sale ledger, then finance row.
 select sale_id into target_sale from store_private.finance_entries where id=p_id;
 if target_sale is not null then perform 1 from store_private.product_sales where id=target_sale for update; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,160215));
 select * into previous from store_private.finance_entries where id=p_id for update;existing:=found;
 if p_revision<>(case when existing then previous.revision else 0 end) then raise exception 'Запись уже изменена. Обновите отчёт и откройте её заново.' using errcode='40001'; end if;
 if previous.merged_into is not null then raise exception 'Заказ связан с продажей. Редактируйте объединённую запись.'; end if;
 if existing then e:=previous;
 else e.id:=p_id;e.kind:='order';e.status:='active';e.on_order:=true;e.on_commission:=false;e.quantity:=1;e.owner_ref:='';e.client_ref:='';e.note:=''; end if;
 if e.sale_id is not null and p_values ?| array['product_id','product_label','status','on_commission','opened_on','completed_on','quantity','amount'] then
  raise exception 'Дату, сумму и статус продажи изменяют через историю продаж';
 end if;
 e:=jsonb_populate_record(e,p_values);
 if e.product_label is null or e.amount is null or e.quantity is null or e.on_commission is null or e.opened_on is null
  or e.opened_on<date '2000-01-01' or e.opened_on>today or e.completed_on>today
  or e.status is null or e.status not in ('active','completed','cancelled')
  or (e.status='active' and e.completed_on is not null) then raise exception 'Проверьте название, сумму, количество, дату и статус'; end if;
 if e.product_id is not null and (not existing or e.product_id is distinct from previous.product_id)
  and not exists(select 1 from public.products where id=e.product_id) then raise exception 'Товар с таким артикулом не найден'; end if;
 if existing then
  update store_private.finance_entries set product_id=e.product_id,product_label=btrim(e.product_label),status=e.status,on_commission=e.on_commission,
   opened_on=e.opened_on,completed_on=e.completed_on,quantity=e.quantity,amount=e.amount,received=e.received,purchase_cost=e.purchase_cost,expenses=e.expenses,
   owner_due=e.owner_due,owner_paid=e.owner_paid,owner_ref=btrim(e.owner_ref),client_ref=btrim(e.client_ref),note=btrim(e.note),
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into e;
 else
  insert into store_private.finance_entries(id,product_id,product_label,kind,status,on_commission,on_order,opened_on,completed_on,quantity,amount,received,purchase_cost,expenses,owner_due,owner_paid,owner_ref,client_ref,note,updated_by)
  values(p_id,e.product_id,btrim(e.product_label),'order',e.status,e.on_commission,true,e.opened_on,e.completed_on,e.quantity,e.amount,e.received,e.purchase_cost,e.expenses,e.owner_due,e.owner_paid,btrim(e.owner_ref),btrim(e.client_ref),btrim(e.note),auth.uid()) returning * into e;
 end if;
 return to_jsonb(e);
end $function$;

CREATE OR REPLACE FUNCTION store_private.save_upload_day(p_day date, p_manager_id uuid, p_note text, p_revision bigint, p_reset boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_row jsonb; after_row jsonb; label text; existing bigint;
begin
 perform store_private.require_workspace_admin(true);
 if p_day is null or p_day<(now() at time zone store_private.business_time_zone())::date or p_day>(now() at time zone store_private.business_time_zone())::date+366 then raise exception 'Можно менять сегодняшнее и будущее дежурство в течение года'; end if;
 if p_note is null or char_length(p_note)>300 or p_reset is null then raise exception 'Примечание: до 300 символов'; end if;
 if p_manager_id is not null then
  select coalesce(nullif(display_name,''),'Менеджер') into label from public.store_admins where user_id=p_manager_id;
  if not found then raise exception 'У менеджера нет доступа к админке'; end if;
 end if;
 perform pg_advisory_xact_lock(172605,p_day-date '2000-01-01');
 select revision,to_jsonb(d) into existing,before_row from store_private.upload_day_overrides d where day=p_day for update;
 if p_revision is distinct from coalesce(existing,0) then raise exception 'Дежурство уже изменено. Обновите расписание и повторите.' using errcode='40001'; end if;
 if p_reset then delete from store_private.upload_day_overrides where day=p_day;
 else
  insert into store_private.upload_day_overrides(day,manager_id,manager_label,note,updated_by)
  values(p_day,p_manager_id,coalesce(label,''),btrim(p_note),auth.uid()) on conflict(day) do update set manager_id=excluded.manager_id,manager_label=excluded.manager_label,note=excluded.note,revision=store_private.upload_day_overrides.revision+1,updated_at=now(),updated_by=auth.uid()
  returning to_jsonb(upload_day_overrides) into after_row;
 end if;
 insert into store_private.upload_schedule_changes(actor_id,kind,day,before_data,after_data) values(auth.uid(),case when p_reset then 'reset_day' else 'day' end,p_day,before_row,after_row);
 return jsonb_build_object('saved',true);
end $function$;

CREATE OR REPLACE FUNCTION store_private.save_upload_rotation(p_starts_on date, p_manager_ids uuid[], p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_row jsonb; after_row jsonb; labels jsonb; existing bigint;
begin
 perform store_private.require_workspace_admin(true);
 if p_starts_on is null or p_starts_on<(now() at time zone store_private.business_time_zone())::date or p_starts_on>(now() at time zone store_private.business_time_zone())::date+366 then raise exception 'Новая очередь может начинаться сегодня или в течение следующего года'; end if;
 if p_manager_ids is null or cardinality(p_manager_ids) not between 1 and 100 or array_ndims(p_manager_ids)<>1
  or array_position(p_manager_ids,null) is not null
  or cardinality(p_manager_ids)<>(select count(distinct id) from unnest(p_manager_ids) id) then raise exception 'Выберите менеджеров без повторений'; end if;
 if exists(select 1 from unnest(p_manager_ids) id where not exists(select 1 from public.store_admins a where a.user_id=id)) then raise exception 'Участник очереди должен иметь доступ к админке'; end if;
 -- Serialize same-day edits, including a first insert into an empty date.
 perform pg_advisory_xact_lock(172604,p_starts_on-date '2000-01-01');
 select revision,to_jsonb(r) into existing,before_row from store_private.upload_rotations r where starts_on=p_starts_on for update;
 if p_revision is distinct from coalesce(existing,0) then raise exception 'Очередь уже изменена. Обновите расписание и повторите.' using errcode='40001'; end if;
 select jsonb_object_agg(user_id::text,coalesce(nullif(display_name,''),'Менеджер')) into labels from public.store_admins where user_id=any(p_manager_ids);
 insert into store_private.upload_rotations(starts_on,manager_ids,manager_labels,updated_by)
 values(p_starts_on,p_manager_ids,labels,auth.uid()) on conflict(starts_on) do update set manager_ids=excluded.manager_ids,manager_labels=excluded.manager_labels,revision=store_private.upload_rotations.revision+1,updated_at=now(),updated_by=auth.uid()
 returning to_jsonb(upload_rotations) into after_row;
 insert into store_private.upload_schedule_changes(actor_id,kind,day,before_data,after_data) values(auth.uid(),'rotation',p_starts_on,before_row,after_row);
 return jsonb_build_object('saved',true);
end $function$;

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
  update public.products set available=(s.before_state->>'available')::boolean,archive_status=s.before_state->>'archive_status',reserved=false,stock_quantities=nullif(s.before_state->'stock_quantities','null'::jsonb) where id=p.id returning * into p;
 end if;
 return jsonb_build_object('product',case when p.id is null then null else to_jsonb(p) end);
end $function$;

CREATE OR REPLACE FUNCTION store_private.workspace_upload_items(p_day date, p_actor_id uuid DEFAULT NULL::uuid, p_before bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform store_private.require_workspace_admin();
 if p_day is null or p_day<date '2000-01-01' or p_day>date '2100-12-31' then raise exception 'Недопустимая дата'; end if;
 select coalesce(jsonb_agg(row_data order by id desc),'[]'::jsonb) into result from (
  select l.id,jsonb_build_object('id',l.id::text,'product_id',l.record_id,'created_at',l.changed_at,
   'actor_id',l.actor_id,'actor_label',coalesce(nullif(a.display_name,''),nullif(l.actor_label,''),case when l.actor_id is null then 'Системная загрузка' else 'Бывший сотрудник' end),
   'title',concat_ws(' ',l.after_row->>'brand',l.after_row->>'name'),'exists',p.id is not null,
   'available',p.available,'archive_status',p.archive_status) as row_data
  from store_private.store_change_log l left join public.store_admins a on a.user_id=l.actor_id
  left join public.products p on p.id=case when l.record_id~'^[0-9]{1,18}$' then l.record_id::bigint end
  where l.entity='products' and l.operation in ('INSERT','UPDATE') and store_private.publication_qualified(l.after_row)
   and exists(select 1 from store_private.store_change_log created where created.entity='products' and created.operation='INSERT' and created.record_id=l.record_id) and l.changed_at>=p_day::timestamp at time zone store_private.business_time_zone()
   and l.changed_at<(p_day+1)::timestamp at time zone store_private.business_time_zone()
   and (p_actor_id is null or l.actor_id=p_actor_id) and (p_before is null or l.id<p_before)
   and not exists(select 1 from store_private.store_change_log old where old.entity='products' and old.operation in ('INSERT','UPDATE') and store_private.publication_qualified(old.after_row) and old.record_id=l.record_id and old.id<l.id)
  order by l.id desc limit 31
 ) rows;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION store_private.workspace_upload_schedule(p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare today date:=(now() at time zone store_private.business_time_zone())::date; first_day date; last_day date; result jsonb;
begin
 perform store_private.require_workspace_admin();
 first_day:=date_trunc('month',coalesce(p_month,today))::date;
 if first_day<date '2000-01-01' or first_day>date '2100-12-01' then raise exception 'Недопустимый месяц'; end if;
 last_day:=(first_day+interval '1 month')::date;
 with uploads as (
  select (l.changed_at at time zone store_private.business_time_zone())::date as day,l.actor_id,
   coalesce(nullif(a.display_name,''),nullif(l.actor_label,''),case when l.actor_id is null then 'Системная загрузка' else 'Бывший сотрудник' end) as label,
   l.record_id,p.id is not null as kept
  from store_private.store_change_log l
  left join public.store_admins a on a.user_id=l.actor_id
  left join public.products p on p.id=case when l.record_id~'^[0-9]{1,18}$' then l.record_id::bigint end
  where l.entity='products' and l.operation in ('INSERT','UPDATE') and store_private.publication_qualified(l.after_row)
   and exists(select 1 from store_private.store_change_log created where created.entity='products' and created.operation='INSERT' and created.record_id=l.record_id)
   and l.changed_at>=first_day::timestamp at time zone store_private.business_time_zone()
   and l.changed_at<last_day::timestamp at time zone store_private.business_time_zone()
   and not exists(select 1 from store_private.store_change_log old where old.entity='products' and old.operation in ('INSERT','UPDATE') and store_private.publication_qualified(old.after_row) and old.record_id=l.record_id and old.id<l.id)
 ), counts as (
  select day,actor_id,max(label) as label,count(*) filter(where kept)::integer as count,count(*) filter(where not kept)::integer as deleted_count
  from uploads group by day,actor_id
 ), days as (
  select d.*,coalesce(c.count,0) as uploaded,coalesce(c.deleted_count,0) as deleted_count,
   coalesce((select sum(x.count) from counts x where x.day=d.day and x.actor_id is distinct from d.manager_id),0) as others
  from generate_series(0,(last_day-first_day)-1) s(n)
  cross join lateral store_private.upload_duty(first_day+s.n) d
  left join counts c on c.day=d.day and c.actor_id=d.manager_id
 )
 select jsonb_build_object(
  'today',today,'month',first_day,'time_zone',store_private.business_time_zone(),'current_user_id',auth.uid(),
  'can_manage',exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner'),
  'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from days d),'[]'::jsonb),
  'counts',coalesce((select jsonb_agg(to_jsonb(c) order by c.day,c.label) from counts c),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',coalesce(nullif(a.display_name,''),'Менеджер'),'access_role',a.access_role) order by a.display_name) from public.store_admins a),'[]'::jsonb),
  'rotations',coalesce((select jsonb_agg(to_jsonb(r) order by r.starts_on) from (select starts_on,manager_ids,manager_labels,revision from store_private.upload_rotations order by starts_on desc limit 100) r),'[]'::jsonb)
 ) into result;
 return result;
end $function$;


alter table store_private.admin_invitations add column delivery_status text not null default 'sent' check(delivery_status in ('pending','sent','failed','unknown'));
alter table store_private.admin_invitations add column delivery_operation uuid;
alter table store_private.admin_invitations add column delivery_error text;
alter table store_private.workspace_invite_attempts add column operation_id uuid unique;
alter table store_private.workspace_invite_attempts add column delivery_status text not null default 'sent' check(delivery_status in ('pending','sent','failed','unknown'));
create or replace function store_private.begin_workspace_invite(p_email text,p_name text,p_operation uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform store_private.require_workspace_admin(true);
 if p_operation is null or p_email is null or char_length(p_email)>320 or btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Укажите корректные email и имя';end if;
 perform pg_advisory_xact_lock(840120261012::bigint);
 if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email))) then raise exception 'Аккаунт уже создан. Используйте восстановление пароля и отдельное подтверждение доступа.';end if;
 if exists(select 1 from store_private.admin_invitations where email=lower(btrim(p_email)) and delivery_status='pending' and created_at>now()-interval '2 minutes') then raise exception 'Предыдущее приглашение ещё отправляется. Обновите список через две минуты.';end if;
 if (select count(*) from store_private.workspace_invite_attempts where attempted_at>now()-interval '1 hour' and delivery_status in ('sent','pending','unknown'))>=10 then raise exception 'Лимит отправки: 10 приглашений в час. Попробуйте позже.';end if;
 if (select count(*) from store_private.workspace_invite_attempts where attempted_at>now()-interval '1 hour')>=30 then raise exception 'Слишком много попыток отправки. Попробуйте через час.';end if;
 insert into store_private.workspace_invite_attempts(actor_id,operation_id,delivery_status) values(auth.uid(),p_operation,'pending');
 insert into store_private.admin_invitations(email,display_name,invited_by,created_at,expires_at,delivery_operation,delivery_status,delivery_error)
 values(lower(btrim(p_email)),btrim(p_name),auth.uid(),now(),now()+interval '7 days',p_operation,'pending',null)
 on conflict(email) do update set display_name=excluded.display_name,invited_by=excluded.invited_by,created_at=excluded.created_at,expires_at=excluded.expires_at,delivery_operation=excluded.delivery_operation,delivery_status='pending',delivery_error=null;
 return true;
end $$;
revoke all on function store_private.begin_workspace_invite(text,text,uuid) from public,anon;
create or replace function public.store_begin_workspace_invite(p_email text,p_name text,p_operation uuid) returns boolean language sql security invoker set search_path='' as $$ select store_private.begin_workspace_invite(p_email,p_name,p_operation) $$;
revoke all on function public.store_begin_workspace_invite(text,text,uuid) from public,anon;
grant execute on function public.store_begin_workspace_invite(text,text,uuid),store_private.begin_workspace_invite(text,text,uuid) to authenticated;
create or replace function store_private.finish_workspace_invite(p_operation uuid,p_status text,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('sent','failed','unknown') or p_status is null then raise exception 'Invalid delivery status';end if;
 update store_private.workspace_invite_attempts set delivery_status=p_status where operation_id=p_operation and delivery_status='pending';
 if not found then return false;end if;
 update store_private.admin_invitations set delivery_status=p_status,delivery_error=left(p_error,100) where delivery_operation=p_operation;
 return true;
end $$;
revoke all on function store_private.finish_workspace_invite(uuid,text,text) from public,anon,authenticated;
create or replace function public.store_finish_workspace_invite(p_operation uuid,p_status text,p_error text default null) returns boolean language sql security invoker set search_path='' as $$ select store_private.finish_workspace_invite(p_operation,p_status,p_error) $$;
revoke all on function public.store_finish_workspace_invite(uuid,text,text) from public,anon,authenticated;
grant execute on function public.store_finish_workspace_invite(uuid,text,text),store_private.finish_workspace_invite(uuid,text,text) to service_role;
create or replace function store_private.prepare_workspace_invite(p_email text,p_name text) returns boolean language plpgsql security definer set search_path='' as $$
begin perform store_private.require_workspace_admin(true);raise exception 'Обновите страницу перед приглашением сотрудника.';end $$;

CREATE OR REPLACE FUNCTION store_private.workspace_team()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; pending jsonb:='[]'::jsonb;
begin
 perform store_private.require_workspace_admin();
 select jsonb_build_object('current_user_id',auth.uid(),'members',coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'email',u.email,'access_role',a.access_role) order by a.access_role desc,a.display_name,u.email),'[]'::jsonb)) into result from public.store_admins a join auth.users u on u.id=a.user_id;
 if store_private.admin_mfa_fresh() and exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner') then
  select coalesce(jsonb_agg(jsonb_build_object(
   'email',i.email,'display_name',i.display_name,'delivery_status',case when i.delivery_status='pending' and i.created_at<now()-interval '2 minutes' then 'unknown' else i.delivery_status end,'delivery_error',i.delivery_error,
   'email_confirmed',u.email_confirmed_at is not null,
   'mfa_confirmed',exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp'),
   'ready',i.delivery_status in ('sent','unknown') and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp')
  ) order by i.created_at),'[]'::jsonb)
  into pending from store_private.admin_invitations i left join auth.users u on lower(u.email)=lower(i.email)
  where i.expires_at>now() and not exists(select 1 from public.store_admins a where a.user_id=u.id);
 end if;
 return result||jsonb_build_object('pending_invitations',pending);
end; $function$
;
create index store_change_log_publication_window_idx on store_private.store_change_log(changed_at,actor_id) include(record_id,id) where entity='products' and operation in ('INSERT','UPDATE');
notify pgrst,'reload schema';
commit;
