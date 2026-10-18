const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
test('view tracking replays only the current section after consent and ignores re-renders',()=>{
 const calls=[],local=new Map(),session=new Map(),storage=m=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const context={window:{STORE_CONFIG:{}},document:{visibilityState:'visible',getElementById(){return null},addEventListener(){}},localStorage:storage(local),sessionStorage:storage(session),crypto,Date,AbortSignal,setInterval(){},fetch:async(u,o)=>calls.push(JSON.parse(o.body))};vm.runInNewContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),context);
 const api=context.window.StoreAnalytics;api.view('home');api.view('catalog','Обувь');assert.equal(calls.length,0);assert.equal(local.size,0);
 api.setConsent(true);assert.deepEqual(calls.map(e=>e.event),['visit','page_view','category_view']);assert.equal(calls.at(-1).category,'Обувь');assert.equal(calls.at(-1).page,'catalog');
 api.view('catalog','Обувь');api.view('catalog','Обувь');assert.equal(calls.length,3);
 api.view('catalog','Сумки');api.view('services');assert.deepEqual(calls.slice(3).map(e=>[e.event,e.category||e.page]),[['category_view','Сумки'],['page_view','services']]);
 api.setConsent(false);api.view('sell');assert.equal(calls.length,5);assert.equal(local.has('jpAnalyticsVisitor'),false);
});
test('gateway validates category context and does not forward unknown payload fields',async()=>{
 const calls=[],{createHandler}=require('../server/analytics.cjs'),handler=createHandler({VERCEL_ENV:'production',ANALYTICS_INGEST_SECRET:'e'.repeat(64)},async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json(true)});
 const base={event_id:crypto.randomUUID(),session_id:crypto.randomUUID(),visitor_id:crypto.randomUUID(),event:'category_view',page:'catalog',category:'Обувь'};
 async function send(body){const res={setHeader(){},end(){}};await handler({method:'POST',headers:{origin:'https://www.juliproz.com','x-vercel-forwarded-for':'203.0.113.8'},body},res);return res.statusCode}
 assert.equal(await send({...base,email:'private@example.invalid',query:'private'}),202);assert.equal(calls[0].p_category,'Обувь');assert.doesNotMatch(JSON.stringify(calls),/private/);
 for(const patch of [{category:null},{category:'x'.repeat(81)},{category:'a\nb'},{page:'cart'},{product_id:42},{event:'visit'}])assert.equal(await send({...base,...patch}),400);
 for(const page of ['home','services','sell','about','hermes','outlet'])assert.equal(await send({...base,event:'page_view',category:null,page}),202);
});
test('detailed report sorts low-interest categories, explains ordered conversions, escapes and preserves daily zeroes',()=>{
 const {render,categoryContent}=require('../analytics-report.js'),data={channel:'website',report_version:2,visitors:10,contact_visitors:2,previous:{visitors:5},category_tracking_since:'2026-10-18T05:37:22Z',categories:[{category:'Сумки',visits:2,views:10},{category:'Обувь',visits:9,views:2},{category:'<script>',visits:0}],funnel:{visitors:10,product:5,cart:2,contact:1},daily:[{day:'2026-10-18',visitors:0}],products:[],pages:[],acquisition:[]};
 const r=render(data);assert.match(r.cards,/\+100,0%/);assert.match(r.cards,/20,0% посетителей/);assert.match(r.details,/в одном посещении/);assert.ok(r.details.indexOf('Какие категории смотрят')<r.details.indexOf('Telegram-каналам'));assert.match(r.daily,/2026-10-18<\/td><td>0/);assert.doesNotMatch(r.details,/<script>|NaN|Infinity/);
 assert.ok(categoryContent(data,'visits_asc').indexOf('&lt;script&gt;')<categoryContent(data,'visits_asc').indexOf('Обувь'));
 assert.ok(categoryContent(data,'views_desc').indexOf('Сумки')<categoryContent(data,'views_desc').indexOf('Обувь'));
 assert.doesNotMatch(render({channel:'telegram'}).details,/Какие категории смотрят/);
});
