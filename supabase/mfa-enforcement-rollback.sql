-- Owner-only emergency rollback. Restores pre-migration access, weakening MFA protection.
-- Retains enforcement records and functions for recovery; deletes no user/product/upload data.
BEGIN;
DROP POLICY IF EXISTS store_mfa_product_insert ON public.products;
DROP POLICY IF EXISTS store_mfa_product_update ON public.products;
DROP POLICY IF EXISTS store_mfa_product_read ON public.products;
DROP POLICY IF EXISTS store_mfa_photo_insert ON storage.objects;
DROP POLICY IF EXISTS store_mfa_photo_read ON storage.objects;
-- Only restore these old staging settings if a trusted upload workflow actually requires them.
-- GRANT TRUNCATE, REFERENCES, TRIGGER ON public.chatgpt_upload_chunks TO anon, authenticated;
-- ALTER TABLE store_private.chatgpt_upload_chunks DISABLE ROW LEVEL SECURITY;
COMMIT;
