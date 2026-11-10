'use strict';
const assert=require('node:assert/strict');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
// Historical backups predate this nullable, trigger-maintained SEO timestamp.
// Never synthesize a timestamp or ignore changes to any backed-up business field.
const additiveNulls={'public.products':new Set(['seo_updated_at'])};
function compareRestoredTable(table,actual,expected){
 const sourceKeys=new Set(expected.flatMap(row=>Object.keys(row))),added=new Set();
 const normalized=actual.map(row=>{
  const copy={...row};
  for(const key of Object.keys(copy))if(!sourceKeys.has(key)){
   assert.ok(additiveNulls[table]?.has(key)&&copy[key]===null,table+' unexpected restored field '+key);
   added.add(key);delete copy[key];
  }
  return copy;
 });
 assert.deepEqual(normalized.map(row=>JSON.stringify(canonical(row))).sort(),expected.map(row=>JSON.stringify(canonical(row))).sort(),table+' round-trip mismatch');
 return [...added].sort();
}
module.exports={compareRestoredTable};
