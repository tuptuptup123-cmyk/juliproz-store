'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),os=require('node:os'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),playwright=require('playwright');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(process.env.QA_REDIRECT_CONFIG||path.join(root,'vercel.json'))),engine=process.env.QA_BROWSER||'chromium';
const row={id:281,brand:'Babolat × Lamborghini',name:'Ракетка для падела',size:'One Size',category:'Аксессуары',available:true,price:300,currency:'EUR',stock_quantities:{'One Size':1}};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
// Apply the deployed redirect rules before serving HTML. Earlier UI fixtures
// skipped this layer and injected a working bridge on every destination origin.
function redirect(url){
 for(const rule of config.redirects){
  const captures={};let matched=false;
  if(rule.source===url.pathname)matched=true;
  else if(rule.source==='/product/:id'&&/^\/product\/[1-9][0-9]*$/.test(url.pathname)){matched=true;captures.id=url.pathname.split('/').at(-1)}
  if(!matched)continue;
  if(!(rule.has||[]).every(h=>{const value=h.type==='host'?url.hostname:url.searchParams.get(h.key);if(value===null)return false;const match=String(value).match(new RegExp('^(?:'+h.value+')$'));if(match?.groups)Object.assign(captures,match.groups);return Boolean(match)}))continue;
  const target=new URL(rule.destination.replace(/:([a-zA-Z]+)/g,(m,key)=>captures[key]||m),url);
  for(const [key,value] of url.searchParams)if(!target.searchParams.has(key))target.searchParams.append(key,value);
  return {status:rule.statusCode||(rule.permanent?308:307),url:target.href};
 }
 return null;
}
(async()=>{
 const sdk=process.env.QA_TELEGRAM_SDK?fs.readFileSync(process.env.QA_TELEGRAM_SDK,'utf8'):await fetch('https://telegram.org/js/telegram-web-app.js').then(r=>{assert.ok(r.ok);return r.text()});
 const origins={},servers=[],tlsDir=fs.mkdtempSync(path.join(os.tmpdir(),'jp-origin-tls-'));
 // Match production HTTPS so WebKit's upgrade-insecure-requests does not
 // upgrade HTTP loopback assets to an HTTP-only test server.
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',path.join(tlsDir,'key.pem'),'-out',path.join(tlsDir,'cert.pem')],{stdio:'ignore'});
 const tls={key:fs.readFileSync(path.join(tlsDir,'key.pem')),cert:fs.readFileSync(path.join(tlsDir,'cert.pem'))};
 for(const host of ['juliproz-store.vercel.app','www.juliproz.com']){
  const server=https.createServer(tls,(req,res)=>{
   const url=new URL(req.url,'https://'+host),move=redirect(url);
   if(move){const target=new URL(move.url);res.writeHead(move.status,{location:(origins[target.hostname]||target.origin)+target.pathname+target.search});return res.end()}
   if(url.pathname.endsWith('/api/catalog')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify([row]))}
   if(url.pathname.includes('/api/')){res.writeHead(202,{'Content-Type':'application/json'});return res.end('{}')}
   const mini=url.pathname.startsWith('/telegram/'),base=mini?path.join(root,'apps/telegram/dist'):root;
   let pathname=mini?url.pathname.slice('/telegram'.length):url.pathname;
   if(pathname==='/'||/^\/product\/\d+$/.test(pathname))pathname='/index.html';
   const file=path.resolve(base,'.'+pathname);
   if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}
   let body=fs.readFileSync(file);
   // Local origins stand in for the deployed hosts. No live catalogue, contact
   // or authenticated Telegram requests leave this test.
   if(path.basename(file)==='telegram-entry.js')body=body.toString().replace("'juliproz.com',", "'127.0.0.1', 'juliproz.com',");
   res.writeHead(200,{'Content-Security-Policy':config.headers[0].headers[0].value,'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);origins[host]='https://127.0.0.1:'+server.address().port;
 }
 const launchOrigin=origins['juliproz-store.vercel.app'],browser=await playwright[engine].launch();
 try{
  for(const width of [320,390,1440])for(const entry of ['/', '/index.html', '/?product=281', '/telegram/']){
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:width===320?568:844}}),page=await context.newPage(),accepted=[],blocked=[],errors=[],networkErrors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(new URL(r.url()).hostname==='127.0.0.1'&&r.failure()?.errorText!=='net::ERR_ABORTED')networkErrors.push(r.failure()?.errorText)});
   await context.exposeBinding('__recordBridge',({frame},name,data)=>{(new URL(frame.url()).origin===launchOrigin?accepted:blocked).push({name,data})});
   await context.addInitScript(()=>{
    try{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')}catch{}
    window.TelegramWebviewProxy={postEvent:(name,value)=>window.__recordBridge(name,value?JSON.parse(value):null)};
   });
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='telegram.org')return route.fulfill({contentType:'text/javascript',body:sdk});
    if(url.hostname==='qhgzzhgxwpcctafpzjid.supabase.co')return route.fulfill({json:[row]});
    return route.fulfill({status:404,body:''});
   });
   const fragment='#tgWebAppVersion=10.2&tgWebAppPlatform='+(width===1440?'macos':'ios')+'&tgWebAppStartParam=p_281';
   await page.goto(launchOrigin+entry+(entry.includes('?')?'':'?startapp=p_281')+fragment);
   await page.waitForURL(u=>u.pathname==='/telegram/',{timeout:10000}).catch(error=>{console.error({url:page.url(),errors,networkErrors});throw error});
   assert.equal(new URL(page.url()).origin,launchOrigin,'the Mini App must stay on its launch origin; Telegram rejects commands after cross-origin redirects');
   assert.equal(new URL(page.url()).hash,fragment);
   await page.locator('#productModal:not(.hidden) [data-action=contact]').waitFor();
   await page.waitForFunction(()=>Boolean(window.Telegram?.WebApp?.openTelegramLink));
   await page.locator('[data-action=contact]').click();
   await page.waitForFunction(()=>Boolean(document.querySelector('#managerContactDialog[open]')));
   await page.waitForTimeout(50);
   let event=accepted.find(e=>e.name==='web_app_open_tg_link');assert.ok(event,'manager draft must reach the bridge on the authorised origin');
   const target=new URL('https://t.me'+event.data.path_full);assert.equal(target.pathname,'/juliproz');assert.match(target.searchParams.get('text'),/281/);
   await page.locator('[data-contact-close]').click();await page.locator('[data-action=add-cart]').click();await page.locator('.bottom-nav [data-tab=cart]').click();
   await page.locator('[data-cart-action=checkout]').click();await page.locator('#managerContactDialog[open]').waitFor();await page.waitForTimeout(50);
   event=accepted.filter(e=>e.name==='web_app_open_tg_link').at(-1);assert.match(new URL('https://t.me'+event.data.path_full).searchParams.get('text'),/Количество: 1/);
   assert.deepEqual(blocked,[],'no bridge events originate from another domain');assert.deepEqual(errors,[]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await context.close();console.log(`PASS ${engine} ${width} ${entry}: deployed redirects, original origin, product draft and cart draft`);
  }
 }finally{await browser.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));fs.rmSync(tlsDir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
