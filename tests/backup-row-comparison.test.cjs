'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{compareRestoredTable:compare}=require('../scripts/backup-row-comparison.cjs');
test('historical products retain every backed-up value and explicitly permit only the new null SEO timestamp',()=>{
 assert.deepEqual(compare('public.products',[{id:2,name:'B',seo_updated_at:null},{id:1,name:'A',seo_updated_at:null}],[{name:'A',id:1},{name:'B',id:2}]),['seo_updated_at']);
 for(const row of [{id:1,name:'A',seo_updated_at:'2026-11-10'},{id:1,name:'B',seo_updated_at:null},{id:1,name:'A',unexpected:null}])assert.throws(()=>compare('public.products',[row],[{id:1,name:'A'}]));
});
test('restore comparison rejects missing/extra rows, lost finance values and unexpected private fields',()=>{
 const source=[{id:1,amount:1200,purchase_cost:900}];
 for(const actual of [[],[...source,...source],[{id:1,amount:1200}],[{id:1,amount:1200,purchase_cost:0}],[{...source[0],seo_updated_at:null}]])assert.throws(()=>compare('store_private.finance_entries',actual,source));
 assert.deepEqual(compare('store_private.finance_entries',source,source),[]);
});
