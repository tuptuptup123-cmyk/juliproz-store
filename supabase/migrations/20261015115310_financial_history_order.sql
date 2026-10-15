-- Preserve numeric event order after serializing bigint IDs for the client.
begin;
create or replace function store_private.finance_history(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform store_private.require_workspace_admin(true);
 select coalesce(jsonb_agg(to_jsonb(c) order by id::bigint desc),'[]'::jsonb) into result from (
  select id::text,changed_at,actor_label,before_data,after_data from store_private.finance_changes where entity='finance_entries' and record_id=p_id::text order by id desc limit 20
 ) c;return result;
end $$;
commit;
