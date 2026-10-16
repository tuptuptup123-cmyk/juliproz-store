-- FRESH SUPABASE PROJECT ONLY, after canonical baseline + migrations.
-- No credentials or application rows are exported from production.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
insert into store_private.analytics_secret(singleton,seed)
values(true,extensions.gen_random_bytes(32)) on conflict do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-photos','product-photos',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
select cron.schedule('store-analytics-retention','15 20 * * *',$cron$SET statement_timeout='120s'; SELECT store_private.purge_analytics_history();$cron$);
-- The application owner and secret hashes MUST be provisioned separately.
-- Set ANALYTICS_INGEST_SECRET and TELEGRAM_LIMIT_SECRET to independent new 32-byte hex values.
-- Insert their SHA256(UTF8(hex value)) into analytics_gateway_secret.secret_hash (singleton=true)
-- and telegram_limit_secret.secret_hash (id=true), respectively, via a parameterized private connection.
-- Provision the first owner using an Auth user with confirmed email and verified TOTP.
-- Do not run historical root-level SQL or all old migrations on this baseline.
