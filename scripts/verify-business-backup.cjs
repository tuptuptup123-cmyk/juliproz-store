'use strict';
// Offline restore rehearsal only: PGlite stays in memory, with no server connection.
// Auth placeholders satisfy foreign keys; they are not login accounts or credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const schemaRequire=require('node:module').createRequire(path.resolve(__dirname,'../tests/schema/package.json'));
const {PGlite}=schemaRequire('@electric-sql/pglite');
const {pgcrypto}=schemaRequire('@electric-sql/pglite/contrib/pgcrypto');
const baseTables=['public.products','public.product_admin_notes','public.store_admins','store_private.product_sales','store_private.finance_entries','store_private.finance_changes','store_private.commission_terms','store_private.product_costs','store_private.upload_rotations','store_private.upload_day_overrides','store_private.upload_schedule_changes','store_private.product_archive_migration_backup'];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
(async()=>{
 const source=process.argv[2];if(!source)throw Error('Usage: node scripts/verify-business-backup.cjs /absolute/path/business-data.json');
 const snapshot=JSON.parse(fs.readFileSync(source,'utf8'));assert.ok([1,2].includes(snapshot.format_version));
 const tables=snapshot.format_version===2?[...baseTables,'store_private.monthly_capital']:baseTables;assert.equal(snapshot.complete_live_system_backup,false);
 assert.deepEqual(Object.keys(snapshot.tables).sort(),[...tables].sort());
 const db=new PGlite({extensions:{pgcrypto}}),root=path.resolve(__dirname,'..'),manifest=require('../supabase/schema/manifest.json');
 try{
  for(const name of ['tests/schema/platform-fixture.sql',manifest.baseline,...manifest.migrations])await db.exec(fs.readFileSync(path.join(root,name),'utf8'));
  await db.exec("set time zone 'UTC'; set session_replication_role='replica'");
  const ids=new Set();
  for(const rows of Object.values(snapshot.tables))for(const row of rows)for(const [k,v] of Object.entries(row)){
   if(['user_id','actor_id','updated_by','voided_by','manager_id'].includes(k)&&v)ids.add(v);
   if(k==='manager_ids')for(const id of v||[])ids.add(id);
  }
  for(const id of ids)await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@restore-fixture.invalid']);
  for(const table of tables){
   const [schema,name]=table.split('.');
   const columns=(await db.query("select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and is_generated='NEVER' order by ordinal_position",[schema,name])).rows.map(c=>quote(c.column_name));
   await db.query(`insert into ${table} (${columns.join(',')}) overriding system value select ${columns.join(',')} from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(snapshot.tables[table])]);
  }
  await db.exec("set session_replication_role='origin'");
  // Check every restored value, including generated fields such as report_on.
  for(const table of tables){
   const actual=(await db.query(`select to_jsonb(t) as row from ${table} t`)).rows.map(r=>JSON.stringify(canonical(r.row))).sort();
   const expected=snapshot.tables[table].map(r=>JSON.stringify(canonical(r))).sort();
   assert.ok(JSON.stringify(actual)===JSON.stringify(expected),table+' round-trip mismatch');
  }
  const keys=(await db.query(`select con.conrelid::regclass::text as child,con.confrelid::regclass::text as parent,
   (select jsonb_agg(attname order by ord) from unnest(con.conkey) with ordinality as k(num,ord) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.num) as cols,
   (select jsonb_agg(attname order by ord) from unnest(con.confkey) with ordinality as k(num,ord) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.num) as refs
   from pg_constraint con where contype='f'`)).rows;
  let checked=0;
  for(const key of keys){
   const child=key.child.includes('.')?key.child:'public.'+key.child;if(!tables.includes(child))continue;
   const nonnull=key.cols.map(c=>'c.'+quote(c)+' is not null').join(' and '),match=key.cols.map((c,i)=>'p.'+quote(key.refs[i])+'=c.'+quote(c)).join(' and ');
   const count=(await db.query(`select count(*)::int as n from ${child} c where ${nonnull} and not exists(select 1 from ${key.parent} p where ${match})`)).rows[0].n;
   assert.equal(count,0,child+' orphan reference');checked++;
  }
  console.log(JSON.stringify({verified_at:new Date().toISOString(),source_created_at:snapshot.created_at,verification:'in-memory business-table restore with exact row comparison',auth_restored:false,storage_files_restored:false,foreign_keys_checked:checked,rows:Object.fromEntries(tables.map(t=>[t,snapshot.tables[t].length]))},null,2));
 }finally{await db.close()}
})().catch(e=>{console.error('Business backup verification failed: '+e.message);process.exitCode=1});
