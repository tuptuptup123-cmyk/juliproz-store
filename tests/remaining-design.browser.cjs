'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],events=[],diagnostics=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')});
  await page.route('https://**/*',r=>r.fulfill({json:[]}));await page.route('**/api/catalog',r=>r.fulfill({json:[]}));await page.route('**/api/analytics',r=>{events.push(r.request().postDataJSON());return r.fulfill({status:202,body:''})});await page.route('**/api/client-errors',r=>{diagnostics.push(r.request().postDataJSON());return r.fulfill({status:202,body:''})});
  await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>typeof state==='object');
  const visible=await page.locator('.bottom-nav button:visible').count();assert.equal(visible,9);
  if(width<=680){const nav=page.locator('.bottom-nav');await nav.locator('[data-tab=services]').click();assert.equal(await page.evaluate(()=>state.tab),'services');assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-tab'),'services');await nav.locator('[data-tab=services]').focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.tab),'about');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>state.tab),'about');assert.ok(await nav.evaluate(el=>el.scrollWidth>el.clientWidth))}

  await page.evaluate(()=>{document.addEventListener('click',e=>{if(e.target.closest('a')?.href.startsWith('https://t.me/'))e.preventDefault()});document.querySelector('a[href="https://t.me/+9q95XTJFt9kxYTQ0"]').click()});assert.equal(events.length,0);
  await page.evaluate(()=>{StoreAnalytics.setConsent(true);for(const url of ['https://t.me/+9q95XTJFt9kxYTQ0','https://t.me/+lz-ze3-GDEQ0YmFi','https://t.me/+vjEYfWCKhTMxNWE0','https://t.me/+NWLPh8nc47kzMzI0'])document.querySelector('a[href="'+url+'"]').click()});
  await page.waitForFunction(()=>true);await page.waitForTimeout(100);assert.deepEqual(events.filter(e=>e.event.startsWith('channel_')).map(e=>e.event).sort(),['channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet']);
  await page.evaluate(()=>{StoreAnalytics.setConsent(false);window.dispatchEvent(new ErrorEvent('error',{error:new TypeError('SECRET private@example.invalid'),message:'SECRET',filename:location.origin+'/app.js',lineno:14,colno:2}))});await page.waitForTimeout(100);
  assert.equal(diagnostics.length,1);assert.deepEqual(Object.keys(diagnostics[0]).sort(),['asset','column','kind','line','release']);assert.doesNotMatch(JSON.stringify(diagnostics),/SECRET|private@/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();console.log(width+' PASS navigation, keyboard/focus, four consented channel clicks and private error diagnostics');
 }
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
