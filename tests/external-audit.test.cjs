'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{createHmac,randomUUID}=require('node:crypto');
const date=require('../business-date.js'),sizes=require('../product-sizes.js'),catalog=require('../catalog-reader.js');
test('business dates share Kyiv midnight and both DST transitions',()=>{
 for(const [instant,day] of [['2026-01-01T21:59:59Z','2026-01-01'],['2026-01-01T22:00:00Z','2026-01-02'],['2026-07-01T21:00:00Z','2026-07-02'],['2026-03-29T00:59:59Z','2026-03-29'],['2026-03-29T01:00:00Z','2026-03-29'],['2026-10-25T01:00:00Z','2026-10-25']])assert.equal(date.today(new Date(instant)),day);
});
test('legacy stock is one total item across variants, including on-order and persisted carts',()=>{
 const p={id:1,size:'M;L',stock_quantities:null,fulfillment_status:'on_order'},rows=[{id:1,size:'M',quantity:4},{id:1,size:'L',quantity:2}];
 assert.equal(sizes.cartLimit(p,'L',[{id:1,size:'M',quantity:1}]),0);
 assert.deepEqual(sizes.normalizeLegacyCart(rows,()=>p),{rows:[{id:1,size:'M',quantity:1}],changed:true});
 assert.equal(sizes.stockFor({stock_quantities:{'ХL':1,XL:2}},'XL'),0);
 assert.equal(sizes.stockFor({stock_quantities:{'ХL':2}},'XL'),2);
});
test('keyset catalog survives insertions/deletions between 500-row pages without offset gaps',async()=>{
 let db=Array.from({length:1100},(_,i)=>({id:1100-i,available:true,created_at:'2026-10-16T12:00:00Z'})),calls=0;
 const rows=await catalog.read({url:'https://invalid',key:'public',fields:'id,available,created_at',fetch:async endpoint=>{
  const p=new URL(endpoint).searchParams;assert.equal(p.has('offset'),false);const cursor=p.get('or')?.match(/id.lt.(\d+)/)?.[1];
  const page=db.filter(r=>!cursor||r.id<Number(cursor)).slice(0,500);if(++calls===1){db=db.filter(r=>r.id!==1000);db.unshift({id:1200,available:true,created_at:'2026-10-16T12:00:00Z'})}
  return {ok:true,json:async()=>page};
 }});
 assert.equal(rows.length,1100);assert.equal(new Set(rows.map(r=>r.id)).size,1100);assert.equal(rows.at(-1).id,1);assert.equal(calls,3);
});
test('catalog rejects repeated/invalid cursors and bounds reads',async()=>{
 const page=Array.from({length:500},(_,i)=>({id:500-i,available:true,created_at:'2026-10-16T12:00:00Z'}));let calls=0;
 await assert.rejects(catalog.read({url:'https://invalid',key:'public',fields:'id',fetch:async()=>{calls++;return {ok:true,json:async()=>page}}}),/advance/);assert.equal(calls,2);
 page.at(-1).created_at='2026-10-16T12:00:00Z),id.gt.0';await assert.rejects(catalog.read({url:'https://invalid',key:'public',fields:'id',fetch:async()=>({ok:true,json:async()=>page})}),/cursor/);
});
const now=Date.now(),token='123:TEST_ONLY',relaySecret='a'.repeat(64);
function initData(age=0){const p=new URLSearchParams({auth_date:String(Math.floor(now/1000)-age),query_id:'q',user:JSON.stringify({id:123})});const key=createHmac('sha256','WebAppData').update(token).digest();const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',key).update(check).digest('hex'));return p.toString()}
test('Telegram initData rejects tampering, stale/future dates and duplicate fields',()=>{
 const {validInitData}=require('../server/telegram-init-data.cjs'),raw=initData();assert.equal(validInitData(raw,token,now),true);
 for(const input of [raw.replace('query_id=q','query_id=forged'),raw+'&auth_date=1',initData(86401),initData(-120)])assert.equal(validInitData(input,token,now),false);
 assert.equal(validInitData(raw,'wrong',now),false);
});
test('analytics relay signature binds client IP, event and timestamp',()=>{
 const {signature,relayIP}=require('../server/analytics-relay.cjs'),body={event:'visit'},time=String(now),ip='192.0.2.9';
 const h={'x-jp-relay-time':time,'x-jp-relay-ip':ip,'x-jp-relay-signature':signature(relaySecret,time,ip,body)};
 assert.equal(relayIP(h,body,relaySecret,now),ip);assert.equal(relayIP(h,{event:'cart_add'},relaySecret,now),null);
 assert.equal(relayIP({...h,'x-jp-relay-ip':'192.0.2.10'},body,relaySecret,now),null);assert.equal(relayIP(h,body,relaySecret,now+60001),null);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}}}
test('analytics derives channel from signed launch, never from visitor channel hint',async()=>{
 const {createHandler}=require('../server/analytics.cjs');let stored;
 const handle=createHandler({VERCEL_ENV:'production',ANALYTICS_INGEST_SECRET:relaySecret,TELEGRAM_BOT_TOKEN:token},async(u,o)=>{stored=JSON.parse(o.body);return {ok:true,json:async()=>true}},()=>new Date(now));
 const base={event:'visit',event_id:randomUUID(),visitor_id:randomUUID(),session_id:randomUUID(),channel:'telegram'};
 let res=response();await handle({method:'POST',headers:{origin:'https://www.juliproz.com','x-vercel-forwarded-for':'192.0.2.4'},body:base},res);assert.equal(res.statusCode,202);assert.equal(stored.p_channel,'website');
 res=response();await handle({method:'POST',headers:{origin:'https://app.juliproz.com','x-vercel-forwarded-for':'192.0.2.4'},body:base},res);assert.equal(res.statusCode,403);
 res=response();await handle({method:'POST',headers:{origin:'https://app.juliproz.com','x-vercel-forwarded-for':'192.0.2.4'},body:{...base,telegram_init_data:initData()}},res);assert.equal(res.statusCode,202);assert.equal(stored.p_channel,'telegram');
});
test('normal visit loads no Telegram SDK; a Mini App launch loads once',()=>{
 for(const [hash,count] of [['',0],['#tgWebAppData=signed-launch',1]]){const added=[];vm.runInNewContext(fs.readFileSync('telegram-sdk.js','utf8'),{URLSearchParams,location:{hash,search:''},document:{createElement:()=>({}),head:{appendChild:s=>added.push(s)}}});assert.equal(added.length,count)}
 assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/src="https:\/\/telegram.org/);
});
test('static photo gateway never reads files for hidden/unreferenced/unsafe assets',async()=>{
 const {createHandler}=require('../server/product-photo.cjs'),asset=require('../product-assets-manifest.json')[0];let visible=false,reads=0,queries=[];
 const handler=createHandler({fetch:async(u,o)=>{queries.push({u,o});return {ok:true,json:async()=>visible?[{id:1}]:[]}},readFile:async()=>{reads++;return Buffer.from('image')}});
 const req=(value,headers={})=>({method:'GET',url:'/api/product-photo?path='+encodeURIComponent(value),headers});
 let res=response();await handler(req(asset),res);assert.equal(res.statusCode,404);assert.equal(reads,0);
 visible=true;res=response();await handler(req(asset),res);assert.equal(res.statusCode,200);assert.equal(reads,1);assert.equal(res.headers['Cache-Control'],'private, no-cache, must-revalidate');assert.match(queries.at(-1).u,/available=eq.true/);
 const etag=res.headers.ETag;res=response();await handler(req(asset,{'if-none-match':etag}),res);assert.equal(res.statusCode,304);
 visible=false;res=response();await handler(req(asset,{'if-none-match':etag}),res);assert.equal(res.statusCode,404);assert.equal(res.headers['Cache-Control'],'no-store');visible=true;
 res=response();await handler(req(asset,{authorization:'Bearer mock.jwt.token',origin:'https://admin.juliproz.com'}),res);assert.equal(res.statusCode,200);assert.equal(queries.at(-1).o.headers.Authorization,'Bearer mock.jwt.token');assert.doesNotMatch(queries.at(-1).u,/available=eq.true/);
 for(const bad of ['../config.js','missing.webp',asset+'?x=1']){res=response();await handler(req(bad),res);assert.equal(res.statusCode,404)}assert.equal(reads,3);
});
test('storage photo gateway checks publication before using service credentials',async()=>{
 let handler,visible=false;const calls=[],asset='11111111-1111-4111-8111-111111111111/photo.webp';
 const context={Deno:{serve:f=>handler=f,env:{get:k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-secret'}[k])}},URL,Response,AbortSignal,fetch:async(u,o)=>{calls.push({u,o});return u.includes('/rest/')?new Response(JSON.stringify(visible?[{id:1}]:[])):o.headers['If-None-Match']==='"image-v1"'?new Response(null,{status:304,headers:{ETag:'"image-v1"'}}):new Response('image',{headers:{'Content-Type':'image/webp',ETag:'"image-v1"'}})}};
 vm.runInNewContext(fs.readFileSync('supabase/functions/product-photo/index.ts','utf8'),context);
 let r=await handler(new Request('https://test.invalid/functions/v1/product-photo/'+asset));assert.equal(r.status,404);assert.equal(calls.length,1);
 visible=true;r=await handler(new Request('https://test.invalid/functions/v1/product-photo/'+asset));assert.equal(r.status,200);assert.equal(calls.at(-1).o.headers.Authorization,'Bearer server-secret');assert.doesNotMatch(await r.text(),/server-secret/);
 r=await handler(new Request('https://test.invalid/functions/v1/product-photo/'+asset,{headers:{'If-None-Match':'"image-v1"'}}));assert.equal(r.status,304);assert.equal(r.headers.get('Cache-Control'),'private, no-cache, must-revalidate');
 visible=false;const count=calls.length;r=await handler(new Request('https://test.invalid/functions/v1/product-photo/'+asset,{headers:{'If-None-Match':'"image-v1"'}}));assert.equal(r.status,404);assert.equal(calls.length,count+1);assert.equal(r.headers.get('Cache-Control'),'no-store');
 r=await handler(new Request('https://test.invalid/functions/v1/product-photo/'+asset+'?download=1'));assert.equal(r.status,404);
});
