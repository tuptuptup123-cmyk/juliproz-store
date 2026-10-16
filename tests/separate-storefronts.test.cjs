'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('Telegram build owns its interface and ships only shared public dependencies',()=>{
 execFileSync(process.execPath,['scripts/build-telegram.cjs'],{cwd:root});
 const out=path.join(root,'apps/telegram/dist');
 for(const name of ['index.html','privacy.html','app.js','style.css','product-sharing.css','catalog-notice.js']){
  assert.deepEqual(fs.readFileSync(path.join(out,name)),fs.readFileSync(path.join(root,'apps/telegram',name)));
 }
 for(const page of ['index.html','privacy.html']){
  const html=fs.readFileSync(path.join(out,page),'utf8');
  assert.doesNotMatch(html,/site-language|site-translations|product-translations|data-site-language|webHomePage|webAboutPage/);
  for(const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[^" ]*)"/g)){
   const asset=match[1];if(/^(https?:|#|\/)/.test(asset)||asset==='./')continue;
   assert.ok(fs.existsSync(path.join(out,asset)),page+' missing '+asset);
  }
 }
 for(const name of ['admin.js','admin.html','server','api','supabase','.env','site-language.js','site-translations.js','product-translations.js'])assert.equal(fs.existsSync(path.join(out,name)),false,name);
 for(const name of ['config.js','product-pricing.js','product-sizes.js','catalog-taxonomy.js'])assert.deepEqual(fs.readFileSync(path.join(out,name)),fs.readFileSync(path.join(root,name)));
 assert.doesNotMatch(fs.readFileSync(path.join(root,'apps/telegram/vercel.json'),'utf8'),/configure-telegram|TELEGRAM_BOT_TOKEN/);
});

function entry({host='juliproz-store.vercel.app',pathname='/',search='?startapp=p_413',hash='',app}={}){
 const moved=[],listeners={},location={hostname:host,pathname,search,hash,replace:v=>moved.push(v)};
 const window={Telegram:app?{WebApp:app}:undefined,addEventListener:(n,f)=>listeners[n]=f};
 vm.runInNewContext(fs.readFileSync(path.join(root,'telegram-entry.js'),'utf8'),{location,window,URLSearchParams,document:{addEventListener:(n,f)=>listeners[n]=f}});
 return {moved,listeners,window};
}
test('legacy Telegram entries keep their origin, deep links and full launch fragment',()=>{
 for(const host of ['juliproz-store.vercel.app','www.juliproz.com','juliproz.com']){
  const hash='#tgWebAppData=query%3Dlaunch&tgWebAppPlatform=ios',r=entry({host,hash});
  assert.deepEqual(r.moved,['/telegram/?startapp=p_413'+hash]);
  r.listeners.pageshow();assert.equal(r.moved.length,1);
 }
 const late=entry();late.window.Telegram={WebApp:{initData:'launch',platform:'ios'}};late.listeners.load({target:{id:'telegramSdk'}});assert.equal(late.moved[0],'/telegram/?startapp=p_413');
});
test('ordinary website visits, admin and already separated pages never redirect',()=>{
 for(const opts of [{},{app:{platform:'unknown',initData:''}},{pathname:'/telegram/',hash:'#tgWebAppPlatform=ios'},{pathname:'/admin.html',hash:'#tgWebAppPlatform=ios'},{host:'unrelated.invalid',hash:'#tgWebAppPlatform=ios'}])assert.equal(entry(opts).moved.length,0);
});
test('mini-app proxy is constrained and bot webhook remains at its established URL',()=>{
 const web=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))),bot=JSON.parse(fs.readFileSync(path.join(root,'apps/telegram/vercel.json')));
 assert.deepEqual(web.rewrites.filter(r=>r.source.startsWith('/telegram')),[{source:'/telegram/',destination:'https://app.juliproz.com/index.html'},{source:'/telegram/:path*',destination:'https://app.juliproz.com/:path*'}]);
 assert.deepEqual(bot.rewrites.map(r=>r.source),['/api/catalog']);
 const {WEBHOOK_URL,SHOP_URL}=require('../server/telegram.cjs');assert.equal(WEBHOOK_URL,'https://juliproz-store.vercel.app/api/telegram');
 // SHOP_URL is indirectly covered by the command response tests.
 assert.ok(fs.readFileSync(path.join(root,'server/telegram.cjs'),'utf8').includes("const SHOP_URL = 'https://juliproz-store.vercel.app/telegram/';"));
});
