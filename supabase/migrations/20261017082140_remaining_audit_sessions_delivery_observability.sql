create schema store_gateway;
revoke all on schema store_gateway from public;
grant usage on schema store_gateway to anon;
-- Credentials are encrypted by the BFF; only a hash of the random browser handle is stored.
create table store_private.admin_bff_secret(singleton boolean primary key default true check(singleton),secret_hash bytea not null check(octet_length(secret_hash)=32));
create table store_private.admin_bff_sessions(
 id text primary key check(id ~ '^[a-f0-9]{64}$'), user_id uuid not null references auth.users(id) on delete cascade,
 auth_session_id uuid not null references auth.sessions(id) on delete cascade,
 payload text not null check(length(payload) between 40 and 24000), expires_at timestamptz not null,
 lease uuid,lease_until timestamptz,created_at timestamptz not null default now()
);
create index admin_bff_sessions_expiry on store_private.admin_bff_sessions(expires_at);
create table store_private.operational_limits(key text primary key,window_at timestamptz not null,hits integer not null);
create table store_private.bot_outbox(
 update_id bigint primary key,chat_hash text not null check(chat_hash ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('message','callback')),payload text,
 state text not null default 'pending' check(state in ('pending','sending','retry','delivered','failed')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease uuid,lease_until timestamptz,
 error_code text,message_id bigint,created_at timestamptz not null default now(),finished_at timestamptz
);
create index bot_outbox_due on store_private.bot_outbox(available_at) where state in ('pending','retry','sending');
create table store_private.client_errors(
 id bigint generated always as identity primary key,fingerprint text not null,
 surface text not null check(surface in ('website','telegram','admin')),kind text not null,
 asset text not null,line_no integer not null,column_no integer not null,release text not null,
 bucket_at timestamptz not null default date_trunc('minute',now()),first_seen timestamptz not null default now(),last_seen timestamptz not null default now(),hits integer not null default 1,
 unique(fingerprint,bucket_at)
);
create index client_errors_recent on store_private.client_errors(last_seen desc);
alter table store_private.admin_bff_secret enable row level security;
alter table store_private.admin_bff_sessions enable row level security;
alter table store_private.operational_limits enable row level security;
alter table store_private.bot_outbox enable row level security;
alter table store_private.client_errors enable row level security;
revoke all on store_private.admin_bff_secret,store_private.admin_bff_sessions,store_private.operational_limits,store_private.bot_outbox,store_private.client_errors from public,anon,authenticated;

create function store_private.operational_secret(p_kind text,p_secret text) returns void language plpgsql security definer set search_path='' as $$
declare valid boolean:=false;
begin
 if p_secret is not null and length(p_secret)=64 then
  if p_kind='session' then select exists(select 1 from store_private.admin_bff_secret where singleton and secret_hash=sha256(convert_to(p_secret,'UTF8'))) into valid;
  elsif p_kind='bot' then select exists(select 1 from store_private.telegram_limit_secret where id and secret_hash=sha256(convert_to(p_secret,'UTF8'))) into valid;
  elsif p_kind='errors' then select exists(select 1 from store_private.analytics_gateway_secret where singleton and secret_hash=sha256(convert_to(p_secret,'UTF8'))) into valid;
  end if;
 end if;
 if not valid then raise exception 'Unauthorized' using errcode='42501';end if;
end $$;
create function store_private.operational_rate(p_key text,p_limit integer,p_period text default 'minute') returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into store_private.operational_limits as l values(p_key,date_trunc(p_period,now()),1)
 on conflict(key) do update set window_at=excluded.window_at,hits=case when l.window_at=excluded.window_at then least(l.hits+1,1000000) else 1 end returning hits into n;
 return n<=p_limit;
end $$;

create function store_gateway.admin_bff_session(p_secret text,p_action text,p_id text,p_payload text default null,p_auth_session uuid default null,p_user uuid default null,p_lease uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare s store_private.admin_bff_sessions%rowtype;deadline timestamptz;
begin
 perform store_private.operational_secret('session',p_secret);
 if p_id is null or p_id !~ '^[a-f0-9]{64}$' then raise exception 'Invalid handle' using errcode='22023';end if;
 if p_action='rate' then return to_jsonb(store_private.operational_rate('login:'||p_id,12) and store_private.operational_rate('login-day:'||p_id,150,'day'));end if;
 if p_action='create' then
  select least(a.created_at+interval '30 days',coalesce(a.not_after,'infinity'::timestamptz)) into deadline
  from auth.sessions a join auth.users u on u.id=a.user_id where a.id=p_auth_session and a.user_id=p_user and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now());
  if deadline is null or deadline<=now() then raise exception 'Session expired' using errcode='PT401';end if;
  insert into store_private.admin_bff_sessions(id,user_id,auth_session_id,payload,expires_at) values(p_id,p_user,p_auth_session,p_payload,deadline) returning * into s;
 elsif p_action='delete' then delete from store_private.admin_bff_sessions where id=p_id;return 'true'::jsonb;
 else
  select b.* into s from store_private.admin_bff_sessions b join auth.sessions a on a.id=b.auth_session_id join auth.users u on u.id=b.user_id
   where b.id=p_id and b.expires_at>now() and a.created_at>now()-interval '30 days' and (a.not_after is null or a.not_after>now()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) for update of b;
  if not found then return null;end if;
  if p_action='lock' then
   if s.lease_until>clock_timestamp() then return jsonb_build_object('busy',true);end if;
   update store_private.admin_bff_sessions set lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' where id=p_id returning * into s;
  elsif p_action='commit' then
   if p_lease is null or s.lease is distinct from p_lease or s.lease_until<=clock_timestamp() then raise exception 'Session changed' using errcode='PT409';end if;
   update store_private.admin_bff_sessions set payload=p_payload,lease=null,lease_until=null where id=p_id returning * into s;
  elsif p_action='unlock' then
   update store_private.admin_bff_sessions set lease=null,lease_until=null where id=p_id and lease=p_lease;return 'true'::jsonb;
  elsif p_action<>'read' then raise exception 'Invalid session action' using errcode='22023';end if;
 end if;
 return jsonb_build_object('payload',s.payload,'lease',s.lease,'expires_at',s.expires_at,'server_now',now(),'user_id',s.user_id,'auth_session_id',s.auth_session_id);
end $$;
create function public.store_admin_bff_session(p_secret text,p_action text,p_id text,p_payload text default null,p_auth_session uuid default null,p_user uuid default null,p_lease uuid default null) returns jsonb language sql set search_path='' as $$select store_gateway.admin_bff_session(p_secret,p_action,p_id,p_payload,p_auth_session,p_user,p_lease)$$;

create function store_gateway.bot_enqueue(p_secret text,p_update_id bigint,p_chat_hash text,p_kind text,p_payload text) returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 perform store_private.operational_secret('bot',p_secret);
 if p_payload is null or length(p_payload) not between 40 and 24000 then raise exception 'Invalid payload' using errcode='22023';end if;
 -- The existing limiter serializes admission and update IDs; enqueue is the SAME transaction.
 if store_private.consume_telegram_update(p_chat_hash,p_update_id,p_kind) then
  insert into store_private.bot_outbox(update_id,chat_hash,kind,payload) values(p_update_id,p_chat_hash,p_kind,p_payload) on conflict(update_id) do nothing;
 end if;
 select state into result from store_private.bot_outbox where update_id=p_update_id and chat_hash=p_chat_hash;
 return coalesce(result,'suppressed');
end $$;
create function public.store_bot_enqueue(p_secret text,p_update_id bigint,p_chat_hash text,p_kind text,p_payload text) returns text language sql set search_path='' as $$select store_gateway.bot_enqueue(p_secret,p_update_id,p_chat_hash,p_kind,p_payload)$$;
create function store_gateway.bot_claim(p_secret text,p_update_id bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.operational_secret('bot',p_secret);
 update store_private.bot_outbox set state='failed',payload=null,error_code='retry_exhausted',finished_at=now(),lease=null,lease_until=null
 where state in ('pending','retry','sending') and (created_at<now()-interval '24 hours' or attempts>=6) and (lease_until is null or lease_until<=now());
 with due as(select update_id from store_private.bot_outbox where (p_update_id is null or update_id=p_update_id) and available_at<=now()
  and (state in ('pending','retry') or state='sending' and lease_until<=now()) and attempts<6 order by available_at,update_id for update skip locked limit 5),
 claimed as(update store_private.bot_outbox b set state='sending',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '120 seconds'
  from due where b.update_id=due.update_id returning b.update_id,b.payload,b.lease,b.attempts)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from claimed c;
 return result;
end $$;
create function public.store_bot_claim(p_secret text,p_update_id bigint default null) returns jsonb language sql set search_path='' as $$select store_gateway.bot_claim(p_secret,p_update_id)$$;
create function store_gateway.bot_finish(p_secret text,p_update_id bigint,p_lease uuid,p_state text,p_delay integer,p_code text,p_message_id bigint) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform store_private.operational_secret('bot',p_secret);
 if p_state is null or p_state not in ('delivered','retry','failed') or (p_code is not null and p_code !~ '^[a-z0-9_]{1,40}$') then raise exception 'Invalid delivery state' using errcode='22023';end if;
 update store_private.bot_outbox set state=p_state,error_code=p_code,message_id=p_message_id,lease=null,lease_until=null,
  payload=case when p_state in ('delivered','failed') then null else payload end,
  finished_at=case when p_state in ('delivered','failed') then now() else null end,available_at=now()+make_interval(secs=>greatest(5,least(3600,coalesce(p_delay,30))))
 where update_id=p_update_id and state='sending' and lease=p_lease;
 return found;
end $$;
create function public.store_bot_finish(p_secret text,p_update_id bigint,p_lease uuid,p_state text,p_delay integer,p_code text,p_message_id bigint) returns boolean language sql set search_path='' as $$select store_gateway.bot_finish(p_secret,p_update_id,p_lease,p_state,p_delay,p_code,p_message_id)$$;

create function store_gateway.client_error_ingest(p_secret text,p_ip text,p_surface text,p_kind text,p_asset text,p_line integer,p_column integer,p_release text) returns boolean language plpgsql security definer set search_path='' as $$
declare error_fingerprint text;
begin
 perform store_private.operational_secret('errors',p_secret);
 if p_ip is null or p_ip !~ '^[a-f0-9]{64}$' or p_surface is null or p_surface not in ('website','telegram','admin') or p_kind is null or p_kind not in ('TypeError','ReferenceError','SyntaxError','RangeError','Error','PromiseRejection','ResourceError')
 or p_asset is null or p_asset !~ '^[a-zA-Z0-9_-]{1,80}\.(js|css)$' or p_line is null or p_line not between 0 and 1000000 or p_column is null or p_column not between 0 and 1000000 or p_release is null or p_release !~ '^[a-f0-9]{7,40}$|^development$' then return false;end if;
 if not store_private.operational_rate('errors:ip:'||p_ip,20) or not store_private.operational_rate('errors:global',500) or not store_private.operational_rate('errors:day',10000,'day') then return false;end if;
 error_fingerprint:=encode(sha256(convert_to(concat_ws(':',p_surface,p_kind,p_asset,p_line,p_column,p_release),'UTF8')),'hex');
 insert into store_private.client_errors(fingerprint,surface,kind,asset,line_no,column_no,release) values(error_fingerprint,p_surface,p_kind,p_asset,p_line,p_column,p_release)
 on conflict(fingerprint,bucket_at) do update set hits=client_errors.hits+1,last_seen=now();
 return true;
end $$;
create function public.store_client_error_ingest(p_secret text,p_ip text,p_surface text,p_kind text,p_asset text,p_line integer,p_column integer,p_release text) returns boolean language sql set search_path='' as $$select store_gateway.client_error_ingest(p_secret,p_ip,p_surface,p_kind,p_asset,p_line,p_column,p_release)$$;

create function store_private.operational_health() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object('server_now',now(),
  'errors_24h',coalesce((select sum(hits) from store_private.client_errors where bucket_at>=now()-interval '24 hours'),0),
  'error_alerts',coalesce((select jsonb_agg(to_jsonb(t)) from(select surface,kind,asset,line_no,column_no,release,sum(hits) hits,max(last_seen) last_seen from store_private.client_errors where bucket_at>=date_trunc('minute',now()-interval '24 hours') group by surface,kind,asset,line_no,column_no,release order by max(last_seen) desc limit 30)t),'[]'::jsonb),
  'bot',jsonb_build_object('pending',(select count(*) from store_private.bot_outbox where state in ('pending','retry','sending')),
   'delivered_24h',(select count(*) from store_private.bot_outbox where state='delivered' and finished_at>=now()-interval '24 hours'),
   'failed_24h',(select count(*) from store_private.bot_outbox where state='failed' and finished_at>=now()-interval '24 hours'),
   'overdue',(select count(*) from store_private.bot_outbox where state in ('pending','retry','sending') and created_at<now()-interval '5 minutes')));
end $$;
create function public.store_operational_health() returns jsonb language sql set search_path='' as $$select store_private.operational_health()$$;
create function store_private.operational_retention() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from store_private.admin_bff_sessions where expires_at<=now();
 delete from store_private.operational_limits where window_at<now()-interval '2 days';
 update store_private.bot_outbox set state='failed',payload=null,finished_at=now(),error_code='expired',lease=null,lease_until=null where state in ('pending','retry','sending') and created_at<now()-interval '24 hours';
 delete from store_private.bot_outbox where created_at<now()-interval '7 days';
 delete from store_private.client_errors where bucket_at<now()-interval '30 days';
end $$;
-- Explicit grants override inherited defaults. Public wrappers have no elevated privileges.
revoke all on function store_private.operational_secret(text,text),store_private.operational_rate(text,integer,text),store_private.operational_retention() from public,anon,authenticated;
revoke all on function store_gateway.admin_bff_session(text,text,text,text,uuid,uuid,uuid),public.store_admin_bff_session(text,text,text,text,uuid,uuid,uuid),
 store_gateway.bot_enqueue(text,bigint,text,text,text),public.store_bot_enqueue(text,bigint,text,text,text),store_gateway.bot_claim(text,bigint),public.store_bot_claim(text,bigint),
 store_gateway.bot_finish(text,bigint,uuid,text,integer,text,bigint),public.store_bot_finish(text,bigint,uuid,text,integer,text,bigint),
 store_gateway.client_error_ingest(text,text,text,text,text,integer,integer,text),public.store_client_error_ingest(text,text,text,text,text,integer,integer,text),
 store_private.operational_health(),public.store_operational_health() from public,anon,authenticated;
grant execute on function store_gateway.admin_bff_session(text,text,text,text,uuid,uuid,uuid),public.store_admin_bff_session(text,text,text,text,uuid,uuid,uuid),
 store_gateway.bot_enqueue(text,bigint,text,text,text),public.store_bot_enqueue(text,bigint,text,text,text),store_gateway.bot_claim(text,bigint),public.store_bot_claim(text,bigint),
 store_gateway.bot_finish(text,bigint,uuid,text,integer,text,bigint),public.store_bot_finish(text,bigint,uuid,text,integer,text,bigint),
 store_gateway.client_error_ingest(text,text,text,text,text,integer,integer,text),public.store_client_error_ingest(text,text,text,text,text,integer,integer,text) to anon;
grant execute on function store_private.operational_health(),public.store_operational_health() to authenticated;
do $$begin if to_regprocedure('cron.schedule(text,text,text)') is not null then perform cron.schedule('store-operational-retention','17 * * * *','select store_private.operational_retention()');end if;end$$;

-- Four consented link-click metrics use the existing bounded analytics gateway.
CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier','channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet') or p_visitor is null or p_session is null or p_event_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then return false;end if;
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
 -- Daily cron owns retention; ingestion only records the event.
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;
CREATE OR REPLACE FUNCTION public.store_analytics_ingest(p_event_id uuid, p_visitor uuid, p_session uuid, p_event text, p_product bigint, p_page text, p_fingerprint text, p_channel text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;k text;new_session boolean;
begin
 if p_channel is null or p_channel not in ('website','telegram','legacy') then return false;end if;
 if p_event not in ('visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier','channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet') or p_visitor is null or p_session is null or p_event_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then return false;end if;
 if p_event is null or (p_page is not null and p_page not in ('catalog','wishlist','cart')) then return false;end if;
 if p_event in ('product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','manager_product','manager_search_product') and p_product is null then return false;end if;
 if p_product is not null and not exists(select 1 from public.products where id=p_product and available=true) then return false;end if;

 begin
 if exists(select 1 from store_private.analytics_events where event_id=p_event_id) then return exists(select 1 from store_private.analytics_events where event_id=p_event_id and visitor_id=p_visitor and session_id=p_session and channel=p_channel);end if;
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
 insert into store_private.analytics_sessions as s(session_id,visitor_id,channel) values(p_session,p_visitor,p_channel) on conflict(session_id) do update set last_seen=now() where s.visitor_id=excluded.visitor_id and s.channel=excluded.channel;
 if not found then raise exception using errcode='JP429',message='analytics refused';end if;
 if p_event<>'heartbeat' then insert into store_private.analytics_events(event_id,visitor_id,session_id,event,product_id,page,channel) values(p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_channel) on conflict(event_id) do nothing;end if;
 -- Daily cron owns retention; ingestion only records the event.
 return true;
 exception when sqlstate 'JP429' then return false;
 end;
end; $function$;
alter table store_private.analytics_events drop constraint analytics_events_event_check;
alter table store_private.analytics_events add constraint analytics_events_event_check check(event in ('visit','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier','channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet'));
