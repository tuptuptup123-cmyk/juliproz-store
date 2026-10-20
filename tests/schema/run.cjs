'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const manifest=require('../../supabase/schema/manifest.json');
 for(const name of ['tests/schema/platform-fixture.sql',manifest.baseline,...manifest.migrations]){
  const sql=fs.readFileSync(path.join(root,name),'utf8');
  try{await db.exec(sql);console.log('RESTORED '+name)}catch(e){console.error(name+': '+e.message+' '+(e.detail||'')+' '+(e.hint||''));throw e}
 }
 const {rows}=await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','store_private') and c.relkind='r' and c.relrowsecurity");assert.equal(rows[0].n,35);
 const catalog=(await db.query(fs.readFileSync(path.join(root,'supabase/schema/catalog.sql'),'utf8'))).rows;
 const snapshot=path.join(root,'supabase/schema/expected-catalog.json');
 if(process.argv.includes('--update-snapshot'))fs.writeFileSync(snapshot,JSON.stringify(catalog,null,2)+'\n');else assert.deepEqual(catalog,JSON.parse(fs.readFileSync(snapshot,'utf8')),'Canonical schema snapshot changed; review migration and update snapshot explicitly.');
 await require('./audit-probes.cjs')(db);
 await require('./remaining-probes.cjs')(db);
 await require('./acquisition-probes.cjs')(db);
 await require('./website-analytics-probes.cjs')(db);
 await require('./finance-completeness-probes.cjs')(db);
 await require('./cleanup-retention-probes.cjs')(db);
 await require('./business-overview-probes.cjs')(db);
 await db.exec(fs.readFileSync(path.join(root,'supabase/owner-statistics-probes.sql'),'utf8'));
 console.log('PASS owner-only statistics, manager isolation and existing sales permissions');
 await db.close();console.log('PASS schema restore and permission probes');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
