const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
test('analytics requires consent and revocation stops events and clears identity',()=>{
 const local=new Map(),session=new Map(),calls=[];const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const context=vm.createContext({window:{STORE_CONFIG:{url:'https://test.invalid',key:'public'}},document:{visibilityState:'visible',getElementById:()=>null,addEventListener(){}},localStorage:storage(local),sessionStorage:storage(session),crypto,Date,AbortSignal,setInterval(){},fetch:async(...args)=>{calls.push(args)}});
 vm.runInContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),context);const run=s=>vm.runInContext(s,context);
 run("window.StoreAnalytics.track('cart_add',1)");assert.equal(calls.length,0);assert.equal(local.has('jpAnalyticsVisitor'),false);
 run("window.StoreAnalytics.setConsent(true);window.StoreAnalytics.track('cart_add',1)");assert.equal(calls.length,2);assert.equal(local.has('jpAnalyticsVisitor'),true);
 run("window.StoreAnalytics.setConsent(false);window.StoreAnalytics.track('cart_add',2)");assert.equal(calls.length,2);assert.equal(local.has('jpAnalyticsVisitor'),false);assert.equal(session.has('jpAnalyticsSession'),false);
});
test('Edge bounds bodies, rejects foreign origins and uses private cached salt',async()=>{
 let handler,accepted=true,saltReads=0;const requests=[];
 const context=vm.createContext({Deno:{serve:f=>handler=f,env:{get:k=>k==='SUPABASE_URL'?'https://test.invalid':'server-only'}},Request,Response,TextDecoder,TextEncoder,Uint8Array,AbortSignal,crypto:crypto.webcrypto,fetch:async(u,o)=>{requests.push({u,o});if(u.endsWith('daily_salt')){saltReads++;return Response.json('a'.repeat(64))}return Response.json(accepted)}});
 const source=fs.readFileSync(__dirname+'/../supabase/functions/store-analytics/index.ts','utf8').replace(/Deno\.env\.get\(([^)]+)\)!/g,'Deno.env.get($1)');vm.runInContext(source,context);
 const origin='https://juliproz-store.vercel.app';const event={event_id:crypto.randomUUID(),visitor_id:crypto.randomUUID(),session_id:crypto.randomUUID(),event:'visit'};
 const req=(body,site=origin)=>new Request('https://edge.invalid',{method:'POST',headers:{origin:site,'x-forwarded-for':'spoofed, 203.0.113.7'},body});
 assert.equal((await handler(req(JSON.stringify(event),'https://foreign.invalid'))).status,403);assert.equal(requests.length,0);
 assert.equal((await handler(req('x'.repeat(3000)))).status,413);assert.equal(requests.length,0);
 assert.equal((await handler(req(JSON.stringify(event)))).status,202);accepted=false;assert.equal((await handler(req(JSON.stringify(event)))).status,429);assert.equal(saltReads,1);
 const payload=JSON.parse(requests.find(x=>x.u.endsWith('ingest')).o.body);assert.match(payload.p_fingerprint,/^[a-f0-9]{64}$/);assert.equal(Object.keys(payload).some(k=>/ip|name|email/.test(k)),false);
});
