const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const code=fs.readFileSync(__dirname+'/../analytics.js','utf8');
function browser({url='https://www.juliproz.com/catalog',referrer='',local=new Map(),session=new Map(),now=Date.now()}={}){
 const calls=[],storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const context={window:{STORE_CONFIG:{},location:new URL(url)},URL,URLSearchParams,document:{referrer,visibilityState:'visible',documentElement:{dataset:{}},getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}},addEventListener(){}},localStorage:storage(local),sessionStorage:storage(session),crypto,Date:{now:()=>now},AbortSignal,setInterval(){},fetch:async(u,o)=>calls.push(JSON.parse(o.body))};
 vm.runInNewContext(code,context);return {api:context.window.StoreAnalytics,calls,local,session,advance:ms=>now+=ms};
}
test('organic, advertising and hidden sources are distinct; no URL, keyword or click ID is sent',()=>{
 const cases=[['','https://www.google.com/search?q=private','google_organic'],['','https://www.google.co.uk/','google_organic'],['?gclid=private','https://www.google.com/','google_paid'],['?utm_source=google&utm_medium=cpc','','google_paid'],['?utm_source=google&utm_medium=organic','','google_organic'],['?utm_source=newsletter','','campaign'],['','https://www.google.com.evil.invalid/','referral'],['','https://evilgoogle.com/','referral'],['','','direct'],['','https://www.juliproz.com/','direct']];
 for(const [search,referrer,expected] of cases){const b=browser({url:'https://www.juliproz.com/catalog'+search,referrer});assert.equal(b.session.size,0);assert.equal(b.calls.length,0);b.api.setConsent(true);b.api.track('manager_general');assert.ok(b.calls.every(e=>e.source===expected),expected);assert.doesNotMatch(JSON.stringify(b.calls),/private|referrer|utm_|gclid/);assert.doesNotMatch(JSON.stringify([...b.session]),/private|https:/)}
});
test('source survives page loads, expires after inactivity and is removed with consent withdrawal',()=>{
 const b=browser({referrer:'https://www.google.com/'});b.api.setConsent(true);const id=b.calls[0].session_id;
 const next=browser({local:b.local,session:b.session});next.api.track('manager_general');assert.equal(next.calls.at(-1).source,'google_organic');assert.equal(next.calls.at(-1).session_id,id);
 next.advance(1800001);next.api.track('manager_sell');assert.equal(next.calls.at(-1).source,'direct');assert.notEqual(next.calls.at(-1).session_id,id);
 next.api.setConsent(false);assert.equal(next.session.size,0);const n=next.calls.length;next.api.track('manager_general');assert.equal(next.calls.length,n);
});
test('gateway accepts only source categories and cannot label unsigned traffic as Telegram',async()=>{
 const {createHandler}=require('../server/analytics.cjs'),calls=[],handler=createHandler({VERCEL_ENV:'production',ANALYTICS_INGEST_SECRET:'a'.repeat(64)},async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json(true)});
 async function send(source){const res={setHeader(){},end(){}};await handler({method:'POST',headers:{origin:'https://www.juliproz.com','x-vercel-forwarded-for':'203.0.113.5'},body:{event_id:crypto.randomUUID(),visitor_id:crypto.randomUUID(),session_id:crypto.randomUUID(),event:'visit',source}},res);return res.statusCode}
 assert.equal(await send('google_organic'),202);assert.equal(calls.at(-1).p_source,'google_organic');assert.equal(await send('telegram'),202);assert.equal(calls.at(-1).p_source,'unknown');assert.equal(await send(undefined),202);assert.equal(calls.at(-1).p_source,'unknown');assert.equal(await send('https://private.invalid'),400);
});
test('admin source report distinguishes unavailable data, zero traffic and historical events',()=>{
 const {render}=require('../analytics-report.js');assert.match(render({channel:'website'}).details,/Отчёт об источниках пока недоступен/);
 const html=render({channel:'website',acquisition:[{source:'google_organic',sessions:3,visitors:2,contacts:4,contact_visitors:1},{source:'unknown',sessions:9,visitors:8}]}).details;
 assert.match(html,/Google · бесплатный поиск<\/td><td>3<\/td><td>2<\/td><td>4<\/td><td>1/);assert.match(html,/Источник не записан<\/td><td>9/);assert.match(html,/не подтверждённые заявки/);assert.doesNotMatch(render({channel:'telegram'}).details,/Источники посещений/);
});
