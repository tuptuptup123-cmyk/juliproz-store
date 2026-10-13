const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createHandler,trustedIP}=require('../server/analytics.cjs');
const secret='a'.repeat(64),env={VERCEL_ENV:'production',ANALYTICS_INGEST_SECRET:secret};
const event=()=>({event_id:crypto.randomUUID(),visitor_id:crypto.randomUUID(),session_id:crypto.randomUUID(),event:'visit'});
async function invoke(handler,{body=event(),origin='https://www.juliproz.com',method='POST',headers={},stream}={}){
 const req={method,headers:{origin,'x-vercel-forwarded-for':'203.0.113.7',...headers},...(stream?{[Symbol.asyncIterator]:async function*(){for(const b of stream)yield b}}:{body})};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body?JSON.parse(body):null}};await handler(req,res);return res;
}
test('trusted platform IP ignores spoofed forwarding headers; no unknown shared bucket',()=>{
 assert.equal(trustedIP({'x-vercel-forwarded-for':'203.0.113.7','x-forwarded-for':'1.1.1.1,2.2.2.2'}),'203.0.113.7');
 for(const value of [undefined,'','garbage','203.0.113.7,1.1.1.1','fe80::1%eth0',['1.1.1.1']])assert.equal(trustedIP({'x-vercel-forwarded-for':value}),null);
 assert.equal(trustedIP({'x-forwarded-for':'203.0.113.7'}),null);
 assert.equal(trustedIP({'x-vercel-forwarded-for':'2001:0db8:0000:0000:0000:0000:0000:0001'}),trustedIP({'x-vercel-forwarded-for':'2001:db8::1'}));
});
test('gateway records only daily keyed fingerprint and fixed event fields, with shared limits',async()=>{
 const calls=[];let day='2026-10-13',accepted=true;const handler=createHandler(env,async(u,o)=>{calls.push({u,o});return Response.json(accepted)},()=>new Date(day));
 const b={...event(),ip:'1.2.3.4',email:'private@example.invalid',secret:'evil'};
 assert.equal((await invoke(handler,{body:b})).statusCode,202);accepted=false;assert.equal((await invoke(handler,{body:b,headers:{'x-forwarded-for':'192.0.2.9'}})).statusCode,429);
 const one=JSON.parse(calls[0].o.body),two=JSON.parse(calls[1].o.body);assert.equal(one.p_fingerprint,two.p_fingerprint);assert.equal(one.p_secret,secret);
 assert.equal(calls[0].u,'https://qhgzzhgxwpcctafpzjid.supabase.co/rest/v1/rpc/store_analytics_gateway_ingest');assert.equal(calls[0].o.redirect,'error');
 assert.equal(/203\.0\.113\.7|private@example|1\.2\.3\.4/.test(calls[0].o.body),false);assert.equal(one.p_event_id,b.event_id);
 day='2026-10-14';await invoke(handler,{body:b});assert.notEqual(JSON.parse(calls[2].o.body).p_fingerprint,one.p_fingerprint);
});
test('gateway rejects origins, preview, missing secrets, oversized bodies and invalid events before DB calls',async()=>{
 let calls=0;const handler=createHandler(env,async()=>{calls++;return Response.json(true)});
 for(const [opts,code] of [[{origin:'https://www.juliproz.com.evil.invalid'},403],[{method:'GET'},405],[{body:'{'},400],[{body:null},400],[{body:{...event(),product_id:1.5}},400],[{body:{...event(),page:'password'}},400],[{body:'x'.repeat(2049)},413],[{stream:[Buffer.alloc(1500),Buffer.alloc(1500)]},413],[{headers:{'x-vercel-forwarded-for':undefined}},503]])assert.equal((await invoke(handler,opts)).statusCode,code);
 assert.equal((await invoke(createHandler({...env,VERCEL_ENV:'preview'}))).statusCode,403);assert.equal((await invoke(createHandler({VERCEL_ENV:'production'}))).statusCode,503);assert.equal(calls,0);
});
test('upstream malformed responses and outages fail closed without exposing credentials',async()=>{
 for(const request of [async()=>new Response('',{status:500}),async()=>new Response('{'),async()=>Response.json({accepted:true}),async()=>{throw Error(secret)}]){
  const r=await invoke(createHandler(env,request));assert.equal(r.statusCode,503);assert.deepEqual(r.body,{error:'unavailable'});
 }
});
