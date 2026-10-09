begin;

-- Only empty obsolete upload staging tables can be removed.
do $$begin
 if exists(select 1 from public.chatgpt_upload_chunks) or exists(select 1 from store_private.chatgpt_upload_chunks) then raise exception 'Upload staging is not empty; inspect before removal';end if;
end;$$;
drop table public.chatgpt_upload_chunks;
drop table store_private.chatgpt_upload_chunks;

commit;
