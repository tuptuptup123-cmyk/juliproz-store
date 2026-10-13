-- Only the owner sees invitation progress. Existing membership/MFA gates are unchanged.
CREATE OR REPLACE FUNCTION store_private.workspace_team()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare result jsonb; pending jsonb:='[]'::jsonb;
begin
 perform store_private.require_workspace_admin();
 select jsonb_build_object('current_user_id',auth.uid(),'members',coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'email',u.email,'access_role',a.access_role) order by a.access_role desc,a.display_name,u.email),'[]'::jsonb)) into result from public.store_admins a join auth.users u on u.id=a.user_id;
 if exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner') then
  select coalesce(jsonb_agg(jsonb_build_object(
   'email',i.email,'display_name',i.display_name,
   'email_confirmed',u.email_confirmed_at is not null,
   'mfa_confirmed',exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp'),
   'ready',u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp')
  ) order by i.created_at),'[]'::jsonb)
  into pending from store_private.admin_invitations i left join auth.users u on lower(u.email)=lower(i.email)
  where i.expires_at>now() and not exists(select 1 from public.store_admins a where a.user_id=u.id);
 end if;
 return result||jsonb_build_object('pending_invitations',pending);
end; $$;

-- Verify progress, access boundaries and approval using disposable fixtures.
-- The exception rolls back all fixture changes, including successful probes.
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); invite_id uuid:=gen_random_uuid();
 os uuid:=gen_random_uuid(); ss uuid:=gen_random_uuid(); ins uuid:=gen_random_uuid(); factor_id uuid:=gen_random_uuid();
 invite_email text:=invite_id::text||'@example.invalid'; result jsonb; progress jsonb;
BEGIN
 BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(owner_id,owner_id::text||'@example.invalid',now()),(staff_id,staff_id::text||'@example.invalid',now()),(invite_id,invite_email,null);
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(os,owner_id,now(),now()),(ss,staff_id,now(),now()),(ins,invite_id,now(),now());
  INSERT INTO public.store_admins(user_id,display_name,access_role) VALUES(owner_id,'Progress probe owner','owner'),(staff_id,'Progress probe staff','admin');
  INSERT INTO store_private.admin_invitations(email,display_name,invited_by) VALUES(invite_email,'Progress probe invite',owner_id);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',os)::text,true);
  SET LOCAL ROLE authenticated;
  SELECT value INTO progress FROM jsonb_array_elements(public.store_workspace_team()->'pending_invitations') WHERE value->>'email'=invite_email;
  IF progress IS NULL OR progress->>'email_confirmed'<>'false' OR progress->>'mfa_confirmed'<>'false' OR progress->>'ready'<>'false' THEN RAISE EXCEPTION 'Initial progress incorrect';END IF;
  RESET ROLE;
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=invite_id;
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES(factor_id,invite_id,'totp','unverified',now(),now());
  SET LOCAL ROLE authenticated;
  SELECT value INTO progress FROM jsonb_array_elements(public.store_workspace_team()->'pending_invitations') WHERE value->>'email'=invite_email;
  IF progress->>'email_confirmed'<>'true' OR progress->>'mfa_confirmed'<>'false' OR progress->>'ready'<>'false' THEN RAISE EXCEPTION 'Email-only progress incorrect';END IF;
  BEGIN PERFORM public.store_add_workspace_admin(invite_email,'Progress probe invite');RAISE EXCEPTION 'Unverified MFA admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Unverified MFA admitted' THEN RAISE;END IF;END;
  RESET ROLE;
  UPDATE auth.mfa_factors SET status='verified' WHERE id=factor_id;
  SET LOCAL ROLE authenticated;
  SELECT value INTO progress FROM jsonb_array_elements(public.store_workspace_team()->'pending_invitations') WHERE value->>'email'=invite_email;
  IF progress->>'email_confirmed'<>'true' OR progress->>'mfa_confirmed'<>'true' OR progress->>'ready'<>'true' THEN RAISE EXCEPTION 'Ready progress incorrect';END IF;
  RESET ROLE;
  UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=invite_id;
  SET LOCAL ROLE authenticated;
  SELECT value INTO progress FROM jsonb_array_elements(public.store_workspace_team()->'pending_invitations') WHERE value->>'email'=invite_email;
  IF progress->>'ready'<>'false' THEN RAISE EXCEPTION 'Banned account shown as ready';END IF;
  RESET ROLE;
  UPDATE auth.users SET banned_until=null WHERE id=invite_id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',ss)::text,true);
  SET LOCAL ROLE authenticated;
  IF jsonb_array_length(public.store_workspace_team()->'pending_invitations')<>0 THEN RAISE EXCEPTION 'Staff saw invitation progress';END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',invite_id,'role','authenticated','aal','aal2','session_id',ins)::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.store_workspace_team();RAISE EXCEPTION 'Invitee read team';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1','session_id',os)::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.store_workspace_team();RAISE EXCEPTION 'AAL1 read progress';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',os)::text,true);
  SET LOCAL ROLE authenticated;
  result:=public.store_add_workspace_admin(invite_email,'Progress probe invite');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'members') WHERE value->>'user_id'=invite_id::text) THEN RAISE EXCEPTION 'Ready approval failed';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'pending_invitations') WHERE value->>'email'=invite_email) THEN RAISE EXCEPTION 'Approved invite still pending';END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.store_workspace_team();RAISE EXCEPTION 'Anonymous read progress';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  RAISE EXCEPTION USING ERRCODE='JP000',MESSAGE='Invitation progress probes passed';
 EXCEPTION WHEN SQLSTATE 'JP000' THEN NULL;
 END;
END $$;
