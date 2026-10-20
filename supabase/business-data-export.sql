-- Core business rows only. Run read-only; never export credentials through this query.
-- One SQL statement uses one consistent MVCC snapshot across all listed tables.
select jsonb_build_object(
 'format_version',2,'created_at',now(),'complete_live_system_backup',false,
 'excluded',jsonb_build_array('Auth and MFA credentials','Storage file bytes','server secrets','sessions and queues','analytics','catalogue change history'),
 'tables',jsonb_build_object(
  'public.products',coalesce((select jsonb_agg(to_jsonb(t)) from public.products t),'[]'::jsonb),
  'public.product_admin_notes',coalesce((select jsonb_agg(to_jsonb(t)) from public.product_admin_notes t),'[]'::jsonb),
  'public.store_admins',coalesce((select jsonb_agg(to_jsonb(t)) from public.store_admins t),'[]'::jsonb),
  'store_private.product_sales',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.product_sales t),'[]'::jsonb),
  'store_private.finance_entries',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.finance_entries t),'[]'::jsonb),
  'store_private.finance_changes',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.finance_changes t),'[]'::jsonb),
  'store_private.commission_terms',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.commission_terms t),'[]'::jsonb),
  'store_private.monthly_capital',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.monthly_capital t),'[]'::jsonb),
  'store_private.product_costs',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.product_costs t),'[]'::jsonb),
  'store_private.upload_rotations',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.upload_rotations t),'[]'::jsonb),
  'store_private.upload_day_overrides',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.upload_day_overrides t),'[]'::jsonb),
  'store_private.upload_schedule_changes',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.upload_schedule_changes t),'[]'::jsonb),
  'store_private.product_archive_migration_backup',coalesce((select jsonb_agg(to_jsonb(t)) from store_private.product_archive_migration_backup t),'[]'::jsonb)
 )) as snapshot;
