-- Fixed 30-day administrative login. Activity and token refresh never extend it.
-- Existing membership, MFA, account revocation and server not_after checks remain.
CREATE OR REPLACE FUNCTION store_private.admin_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid()
   AND s.created_at>now()-interval '30 days'
   AND (s.not_after IS NULL OR s.not_after>now())
   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
 );
$$;

CREATE OR REPLACE FUNCTION store_private.touch_own_admin_session()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE s auth.sessions%ROWTYPE; t timestamptz; deadline timestamptz;
BEGIN
 -- Lock the actual caller's session; do not accept a client-selected session ID or time.
 SELECT ss.* INTO s FROM auth.sessions ss JOIN auth.users u ON u.id=ss.user_id
 WHERE ss.id::text=auth.jwt()->>'session_id' AND ss.user_id=auth.uid()
 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
 FOR UPDATE OF ss;
 t:=clock_timestamp();
 IF s.id IS NULL OR s.created_at IS NULL THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501';END IF;
 deadline:=least(s.created_at+interval '30 days',s.not_after);
 IF deadline<=t THEN
  RAISE EXCEPTION 'Session expired; sign in again' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_admins WHERE user_id=s.user_id)
 AND NOT EXISTS(SELECT 1 FROM auth.users u JOIN store_private.admin_invitations i ON lower(i.email)=lower(u.email)
  WHERE u.id=s.user_id AND u.email_confirmed_at IS NOT NULL AND i.expires_at>t) THEN
  RAISE EXCEPTION 'Administrator or current invitation required' USING ERRCODE='42501';
 END IF;
 INSERT INTO store_private.admin_session_activity(session_id,last_seen) VALUES(s.id,t)
 ON CONFLICT(session_id) DO UPDATE SET last_seen=greatest(admin_session_activity.last_seen,excluded.last_seen);
 RETURN jsonb_build_object('server_now',t,'expires_at',deadline,'idle_expires_at',deadline);
END; $$;
