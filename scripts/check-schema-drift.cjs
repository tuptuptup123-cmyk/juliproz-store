'use strict';
// Export rows from supabase/schema/catalog.sql as JSON using a database owner connection.
// No service keys, application rows, or user data belong in that export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),expected=JSON.parse(fs.readFileSync(path.join(root,'supabase/schema/expected-catalog.json'),'utf8'));
if(!process.argv[2])throw Error('Usage: node scripts/check-schema-drift.cjs /path/to/catalog-export.json');
const actual=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
function normalize(rows){return rows.map(r=>({...r,definition:r.definition.replace(/\r\n/g,'\n').trim()})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name))}
try{assert.deepEqual(normalize(actual),normalize(expected));console.log('PASS application schema matches canonical restore')}catch{const a=new Map(actual.map(x=>[x.kind+':'+x.name,x.definition])),e=new Map(expected.map(x=>[x.kind+':'+x.name,x.definition]));for(const key of new Set([...a.keys(),...e.keys()]))if(a.get(key)!==e.get(key))console.error('DRIFT '+key);process.exitCode=1}
