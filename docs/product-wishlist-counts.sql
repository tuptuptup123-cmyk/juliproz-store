create function public.store_product_wishlist_counts(p_days integer default 30) returns jsonb language plpgsql security invoker set search_path='' as $$
declare days integer=greatest(1,least(30,coalesce(p_days,30)));counts jsonb;
begin
 if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception 'admin required' using errcode='42501';end if;
 select coalesce(jsonb_object_agg(product_id::text,n),'{}'::jsonb) into counts from(select product_id,count(*) n from store_private.analytics_events where event='wishlist_add' and product_id is not null and created_at>=now()-make_interval(days=>days) group by product_id)t;
 return jsonb_build_object('days',days,'counts',counts);
end;$$;
revoke all on function public.store_product_wishlist_counts(integer) from public,anon;
grant execute on function public.store_product_wishlist_counts(integer) to authenticated;
