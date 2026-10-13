-- All fixture writes, including cleanup and limiter changes, roll back on success.
DO $$
DECLARE actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); foreign_sid uuid:=gen_random_uuid();
 fixture bigint; affected integer; value jsonb; old_event uuid:=gen_random_uuid(); recent_event uuid:=gen_random_uuid(); old_session uuid:=gen_random_uuid(); recent_session uuid:=gen_random_uuid();
 visitor uuid:=gen_random_uuid(); secret text:=repeat('b',64); fingerprint text:=repeat('c',64);
BEGIN
 BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(actor,actor||'@example.invalid',now()),(outsider,outsider||'@example.invalid',now());
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(sid,actor,now(),now()),(foreign_sid,outsider,now(),now());
 INSERT INTO public.store_admins(user_id,display_name,access_role) VALUES(actor,'Session boundary probe','owner');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2','session_id',sid)::text,true);
 SET LOCAL ROLE authenticated;
 value:=public.touch_store_admin_session();
 IF (value->>'expires_at')::timestamptz<>(now()+interval '7 days') THEN RAISE EXCEPTION 'Incorrect absolute deadline';END IF;
 IF NOT store_private.admin_session_active() THEN RAISE EXCEPTION 'Fresh session denied';END IF;
 INSERT INTO public.products(brand,name,category,currency,image_url,photos,available,creation_key)
 VALUES('Security probe','Rollback session boundary','Аксессуары','EUR','https://juliproz-store.vercel.app/images/security-probe.webp','[]',false,gen_random_uuid()) RETURNING id INTO fixture;
 INSERT INTO public.product_admin_notes(product_id,note) VALUES(fixture,'Rollback private note');
 RESET ROLE;
 -- Six idle days remain valid; activity is neither needed nor recorded.
 UPDATE auth.sessions SET created_at=now()-interval '6 days' WHERE id=sid;
 INSERT INTO store_private.admin_session_activity(session_id,last_seen) VALUES(sid,now()-interval '6 days') ON CONFLICT(session_id) DO UPDATE SET last_seen=excluded.last_seen;
 SET LOCAL ROLE authenticated;
 IF NOT store_private.admin_session_active() THEN RAISE EXCEPTION 'Idle session denied before seven days';END IF;
 value:=public.touch_store_admin_session();
 IF value->>'idle_expires_at' IS NOT NULL THEN RAISE EXCEPTION 'Idle timeout remains enabled';END IF;
 RESET ROLE;
 -- Exact seven-day boundary remains denied even with a freshly refreshed token.
 UPDATE auth.sessions SET created_at=now()-interval '7 days' WHERE id=sid;
 UPDATE auth.sessions SET refreshed_at=now() WHERE id=sid;
 SET LOCAL ROLE authenticated;
 IF store_private.admin_session_active() THEN RAISE EXCEPTION 'Token refresh revived expired week';END IF;
 BEGIN PERFORM public.touch_store_admin_session();RAISE EXCEPTION 'Deadline check revived expired week';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.products WHERE id=fixture) OR EXISTS(SELECT 1 FROM public.product_admin_notes WHERE product_id=fixture) THEN RAISE EXCEPTION 'Expired session read private records';END IF;
 UPDATE public.products SET name='Forbidden expired edit' WHERE id=fixture;GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Expired session wrote inventory';END IF;
 BEGIN PERFORM public.store_workspace_history();RAISE EXCEPTION 'Expired session read history';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 UPDATE store_private.admin_session_activity SET last_seen=now() WHERE session_id=sid;
 UPDATE auth.sessions SET created_at=now()-interval '7 days' WHERE id=sid;
 SET LOCAL ROLE authenticated;
 IF store_private.admin_session_active() THEN RAISE EXCEPTION 'Absolute expiry ignored';END IF;
 BEGIN PERFORM public.touch_store_admin_session();RAISE EXCEPTION 'Absolute expiry revived';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;UPDATE auth.sessions SET created_at=now() WHERE id=sid;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2','session_id',foreign_sid)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.touch_store_admin_session();RAISE EXCEPTION 'Foreign session heartbeat accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2','session_id',foreign_sid)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.touch_store_admin_session();RAISE EXCEPTION 'Uninvited account heartbeat accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 INSERT INTO store_private.admin_invitations(email,display_name,invited_by,expires_at) VALUES(outsider||'@example.invalid','Pending probe',actor,now()+interval '1 day');
 SET LOCAL ROLE authenticated;
 value:=public.touch_store_admin_session();
 IF (public.store_admin_security_status()->>'pending') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Pending onboarding denied';END IF;
 IF EXISTS(SELECT 1 FROM public.products WHERE id=fixture) THEN RAISE EXCEPTION 'Pending account read hidden inventory';END IF;
 RESET ROLE;
 DELETE FROM auth.sessions WHERE id=sid;
 IF EXISTS(SELECT 1 FROM store_private.admin_session_activity WHERE session_id=sid) THEN RAISE EXCEPTION 'Session activity survived revocation';END IF;
 -- Retention removes only expired events/sessions; recent rows and business data survive.
 INSERT INTO store_private.analytics_events(event_id,visitor_id,session_id,event,created_at) VALUES(old_event,visitor,old_session,'visit',now()-interval '91 days'),(recent_event,visitor,recent_session,'visit',now()-interval '89 days');
 INSERT INTO store_private.analytics_sessions(session_id,visitor_id,started_at,last_seen) VALUES(old_session,visitor,now()-interval '91 days',now()-interval '91 days'),(recent_session,visitor,now()-interval '89 days',now()-interval '89 days');
 value:=store_private.purge_analytics_history();
 IF EXISTS(SELECT 1 FROM store_private.analytics_events WHERE event_id=old_event) OR EXISTS(SELECT 1 FROM store_private.analytics_sessions WHERE session_id=old_session) THEN RAISE EXCEPTION 'Old analytics retained';END IF;
 IF NOT EXISTS(SELECT 1 FROM store_private.analytics_events WHERE event_id=recent_event) OR NOT EXISTS(SELECT 1 FROM store_private.analytics_sessions WHERE session_id=recent_session) OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=fixture) THEN RAISE EXCEPTION 'Retention deleted current/business data';END IF;
 INSERT INTO store_private.analytics_gateway_secret VALUES(true,sha256(convert_to(secret,'UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash;
 SET LOCAL ROLE anon;
 BEGIN PERFORM public.store_analytics_gateway_ingest('wrong',gen_random_uuid(),visitor,recent_session,'visit',null,null,fingerprint);RAISE EXCEPTION 'Gateway accepted wrong secret';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF NOT public.store_analytics_gateway_ingest(secret,gen_random_uuid(),visitor,recent_session,'visit',null,null,fingerprint) THEN RAISE EXCEPTION 'Gateway rejected valid event';END IF;
 IF public.store_analytics_gateway_ingest(secret,gen_random_uuid(),visitor,recent_session,'invented',null,null,fingerprint) THEN RAISE EXCEPTION 'Gateway accepted invalid event';END IF;
 RESET ROLE;
 IF has_function_privilege('anon','public.store_analytics_ingest(uuid,uuid,uuid,text,bigint,text,text)','execute') THEN RAISE EXCEPTION 'Direct ingestion exposed';END IF;
 IF has_table_privilege('anon','store_private.analytics_gateway_secret','select') OR has_table_privilege('authenticated','store_private.admin_session_activity','update') THEN RAISE EXCEPTION 'Private state exposed';END IF;
 IF has_function_privilege('authenticated','store_private.purge_analytics_history()','execute') OR exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='net' and p.proname like 'http_%' and has_function_privilege('anon',p.oid,'execute')) THEN RAISE EXCEPTION 'Privileged maintenance exposed';END IF;
 RESET ROLE;
 RAISE EXCEPTION 'fixtures rolled back' USING ERRCODE='JP001';
 EXCEPTION WHEN SQLSTATE 'JP001' THEN NULL;
 END;
END; $$;
SELECT 'PASS: session deadlines, refresh cannot revive, private RLS, pending onboarding, retention and gateway capability; fixtures rolled back' AS verification;
