-- Deterministic structural fingerprint. Application schemas only; no rows or secrets.
select kind, name, definition from (
 select 'table' as kind,n.nspname||'.'||c.relname as name,
  jsonb_build_object('rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))::text as definition
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','store_private') and c.relkind='r'
 union all select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','store_private') and p.prokind='f'
 union all select 'constraint',n.nspname||'.'||c.relname||'.'||con.conname,pg_get_constraintdef(con.oid) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','store_private')
 union all select 'policy',schemaname||'.'||tablename||'.'||policyname,jsonb_build_object('roles',roles,'permissive',permissive,'cmd',cmd,'using',qual,'check',with_check)::text from pg_policies where schemaname in ('public','store_private') or schemaname='storage' and tablename='objects'
 union all select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','store_private') and not t.tgisinternal
 union all select 'index',schemaname||'.'||indexname,indexdef from pg_indexes where schemaname in ('public','store_private')
 union all select 'grant',table_schema||'.'||table_name||'.'||grantee||'.'||privilege_type,is_grantable from information_schema.table_privileges where table_schema in ('public','store_private')
 union all select 'column_grant',table_schema||'.'||table_name||'.'||column_name||'.'||grantee||'.'||privilege_type,is_grantable from information_schema.column_privileges where table_schema in ('public','store_private')
 union all select 'function_acl',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',coalesce(p.proacl::text,'DEFAULT') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','store_private')
 union all select 'schema_acl',nspname,coalesce(nspacl::text,'DEFAULT') from pg_namespace where nspname='store_private'
 union all select 'sequence_acl',n.nspname||'.'||c.relname,coalesce(c.relacl::text,'DEFAULT') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in ('public','store_private')
 union all select 'default_acl',r.rolname||'.'||coalesce(n.nspname,'*')||'.'||d.defaclobjtype::text,d.defaclacl::text from pg_default_acl d join pg_roles r on r.oid=d.defaclrole left join pg_namespace n on n.oid=d.defaclnamespace where r.rolname='postgres' and (n.nspname in ('public','store_private') or d.defaclnamespace=0)
) definitions order by kind,name;
