const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(saved,host='www.juliproz.com',path='/'){
 const scripts=[],events={},data=new Map(saved?[['jpAnalyticsConsent',saved]]:[]);
 const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const window={STORE_CONFIG:{url:'https://synthetic.invalid',key:'public'},location:{hostname:host,pathname:path,href:`https://${host}${path}`},addEventListener:(n,fn)=>events[n]=fn};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../analytics.js','utf8'),{window,URL,crypto:require('node:crypto').webcrypto,localStorage:storage,sessionStorage:storage,document:{visibilityState:'visible',getElementById:()=>null,createElement:()=>({}),head:{appendChild:s=>scripts.push(s)},addEventListener(){}},setInterval(){},AbortSignal,fetch:()=>Promise.resolve({})});
 return {window,scripts,events};
}
test('Vercel collectors wait for consent and load once only on public production hosts',()=>{
 for(const saved of [undefined,'declined'])assert.equal(setup(saved).scripts.length,0);
 for(const host of ['www.juliproz.com','juliproz.com','juliproz-store.vercel.app']){
  const s=setup('accepted',host);assert.deepEqual(s.scripts.map(x=>x.src),['/_vercel/insights/script.js','/_vercel/speed-insights/script.js']);s.window.StoreAnalytics.setConsent(true);assert.equal(s.scripts.length,2);
 }
 assert.equal(setup('accepted','preview.vercel.app').scripts.length,0);
 assert.equal(setup('accepted','www.juliproz.com','/admin.html').scripts.length,0);
});
test('Both collectors redact query/hash and stop after local or cross-tab withdrawal',()=>{
 const s=setup('accepted'),hooks=[s.window.vaq[0][1],s.window.siq[0][1]];
 for(const hook of hooks){assert.equal(hook({url:'https://www.juliproz.com/?token=secret#tgWebAppData=secret'}).url,'https://www.juliproz.com/');assert.equal(hook({url:'https://www.juliproz.com/admin.html'}),null)}
 s.window.StoreAnalytics.setConsent(false);for(const hook of hooks)assert.equal(hook({url:'https://www.juliproz.com/'}),null);
 s.events.storage({key:'jpAnalyticsConsent',newValue:'accepted'});assert.equal(s.scripts.length,2);
 s.events.storage({key:'jpAnalyticsConsent',newValue:'declined'});for(const hook of hooks)assert.equal(hook({url:'https://www.juliproz.com/'}),null);
});
test('analytics preflight permits only exact shop origins',async()=>{
 let handler;vm.runInNewContext(fs.readFileSync(__dirname+'/../supabase/functions/store-analytics/index.ts','utf8').replace("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!","Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),{Deno:{serve:h=>handler=h},Response});
 for(const origin of ['https://juliproz.com','https://www.juliproz.com','https://juliproz-store.vercel.app']){const r=await handler(new Request('https://synthetic.invalid',{method:'OPTIONS',headers:{origin}}));assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Vary'),'Origin')}
 assert.equal((await handler(new Request('https://synthetic.invalid',{method:'OPTIONS',headers:{origin:'https://www.juliproz.com.evil.invalid'}}))).status,403);
});
