-- A concurrent acquisition-report migration replaced this overload after owner_only_statistics.
-- Preserve its new report fields while restoring the owner check. Also safe on a clean replay.
do $$
declare definition text:=pg_get_functiondef('public.store_analytics_summary(integer,text)'::regprocedure);
 old_guard text:='if not store_private.admin_mfa_satisfied() or not exists(select 1 from public.store_admins where user_id=auth.uid()) then raise exception ''admin required'' using errcode=''42501'';end if;';
 new_guard text:='if not store_private.statistics_owner() then raise exception ''Статистика доступна только главному администратору'' using errcode=''42501'';end if;';
begin
 if position(new_guard in definition)>0 then return;end if;
 if position(old_guard in definition)=0 then raise exception 'Unexpected analytics report guard; review before changing';end if;
 execute replace(definition,old_guard,new_guard);
end $$;
