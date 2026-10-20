-- Bound operational history without deleting inventory, sales, audit history or photos.
begin;
create or replace function store_private.operational_retention()
returns void language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
begin
 delete from store_private.admin_bff_sessions where expires_at<=now();
 delete from store_private.operational_limits where window_at<now()-interval '2 days';
 -- An in-flight delivery owns its lease even when the queue item is old.
 update store_private.bot_outbox set state='failed',payload=null,finished_at=now(),error_code='expired',lease=null,lease_until=null
 where state in ('pending','retry','sending') and created_at<now()-interval '24 hours'
  and (lease_until is null or lease_until<=now());
 delete from store_private.bot_outbox where created_at<now()-interval '7 days' and state in ('delivered','failed');
 delete from store_private.client_errors where bucket_at<now()-interval '30 days';
 -- Also expire counters during quiet periods; admission already uses these cutoffs.
 delete from store_private.telegram_limit_updates where expires_at<=now();
 delete from store_private.telegram_limit_chats where window_start<date_trunc('minute',now());
 delete from store_private.telegram_limit_chat_days where day_start<(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');
 -- Keep this job's completed history for 30 days. Do not touch other jobs.
 delete from cron.job_run_details where jobid in
  (select jobid from cron.job where jobname='store-operational-retention')
  and end_time<now()-interval '30 days';
end $$;
revoke all on function store_private.operational_retention() from public,anon,authenticated,service_role;
commit;
