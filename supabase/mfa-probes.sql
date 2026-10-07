-- Synthetic identities only. All fixtures and audit records are rolled back.
BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); factor uuid:=gen_random_uuid(); fixture bigint; affected integer;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_id),(outsider);
  INSERT INTO public.store_admins(user_id) VALUES(owner_id);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1')::text,true);
  SET LOCAL ROLE authenticated;
  IF store_private.admin_mfa_satisfied() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unenrolled owner locked out'; END IF;
  BEGIN PERFORM public.enforce_store_mfa(); RAISE EXCEPTION 'AAL1 enabled enforcement'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.products(brand,name,category,currency,price,image_url,photos,available,creation_key)
  VALUES('Security probe','MFA rollback fixture','Аксессуары','EUR',null,'https://juliproz-store.vercel.app/images/security-probe.webp','[]',false,gen_random_uuid()) RETURNING id INTO fixture;
  RESET ROLE;
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES(factor,owner_id,'totp','verified',now(),now());
  SET LOCAL ROLE authenticated;
  IF store_private.admin_mfa_satisfied() IS DISTINCT FROM false THEN RAISE EXCEPTION 'AAL1 bypassed verified factor'; END IF;
  IF EXISTS(SELECT 1 FROM public.products WHERE id=fixture) THEN RAISE EXCEPTION 'AAL1 saw hidden inventory'; END IF;
  UPDATE public.products SET name='Forbidden' WHERE id=fixture;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'AAL1 updated inventory'; END IF;
  BEGIN
    INSERT INTO public.products(brand,name,category,currency,image_url,photos,available,creation_key)
    VALUES('Security probe','Forbidden','Аксессуары','EUR','https://juliproz-store.vercel.app/images/security-probe.webp','[]',true,gen_random_uuid());
    RAISE EXCEPTION 'AAL1 inserted product';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name) VALUES('product-photos',owner_id::text||'/mfa-probe.webp');
    RAISE EXCEPTION 'AAL1 uploaded photo';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
  PERFORM public.enforce_store_mfa();
  PERFORM public.enforce_store_mfa(); -- idempotent
  UPDATE public.products SET name='Allowed MFA edit' WHERE id=fixture;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'AAL2 unable to edit'; END IF;
  INSERT INTO storage.objects(bucket_id,name) VALUES('product-photos',owner_id::text||'/mfa-probe.webp');
  BEGIN DELETE FROM store_private.admin_mfa_enforcement WHERE user_id=owner_id; RAISE EXCEPTION 'Client removed enforcement'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  DELETE FROM auth.mfa_factors WHERE id=factor;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1')::text,true);
  SET LOCAL ROLE authenticated;
  IF store_private.admin_mfa_satisfied() IS DISTINCT FROM false THEN RAISE EXCEPTION 'Factor deletion downgraded protection'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true);
  BEGIN PERFORM public.enforce_store_mfa(); RAISE EXCEPTION 'Nonadmin enrolled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.products SET name='Nonadmin write' WHERE id=fixture;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'MFA bypassed membership'; END IF;
  RESET ROLE;
  IF has_table_privilege('anon','public.chatgpt_upload_chunks','TRUNCATE') OR has_table_privilege('authenticated','public.chatgpt_upload_chunks','TRUNCATE') THEN RAISE EXCEPTION 'Excess grants remain'; END IF;
END $$;
SELECT 'PASS: enrollment gating, AAL1 denial, AAL2 writes/uploads, sticky protection, membership isolation, staging grants; fixtures rolled back' AS verification;
ROLLBACK;
