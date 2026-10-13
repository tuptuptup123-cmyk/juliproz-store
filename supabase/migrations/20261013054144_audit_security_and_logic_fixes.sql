-- Audit fixes. No production products/users are deleted or repriced.
ALTER TABLE store_private.admin_invitations ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE store_private.admin_invitations ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE store_private.admin_invitations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE store_private.admin_invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days';
DROP POLICY IF EXISTS "Auth reads admin invitations" ON store_private.admin_invitations;
REVOKE ALL ON store_private.admin_invitations FROM supabase_auth_admin;
REVOKE INSERT ON public.store_admins FROM supabase_auth_admin;
REVOKE MAINTAIN ON public.products FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION store_private.prepare_workspace_invite(p_email text,p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
begin
 perform store_private.require_workspace_admin(true);
 if p_email is null or char_length(p_email)>320 or btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Укажите корректные email и имя';end if;
 if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email))) then raise exception 'Аккаунт уже существует. Используйте восстановление пароля и отдельное подтверждение доступа.';end if;
 perform pg_advisory_xact_lock(840120261012::bigint);
 if (select count(*) from store_private.workspace_invite_attempts where attempted_at>now()-interval '1 hour')>=10 then raise exception 'Лимит приглашений: 10 в час. Попробуйте позже.';end if;
 insert into store_private.workspace_invite_attempts(actor_id) values(auth.uid());
 insert into store_private.admin_invitations(email,display_name,invited_by,created_at,expires_at)
 values(lower(btrim(p_email)),btrim(p_name),auth.uid(),now(),now()+interval '7 days')
 on conflict(email) do update set display_name=excluded.display_name,invited_by=excluded.invited_by,created_at=excluded.created_at,expires_at=excluded.expires_at;
 return true;
end; $$;

CREATE OR REPLACE FUNCTION store_private.add_workspace_admin(p_email text,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare target uuid;
begin
 perform store_private.require_workspace_admin(true);
 if p_email is null or char_length(p_email)>320 or p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Укажите email и имя администратора';end if;
 select u.id into target from auth.users u where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp');
 if target is null then raise exception 'Сотрудник должен подтвердить почту и настроить MFA до предоставления доступа';end if;
 if exists(select 1 from public.store_admins where user_id=target) then raise exception 'У этого аккаунта уже есть доступ';end if;
 insert into public.store_admins(user_id,display_name,access_role) values(target,btrim(p_name),'admin');
 delete from store_private.admin_invitations where lower(email)=lower(btrim(p_email));
 return store_private.workspace_team();
end; $$;

CREATE OR REPLACE FUNCTION store_private.own_admin_security_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare own_role text;
begin
 if not store_private.admin_session_active() then raise exception 'Active session required' using errcode='42501';end if;
 select access_role into own_role from public.store_admins where user_id=auth.uid();
 if own_role is not null then return jsonb_build_object('paused',exists(select 1 from store_private.admin_mfa_pauses where user_id=auth.uid()),'pending',false,'access_role',own_role);end if;
 if exists(select 1 from auth.users u join store_private.admin_invitations i on lower(i.email)=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null and i.expires_at>now()) then
 return jsonb_build_object('paused',false,'pending',true,'access_role',null);end if;
 raise exception 'Administrator or current invitation required' using errcode='42501';
end; $$;

CREATE OR REPLACE FUNCTION store_private.workspace_team()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare result jsonb; pending jsonb:='[]'::jsonb;
begin
 perform store_private.require_workspace_admin();
 select jsonb_build_object('current_user_id',auth.uid(),'members',coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'email',u.email,'access_role',a.access_role) order by a.access_role desc,a.display_name,u.email),'[]'::jsonb)) into result from public.store_admins a join auth.users u on u.id=a.user_id;
 if exists(select 1 from public.store_admins where user_id=auth.uid() and access_role='owner') then
 select coalesce(jsonb_agg(jsonb_build_object('email',i.email,'display_name',i.display_name,'ready',u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp')) order by i.created_at),'[]'::jsonb)
 into pending from store_private.admin_invitations i left join auth.users u on lower(u.email)=lower(i.email)
 where i.expires_at>now() and not exists(select 1 from public.store_admins a where a.user_id=u.id);
 end if;
 return result||jsonb_build_object('pending_invitations',pending);
end; $$;

DROP POLICY IF EXISTS store_owner_product_delete ON public.products;
CREATE POLICY store_owner_product_delete ON public.products AS RESTRICTIVE FOR DELETE TO authenticated
USING (exists(select 1 from public.store_admins where user_id=(select auth.uid()) and access_role='owner'));

CREATE OR REPLACE FUNCTION store_private.valid_product_image(value text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 select value ~ '^https://(juliproz-store[.]vercel[.]app/images/|qhgzzhgxwpcctafpzjid[.]supabase[.]co/storage/v1/object/public/product-photos/)[A-Za-z0-9._/-]+$' and value !~ '/[.][.](/|$)';
$$;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_discount_price_check;
ALTER TABLE public.products ADD CONSTRAINT products_discount_price_check CHECK(original_price is null or (price is not null and price>=0 and original_price>price and original_price<'Infinity'::numeric and round(original_price)>round(price)));

CREATE TABLE store_private.telegram_limit_chat_days(
 chat_hash text NOT NULL,kind text NOT NULL,day_start timestamptz NOT NULL,count integer NOT NULL,
 PRIMARY KEY(chat_hash,kind)
);
CREATE INDEX telegram_limit_chat_days_expiry ON store_private.telegram_limit_chat_days(day_start);
ALTER TABLE store_private.telegram_limit_chat_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.telegram_limit_chat_days FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION store_private.consume_telegram_update(p_chat_hash text, p_update_id bigint, p_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  t timestamptz; m timestamptz; d timestamptz;
  g store_private.telegram_limit_global%ROWTYPE;
  c integer; cap integer; daily_count integer;
BEGIN
  IF p_chat_hash IS NULL OR p_chat_hash !~ '^[a-f0-9]{64}$' OR p_update_id IS NULL
    OR p_update_id < 0 OR p_update_id > 9007199254740991
    OR p_kind IS NULL OR p_kind NOT IN ('message','callback') THEN
    RAISE EXCEPTION 'Invalid limiter input' USING ERRCODE='22023';
  END IF;
  -- One row serializes all replicas and prevents overshoot under concurrent requests.
  SELECT * INTO STRICT g FROM store_private.telegram_limit_global WHERE id=true FOR UPDATE;
  t := clock_timestamp();
  m := date_trunc('minute',t); d := date_trunc('day',t AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  DELETE FROM store_private.telegram_limit_updates WHERE expires_at <= t;
  DELETE FROM store_private.telegram_limit_chats WHERE window_start < m;
  IF EXISTS(SELECT 1 FROM store_private.telegram_limit_updates WHERE update_id=p_update_id) THEN RETURN false; END IF;
  IF g.minute_start <> m THEN g.minute_start:=m; g.minute_count:=0; END IF;
  IF g.day_start <> d THEN g.day_start:=d; g.day_count:=0; END IF;
  IF g.minute_count >= 600 OR g.day_count >= 20000 THEN RETURN false; END IF;
  SELECT count INTO c FROM store_private.telegram_limit_chats WHERE chat_hash=p_chat_hash AND kind=p_kind;
  cap := CASE WHEN p_kind='message' THEN 5 ELSE 30 END;
  IF coalesce(c,0) >= cap THEN RETURN false; END IF;
  SELECT count INTO daily_count FROM store_private.telegram_limit_chat_days WHERE chat_hash=p_chat_hash AND kind=p_kind AND day_start=d;
  IF coalesce(daily_count,0) >= (CASE WHEN p_kind='message' THEN 100 ELSE 500 END) THEN RETURN false; END IF;
  INSERT INTO store_private.telegram_limit_chat_days AS c VALUES(p_chat_hash,p_kind,d,1)
    ON CONFLICT(chat_hash,kind) DO UPDATE SET day_start=excluded.day_start,
      count=CASE WHEN c.day_start=excluded.day_start THEN c.count+1 ELSE 1 END;
  DELETE FROM store_private.telegram_limit_chat_days WHERE day_start<d;
  INSERT INTO store_private.telegram_limit_updates VALUES(p_update_id,t+interval '24 hours');
  INSERT INTO store_private.telegram_limit_chats VALUES(p_chat_hash,p_kind,m,1)
    ON CONFLICT(chat_hash,kind) DO UPDATE SET count=telegram_limit_chats.count+1;
  UPDATE store_private.telegram_limit_global SET minute_start=m, minute_count=g.minute_count+1,
    day_start=d, day_count=g.day_count+1 WHERE id=true;
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier') or p_visitor is null or p_session is null or p_event_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then return false;end if;
 if p_event is null or (p_page is not null and p_page not in ('catalog','wishlist','cart')) then return false;end if;
 if p_event in ('product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','manager_product','manager_search_product') and p_product is null then return false;end if;
 if p_product is not null and not exists(select 1 from public.products where id=p_product and available=true) then return false;end if;

 begin
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return true;end if;
 foreach k in array array['ip:'||p_fingerprint,'visitor:'||p_visitor::text,'global:minute','global:day:'||current_date::text,'ip:day:'||current_date::text||':'||p_fingerprint] loop
  insert into store_private.analytics_limits as l(key,window_at,hits) values(k,case when k like 'global:day:%' or k like 'ip:day:%' then date_trunc('day',now()) else date_trunc('minute',now()) end,1)
  on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
  if n>(case when k='global:minute' then 2400 when k like 'global:day:%' then 250000 when k like 'ip:day:%' then 20000 when k like 'ip:%' then 600 else 120 end) then raise exception using errcode='JP429',message='analytics refused';end if;
 end loop;
 new_session:=not exists(select 1 from store_private.analytics_sessions where session_id=p_session);
 if new_session then
  foreach k in array array['sessions:global','sessions:ip:'||p_fingerprint] loop
   insert into store_private.analytics_limits as l(key,window_at,hits) values(k,date_trunc('minute',now()),1)
   on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then l.hits+1 else 1 end returning hits into n;
   if n>(case when k='sessions:global' then 300 else 150 end) then raise exception using errcode='JP429',message='analytics refused';end if;
  end loop;
 end if;
 insert into store_private.analytics_sessions as s(session_id,visitor_id) values(p_session,p_visitor) on conflict(session_id) do update set last_seen=now() where s.visitor_id=excluded.visitor_id;
 if not found then raise exception using errcode='JP429',message='analytics refused';end if;
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page) on conflict(event_id) do nothing;end if;
 -- Bounded retention; cleanup on a small fraction of traffic.
 if random()<0.01 then
  delete from store_private.analytics_limits where window_at<now()-interval '1 day';
  delete from store_private.analytics_events where created_at<now()-interval '90 days';
  delete from store_private.analytics_sessions where last_seen<now()-interval '90 days';
 end if;
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;

CREATE OR REPLACE FUNCTION store_private.own_analytics_health()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
begin
 perform store_private.require_workspace_admin();
 return exists(select 1 from store_private.analytics_limits where
 (key='global:minute' and window_at=date_trunc('minute',now()) and hits>=1920) or
 (key='global:day:'||current_date::text and window_at=date_trunc('day',now()) and hits>=200000) or
 (key like 'ip:day:'||current_date::text||':%' and window_at=date_trunc('day',now()) and hits>=16000) or
 (key='sessions:global' and window_at=date_trunc('minute',now()) and hits>=240));
end; $$;
CREATE FUNCTION store_private.own_bot_health()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
begin
 perform store_private.require_workspace_admin();
 return exists(select 1 from store_private.telegram_limit_global where
 (minute_start=date_trunc('minute',now()) and minute_count>=480) or
 (day_start=date_trunc('day',now()) and day_count>=16000));
end; $$;
REVOKE ALL ON FUNCTION store_private.own_bot_health() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION store_private.own_bot_health() TO authenticated;
CREATE FUNCTION public.store_bot_health() RETURNS boolean LANGUAGE sql SET search_path='' AS $$select store_private.own_bot_health();$$;
REVOKE ALL ON FUNCTION public.store_bot_health() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_bot_health() TO authenticated;
-- Acceptance fixtures use a subtransaction; success also rolls back all fixtures.
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); pending_id uuid:=gen_random_uuid();
 os uuid:=gen_random_uuid(); ss uuid:=gen_random_uuid(); ps uuid:=gen_random_uuid();
 fixture bigint; affected integer; target_email text:=gen_random_uuid()::text||'@example.invalid'; result jsonb;
 hash text:=encode(sha256(gen_random_uuid()::text::bytea),'hex'); visitor uuid:=gen_random_uuid(); sess uuid:=gen_random_uuid();
BEGIN
 BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(owner_id,owner_id::text||'@example.invalid',now()),(staff_id,staff_id::text||'@example.invalid',now()),(pending_id,target_email,now());
 INSERT INTO auth.sessions(id,user_id) VALUES(os,owner_id),(ss,staff_id),(ps,pending_id);
 INSERT INTO public.store_admins(user_id,display_name,access_role) VALUES(owner_id,'Audit owner','owner'),(staff_id,'Audit staff','admin');
 INSERT INTO store_private.admin_invitations(email,display_name,invited_by) VALUES(target_email,'Audit invite',owner_id);
 INSERT INTO public.products(brand,name,category,currency,price,image_url,photos,available,creation_key)
 VALUES('Audit','Rollback fixture','Аксессуары','EUR',100,'https://juliproz-store.vercel.app/images/audit.webp','[]',true,gen_random_uuid()) RETURNING id INTO fixture;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pending_id,'role','authenticated','aal','aal1','session_id',ps)::text,true);
 SET LOCAL ROLE authenticated;
 IF (public.store_admin_security_status()->>'pending')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Pending onboarding denied'; END IF;
 BEGIN PERFORM public.store_workspace_team();RAISE EXCEPTION 'Pending team access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.enforce_store_mfa();RAISE EXCEPTION 'Pending enforcement access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.products SET name='Forbidden' WHERE id=fixture;GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Pending product write';END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',os)::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.store_add_workspace_admin(target_email,'Audit invite');RAISE EXCEPTION 'Unverified MFA got membership';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Unverified MFA got membership' THEN RAISE;END IF;END;
 RESET ROLE;
 INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES(gen_random_uuid(),pending_id,'totp','verified',now(),now());
 SET LOCAL ROLE authenticated;
 result:=public.store_add_workspace_admin(target_email,'Audit invite');
 IF jsonb_array_length(result->'members')<3 THEN RAISE EXCEPTION 'Owner approval failed';END IF;
 RESET ROLE;
 IF EXISTS(select 1 from store_private.admin_invitations where email=target_email) THEN RAISE EXCEPTION 'Invitation not consumed';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2','session_id',ss)::text,true);
 SET LOCAL ROLE authenticated;
 DELETE FROM public.products WHERE id=fixture;GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Staff permanently deleted product';END IF;
 UPDATE public.products SET available=false WHERE id=fixture;GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Staff cannot mark sold';END IF;
 RESET ROLE;
 IF store_private.valid_product_image('https://juliproz-store.vercel.app/images/a".jpg') OR store_private.valid_product_image('https://juliproz-store.vercel.app/images/../a.jpg') THEN RAISE EXCEPTION 'Unsafe image accepted';END IF;
 IF NOT store_private.valid_product_image('https://juliproz-store.vercel.app/images/audit.webp') THEN RAISE EXCEPTION 'Safe image denied';END IF;
 BEGIN UPDATE public.products SET price=99.6,original_price=100.4 WHERE id=fixture;RAISE EXCEPTION 'Invisible discount accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN UPDATE public.products SET original_price='Infinity' WHERE id=fixture;RAISE EXCEPTION 'Infinite discount accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 SET LOCAL ROLE service_role;
 IF public.store_analytics_ingest(gen_random_uuid(),visitor,sess,'product_view',fixture,'catalog',hash) THEN RAISE EXCEPTION 'Hidden analytics accepted';END IF;
 IF public.store_analytics_ingest(gen_random_uuid(),visitor,sess,'product_view',9223372036854775807,'catalog',hash) THEN RAISE EXCEPTION 'Missing product accepted';END IF;
 IF NOT public.store_analytics_ingest(gen_random_uuid(),visitor,sess,'visit',null,'catalog',hash) THEN RAISE EXCEPTION 'Normal analytics denied';END IF;
 RESET ROLE;
 INSERT INTO store_private.analytics_limits(key,window_at,hits) VALUES('ip:day:'||current_date::text||':'||hash,date_trunc('day',now()),20000) ON CONFLICT(key) DO UPDATE SET hits=20000;
 SET LOCAL ROLE service_role;
 IF public.store_analytics_ingest(gen_random_uuid(),visitor,sess,'visit',null,'catalog',hash) THEN RAISE EXCEPTION 'IP daily cap bypass';END IF;
 RESET ROLE;
 UPDATE store_private.telegram_limit_global SET minute_start='-infinity',minute_count=0,day_start='-infinity',day_count=0;
 INSERT INTO store_private.telegram_limit_chat_days VALUES(hash,'message',date_trunc('day',now()),100);
 SET LOCAL ROLE service_role;
 IF store_private.consume_telegram_update(hash,9007199254740001,'message') THEN RAISE EXCEPTION 'Chat daily cap bypass';END IF;
 RESET ROLE;
 UPDATE store_private.telegram_limit_chat_days SET count=99 WHERE chat_hash=hash;
 SET LOCAL ROLE service_role;
 IF NOT store_private.consume_telegram_update(hash,9007199254740002,'message') THEN RAISE EXCEPTION 'Chat last daily slot denied';END IF;
 IF store_private.consume_telegram_update(hash,9007199254740003,'message') THEN RAISE EXCEPTION 'Chat daily cap overshot';END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2','session_id',os)::text,true);
 SET LOCAL ROLE authenticated;
 DELETE FROM public.products WHERE id=fixture;GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Owner cannot delete';END IF;
 RESET ROLE;
 DELETE FROM auth.sessions WHERE id=os;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.store_workspace_team();RAISE EXCEPTION 'Revoked session allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 IF has_table_privilege('authenticated','public.products','MAINTAIN') OR has_table_privilege('supabase_auth_admin','public.store_admins','INSERT') OR has_function_privilege('anon','public.store_bot_health()','EXECUTE') THEN RAISE EXCEPTION 'Excess grant remains';END IF;
RAISE EXCEPTION USING ERRCODE='JP000',MESSAGE='audit probes passed';
 EXCEPTION WHEN SQLSTATE 'JP000' THEN NULL;
 END;
END $$;
NOTIFY pgrst,'reload schema';
