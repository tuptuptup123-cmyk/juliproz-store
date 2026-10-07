-- Additive, opt-in MFA enforcement. Existing unenrolled administrators retain access.
-- Existing membership policies, invitations, products and upload data are preserved.
BEGIN;
CREATE TABLE store_private.admin_mfa_enforcement (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enforced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE store_private.admin_mfa_enforcement ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.admin_mfa_enforcement FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION store_private.admin_mfa_satisfied() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    auth.jwt()->>'aal' = 'aal2' OR (
      NOT EXISTS (SELECT 1 FROM store_private.admin_mfa_enforcement WHERE user_id=auth.uid())
      AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified')
    )
  );
$$;
REVOKE ALL ON FUNCTION store_private.admin_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION store_private.admin_mfa_satisfied() TO authenticated;

CREATE FUNCTION store_private.enforce_own_admin_mfa() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
     OR NOT EXISTS (SELECT 1 FROM public.store_admins WHERE user_id=auth.uid())
     OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified') THEN
    RAISE EXCEPTION 'Verified administrator MFA required' USING ERRCODE='42501';
  END IF;
  INSERT INTO store_private.admin_mfa_enforcement(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION store_private.enforce_own_admin_mfa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION store_private.enforce_own_admin_mfa() TO authenticated;
CREATE FUNCTION public.enforce_store_mfa() RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT store_private.enforce_own_admin_mfa();
$$;
REVOKE ALL ON FUNCTION public.enforce_store_mfa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_store_mfa() TO authenticated;

CREATE POLICY store_mfa_product_insert ON public.products AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT store_private.admin_mfa_satisfied()));
CREATE POLICY store_mfa_product_update ON public.products AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT store_private.admin_mfa_satisfied())) WITH CHECK ((SELECT store_private.admin_mfa_satisfied()));
CREATE POLICY store_mfa_product_read ON public.products AS RESTRICTIVE FOR SELECT TO authenticated
  USING (available=true OR (SELECT store_private.admin_mfa_satisfied()));
CREATE POLICY store_mfa_photo_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'product-photos' OR (SELECT store_private.admin_mfa_satisfied()));
CREATE POLICY store_mfa_photo_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'product-photos' OR (SELECT store_private.admin_mfa_satisfied()));

-- Remove only the six confirmed excess privileges; trusted upload workers retain access.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.chatgpt_upload_chunks FROM anon, authenticated;
ALTER TABLE store_private.chatgpt_upload_chunks ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
COMMIT;
