'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 for(const name of ['tests/schema/platform-fixture.sql','supabase/schema/baseline-20261016.sql',...fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>/external_audit_security_and_logic/.test(x)).map(x=>'supabase/migrations/'+x)]){
  const sql=fs.readFileSync(path.join(root,name),'utf8');
  try{await db.exec(sql);console.log('RESTORED '+name)}catch(e){console.error(name+': '+e.message+' '+(e.detail||'')+' '+(e.hint||''));throw e}
 }
 const {rows}=await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','store_private') and c.relkind='r' and c.relrowsecurity");assert.equal(rows[0].n,29);
 const probes=path.join(root,'tests/schema/audit-probes.sql');if(fs.existsSync(probes))await db.exec(fs.readFileSync(probes,'utf8'));
 await db.close();console.log('PASS schema restore and permission probes');
})().catch(e=>{console.error(e.message);process.exitCode=1});
