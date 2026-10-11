const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler,FIELDS}=require('../server/public-catalog.cjs');
const fs=require('node:fs');
const config={url:'https://catalogue.invalid',key:'public-anon'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(v){this.body=v;return this}}}
test('100 concurrent cold visitors share one public upstream request',async()=>{
  let calls=0,release;const gate=new Promise(r=>release=r);
  const handler=createHandler({config,fetch:async(url,options)=>{
    calls++;assert.match(url,/available=eq.true/);assert.match(url,/limit=500/);
    assert.deepEqual(options.headers,{apikey:'public-anon'});
    await gate;return {ok:true,json:async()=>[{id:1,available:true,name:'Public',internal_cost:9,client_email:'private@example.invalid'}]};
  }});
  const results=Array.from({length:100},response);
  const requests=results.map(res=>handler({method:'GET',url:'/api/catalog',headers:{authorization:'must-not-forward',cookie:'must-not-forward'}},res));
  assert.equal(calls,1);release();await Promise.all(requests);
  for(const res of results){assert.equal(res.code,200);assert.deepEqual(res.body,[{id:1,name:'Public',available:true}]);assert.match(res.headers['Vercel-CDN-Cache-Control'],/s-maxage=30/)}
});
test('all catalogue pages are returned and fields match the storefront allowlist',async()=>{
  const offsets=[];const handler=createHandler({config,fetch:async url=>{offsets.push(new URL(url).searchParams.get('offset'));return {ok:true,json:async()=>offsets.length===1?Array.from({length:500},(_,id)=>({id,available:true})):[{id:500,available:true}]}}});
  const res=response();await handler({method:'GET',url:'/api/catalog'},res);
  assert.equal(res.body.length,501);assert.deepEqual(offsets,['0','500']);
  assert.equal(FIELDS,fs.readFileSync(require.resolve('../app.js'),'utf8').match(/const CATALOG_FIELDS='([^']+)'/)[1]);
});
test('errors, hidden records and malformed upstream payloads are never cached',async()=>{
  for(const upstream of [{ok:false,json:async()=>({secret:'private'})},{ok:true,json:async()=>[{id:1,available:false}]},{ok:true,json:async()=>({bad:true})}]){
    const handler=createHandler({config,fetch:async()=>upstream}),res=response();
    await handler({method:'GET',url:'/api/catalog'},res);assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Vercel-CDN-Cache-Control'],undefined);assert.equal(res.body.error,'Catalogue temporarily unavailable');
  }
});
test('client parameters and write methods cannot change the public query',async()=>{
  let calls=0;const handler=createHandler({config,fetch:async()=>{calls++;throw Error()}});
  for(const req of [{method:'POST',url:'/api/catalog'},{method:'GET',url:'/api/catalog?select=*'}]){const res=response();await handler(req,res);assert.ok([400,405].includes(res.code));assert.equal(res.headers['Cache-Control'],'no-store')}
  assert.equal(calls,0);
});
