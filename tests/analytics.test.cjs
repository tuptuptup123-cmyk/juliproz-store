const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
test('analytics requires consent and revocation stops events and clears identity',()=>{
 const local=new Map(),session=new Map(),calls=[];const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const context=vm.createContext({window:{STORE_CONFIG:{url:'https://test.invalid',key:'public'}},document:{visibilityState:'visible',getElementById:()=>null,addEventListener(){}},localStorage:storage(local),sessionStorage:storage(session),crypto,Date,AbortSignal,setInterval(){},fetch:async(...args)=>{calls.push(args)}});
 vm.runInContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),context);const run=s=>vm.runInContext(s,context);
 run("window.StoreAnalytics.track('cart_add',1)");assert.equal(calls.length,0);assert.equal(local.has('jpAnalyticsVisitor'),false);
 run("window.StoreAnalytics.setConsent(true);window.StoreAnalytics.track('cart_add',1)");assert.equal(calls.length,2);assert.equal(local.has('jpAnalyticsVisitor'),true);
 run("window.StoreAnalytics.setConsent(false);window.StoreAnalytics.track('cart_add',2)");assert.equal(calls.length,2);assert.equal(local.has('jpAnalyticsVisitor'),false);assert.equal(session.has('jpAnalyticsSession'),false);
});
test('legacy Edge endpoint redirects accepted origins through Vercel without secrets or writes',async()=>{
 let handler;vm.runInNewContext(fs.readFileSync(__dirname+'/../supabase/functions/store-analytics/index.ts','utf8'),{Deno:{serve:f=>handler=f},Response});
 const request=origin=>new Request('https://edge.invalid',{method:'POST',headers:{origin},body:'{}'});
 const r=await handler(request('https://www.juliproz.com'));assert.equal(r.status,307);assert.equal(r.headers.get('location'),'https://www.juliproz.com/api/analytics');
 assert.equal((await handler(request('https://foreign.invalid'))).status,403);
});

test('withdrawal receipt survives only in memory and never resumes tracking',()=>{
 const local=new Map(),session=new Map(),calls=[],nodes=new Map();
 const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{toggle(){},add(){},remove(){}},focus(){},addEventListener(){}});return nodes.get(id)};
 const context=vm.createContext({window:{STORE_CONFIG:{url:'https://test.invalid',key:'public'}},document:{visibilityState:'visible',getElementById:node,addEventListener(){}},localStorage:storage(local),sessionStorage:storage(session),crypto,Date,AbortSignal,setInterval(){},fetch:async(...args)=>calls.push(args)});
 vm.runInContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),context);
 context.window.StoreAnalytics.setConsent(true);const id=local.get('jpAnalyticsVisitor');
 context.window.StoreAnalytics.setConsent(false);context.window.StoreAnalytics.showChoices();
 assert.ok(node('analyticsDeletionReference').textContent.includes(id));assert.equal(local.has('jpAnalyticsVisitor'),false);assert.equal(session.size,0);
 const count=calls.length;context.window.StoreAnalytics.track('visit');assert.equal(calls.length,count);
 assert.equal([...local.values()].some(v=>v.includes(id)),false);
});

test('website and Telegram send the storefront channel only after consent, including legacy same-origin launches',()=>{
 const local=new Map(),session=new Map(),calls=[];const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 for(const channel of ['website','telegram']){
  const context=vm.createContext({window:{STORE_CONFIG:{key:'public'},Telegram:{WebApp:{initData:'signed-launch-fixture'}}},location:{hash:''},URLSearchParams,document:{documentElement:{dataset:{storefront:channel}},visibilityState:'visible',getElementById:()=>null,addEventListener(){}},localStorage:storage(local),sessionStorage:storage(session),crypto,Date,AbortSignal,setInterval(){},fetch:async(u,o)=>calls.push(JSON.parse(o.body))});
  vm.runInContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),context);
  if(channel==='website'){assert.equal(calls.length,0);context.window.StoreAnalytics.setConsent(true)}
  context.window.StoreAnalytics.track('product_view',42);
 }
 assert.deepEqual(calls.map(c=>c.channel),['website','website','telegram','telegram']);
 assert.equal(calls[0].visitor_id,calls[2].visitor_id);
 assert.equal(calls[0].session_id,calls[2].session_id); // Gateway namespaces the shared browser session.
});
