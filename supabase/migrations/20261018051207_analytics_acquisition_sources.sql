-- Coarse, consented acquisition only. Existing events remain unknown.
alter table store_private.analytics_events add column source text
 check (source in ('google_organic','google_paid','campaign','referral','direct','unknown','telegram'));
alter table store_private.analytics_sessions add column source text
 check (source in ('google_organic','google_paid','campaign','referral','direct','unknown','telegram'));

-- Preserve the existing gateway's secret check, rate limits, availability checks
-- and channel isolation. The old signatures remain available to cached clients.
create function public.store_analytics_gateway_ingest_attributed(
 p_secret text,p_event_id uuid,p_visitor uuid,p_session uuid,p_event text,
 p_product bigint,p_page text,p_fingerprint text,p_channel text,p_source text)
returns boolean language plpgsql security definer set search_path='' as $$
declare accepted boolean; session_source text;
begin
 if p_source is null or p_source not in ('google_organic','google_paid','campaign','referral','direct','unknown','telegram')
  or (p_channel='website' and p_source='telegram') or (p_channel='telegram' and p_source<>'telegram') then return false;end if;
 accepted=public.store_analytics_gateway_ingest(p_secret,p_event_id,p_visitor,p_session,p_event,p_product,p_page,p_fingerprint,p_channel);
 if not accepted then return false;end if;
 update store_private.analytics_sessions s set source=coalesce(s.source,p_source)
  where s.session_id=p_session and s.visitor_id=p_visitor and s.channel=p_channel returning s.source into session_source;
 -- First source wins, including concurrent and retried events. Never rewrite history.
 update store_private.analytics_events set source=session_source
  where event_id=p_event_id and visitor_id=p_visitor and session_id=p_session and channel=p_channel and source is null;
 return true;
end; $$;
revoke all on function public.store_analytics_gateway_ingest_attributed(text,uuid,uuid,uuid,text,bigint,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.store_analytics_gateway_ingest_attributed(text,uuid,uuid,uuid,text,bigint,text,text,text,text) to anon;

CREATE OR REPLACE FUNCTION public.store_analytics_summary(p_days integer, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; since timestamptz;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 if p_channel is null or p_channel not in ('website','telegram','legacy') then raise exception 'invalid analytics channel' using errcode='22023';end if;
 since=now()-make_interval(days=>greatest(1,least(30,coalesce(p_days,7))));
 select coalesce(jsonb_object_agg(event,n),'{}'::jsonb) into result from(select event,count(*) n from store_private.analytics_events where channel=p_channel and created_at>=since group by event)t;
 result=result||jsonb_build_object(
 'channel',p_channel,
 'active',(select count(distinct visitor_id) from store_private.analytics_sessions where channel=p_channel and last_seen>=now()-interval '2 minutes'),
 'visitors',(select count(distinct visitor_id) from store_private.analytics_sessions where channel=p_channel and last_seen>=since),
 'sessions',(select count(*) from store_private.analytics_sessions where channel=p_channel and started_at>=since),
 'event_visitors',coalesce((select jsonb_object_agg(event,n) from(select event,count(distinct visitor_id) n from store_private.analytics_events where channel=p_channel and created_at>=since group by event)t),'{}'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(t) order by "day") from(
 select (created_at at time zone store_private.business_time_zone())::date as "day",count(distinct visitor_id) visitors,
 count(*) filter(where event='product_view') views,
 count(*) filter(where event='cart_add') cart,
 count(*) filter(where event='checkout_open' or event like 'manager_%') contacts
 from store_private.analytics_events where channel=p_channel and created_at>=since group by 1)t),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select p.id,p.brand,p.name,count(*) filter(where e.event='product_view') views,
 count(*) filter(where e.event='wishlist_add') wishlist,count(*) filter(where e.event='cart_add') cart,
 count(*) filter(where e.event='manager_product') contacts,
 count(*) filter(where e.event='manager_search_product') search_contacts
 from store_private.analytics_events e join public.products p on p.id=e.product_id where e.channel=p_channel and e.created_at>=since
 group by p.id,p.brand,p.name order by count(*) filter(where e.event='product_view') desc,p.id limit 20)t),'[]'::jsonb));
 if p_channel='website' then
  result=result||jsonb_build_object('acquisition',coalesce((select jsonb_agg(to_jsonb(t)) from (
   select coalesce(source,'unknown') source,count(distinct visitor_id) visitors,
    count(distinct session_id) sessions,
    count(*) filter(where event='checkout_open' or event like 'manager_%') contacts,
    count(distinct visitor_id) filter(where event='checkout_open' or event like 'manager_%') contact_visitors
   from store_private.analytics_events where channel=p_channel and created_at>=since
   group by coalesce(source,'unknown')
  ) t),'[]'::jsonb));
 end if;
 return result;
end; $function$;

notify pgrst,'reload schema';
