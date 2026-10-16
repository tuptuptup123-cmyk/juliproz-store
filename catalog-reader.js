(function(root){
 'use strict';
 async function read({url,key,fields,fetch:fetcher=globalThis.fetch,signal=AbortSignal.timeout(20000)}){
  const rows=[],seen=new Set();let cursor=null;
  // Keyset pages do not shift when newer products are inserted or removed.
  for(let pageNumber=0;pageNumber<20;pageNumber++){
   let endpoint=url+'/rest/v1/products?select='+fields+'&available=eq.true&order=created_at.desc,id.desc&limit=500';
   if(cursor)endpoint+='&or='+encodeURIComponent('(created_at.lt.'+cursor.date+',and(created_at.eq.'+cursor.date+',id.lt.'+cursor.id+'))');
   const response=await fetcher(endpoint,{headers:{apikey:key},signal});
   if(!response.ok)throw Error('Catalogue unavailable');
   const page=await response.json();
   if(!Array.isArray(page)||page.length>500||page.some(p=>!p||p.available!==true||!/^(?:\d+|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(String(p.id))))throw Error('Invalid catalogue');
   for(const p of page){const id=String(p.id);if(!seen.has(id)){seen.add(id);rows.push(p)}}
   if(page.length<500)return rows;
   const last=page.at(-1),date=last.created_at;
   if(typeof date!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(date)||!Number.isFinite(Date.parse(date)))throw Error('Invalid catalogue cursor');
   if(cursor&&cursor.date===date&&cursor.id===String(last.id))throw Error('Catalogue cursor did not advance');
   cursor={date,id:String(last.id)};
  }
  throw Error('Catalogue limit exceeded');
 }
 root.CatalogReader={read};if(typeof module==='object')module.exports=root.CatalogReader;
})(typeof window==='object'?window:globalThis);
