const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-catalog-notice';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)});});
const product={id:99001,brand:'Gucci',name:'Кроссовки',category:'Обувь',size:'40',price:500,currency:'EUR',available:true,fulfillment_status:'in_stock',gender:'unisex'};
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch();
 async function prepare(context,delay=0){
  await context.route('https://telegram.org/**',r=>r.abort());
  await context.route('**/rest/v1/products?**',async r=>{if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return r.fulfill({json:[product]})});
  await context.addInitScript(()=>localStorage.setItem('jpAnalyticsConsent','declined'));
 }
 for(const width of [320,360,390,430,768,1280]){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});await prepare(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForTimeout(600);assert.equal(await page.locator('#catalogAntiScam').isVisible(),false,'Home stays unobstructed');
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Home fits without sideways scrolling');
  if(width<900){
   assert.equal(await page.locator('.brand .buyer-education-card').isVisible(),false);
   assert.equal(await page.locator('.home-shop-link').isVisible(),false);
   assert.ok(await page.evaluate(()=>{
    const title=document.getElementById('webHomeTitle').getBoundingClientRect(),shop=document.querySelector('.home-mobile-shop').getBoundingClientRect(),social=document.querySelector('.home-mobile-shop-actions .home-social-links').getBoundingClientRect(),photos=document.querySelector('.home-photographs').getBoundingClientRect(),course=document.querySelector('.home-mobile-education').getBoundingClientRect();
    return shop.top>=title.bottom&&social.left>=shop.right&&Math.abs(social.top+social.height/2-shop.top-shop.height/2)<2&&course.top>=photos.bottom&&document.querySelector('.brand').getBoundingClientRect().height<=160;
   }),'Mobile home keeps the logo compact, shop and socials below title and education below photos');
   assert.ok(await page.locator('.bottom-nav').evaluate(nav=>{
    const bounds=nav.getBoundingClientRect(),buttons=[...nav.querySelectorAll('[data-tab]')].filter(b=>!b.classList.contains('hidden'));
    return buttons.length===7&&nav.scrollWidth<=nav.clientWidth&&buttons.every(b=>{const r=b.getBoundingClientRect(),label=b.querySelector('small');return r.left>=bounds.left&&r.right<=bounds.right&&label.scrollWidth<=label.clientWidth;});
   }),'All seven navigation destinations and their labels fit at once');
  }else{
   assert.equal(await page.locator('.brand .buyer-education-card').isVisible(),true);
   assert.equal(await page.locator('.home-shop-link').isVisible(),true);
   assert.equal(await page.locator('.home-mobile-shop').isVisible(),false);
   assert.equal(await page.locator('.home-mobile-education').isVisible(),false);
  }
  await page.screenshot({path:out+'/home-mobile-layout-'+width+'.png',fullPage:true});
  await page.locator(width<900?'.home-mobile-shop':'.bottom-nav [data-tab=catalog]').click();await page.locator('#catalogAntiScam').waitFor();
  assert.equal(await page.locator('#acknowledgeAntiScam').evaluate(e=>document.activeElement===e),true);
  assert.ok(await page.locator('#catalogAntiScam').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth}),'Notice fits the viewport');
  await page.keyboard.press('Tab');assert.equal(await page.locator('#catalogAntiScam').evaluate(e=>e.contains(document.activeElement)),true,'Native modal keeps keyboard focus inside');
  await page.screenshot({path:out+'/anti-scam-'+width+'.png',fullPage:false});
  await page.locator('#acknowledgeAntiScam').click();assert.equal(await page.evaluate(()=>localStorage.getItem('jpAntiScamSeenV1')),'1');
  await page.locator('.bottom-nav [data-tab=home]').click();await page.locator('.bottom-nav [data-tab=catalog]').click();await page.waitForTimeout(600);assert.equal(await page.locator('#catalogAntiScam').isVisible(),false);
  await page.reload();await page.waitForTimeout(600);assert.equal(await page.locator('#catalogAntiScam').isVisible(),false,'Acknowledgement survives reload');
  const next=await context.newPage();await next.goto(origin+'/?tab=catalog');await next.waitForTimeout(600);assert.equal(await next.locator('#catalogAntiScam').isVisible(),false,'Acknowledgement survives a new tab');
  await page.locator('.bottom-nav [data-tab=about]').click();assert.equal(await page.locator('.information-education').getAttribute('href'),'https://msfi.education');await page.locator('.information-education').scrollIntoViewIfNeeded();await page.locator('.information-education img').evaluate(e=>e.decode());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/information-education-'+width+'.png',fullPage:true});assert.deepEqual(errors,[]);await context.close();
  console.log(width+' PASS home layout, visible navigation, first visit, focus, dismissal, reload/new-tab persistence, education layout');
 }
 for(const action of ['close','escape','blocked-storage']){
  const context=await browser.newContext({viewport:{width:390,height:844}});await prepare(context);
  if(action==='blocked-storage')await context.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='jpAntiScamSeenV1')throw new DOMException('Blocked','QuotaExceededError');return set.call(this,k,v)}});
  const page=await context.newPage();await page.goto(origin+'/?tab=catalog');await page.locator('#catalogAntiScam').waitFor();
  if(action==='escape')await page.keyboard.press('Escape');else await page.locator('#closeAntiScam').click();
  await page.locator('.bottom-nav [data-tab=home]').click();await page.locator('.bottom-nav [data-tab=catalog]').click();await page.waitForTimeout(600);assert.equal(await page.locator('#catalogAntiScam').isVisible(),false);
  if(action!=='blocked-storage'){await page.goto(origin+'/?tab=catalog');await page.waitForTimeout(600);assert.equal(await page.locator('#catalogAntiScam').isVisible(),false)}
  await context.close();console.log(action+' PASS');
 }
 const linked=await browser.newContext();await prepare(linked,800);const page=await linked.newPage();await page.goto(origin+'/?product=99001');await page.waitForTimeout(600);assert.equal(await page.locator('#catalogAntiScam').isVisible(),false);await page.locator('#productModal').waitFor();assert.equal(await page.locator('#catalogAntiScam').isVisible(),false);await page.locator('#backProduct').click();await page.locator('#catalogAntiScam').waitFor();await page.keyboard.press('Escape');await linked.close();console.log('Deep link PASS: product opens first, notice waits for catalogue return');
 const telegram=await browser.newContext({viewport:{width:390,height:844}});await prepare(telegram);
 await telegram.addInitScript(()=>{window.Telegram={WebApp:{ready(){},expand(){},initData:'synthetic-launch',initDataUnsafe:{},platform:'ios'}}});
 const tgPage=await telegram.newPage();await tgPage.goto(origin);await tgPage.locator('#catalogAntiScam').waitFor();await tgPage.locator('#acknowledgeAntiScam').click();
 assert.equal(await tgPage.locator('.bottom-nav.is-website-navigation').count(),0);
 assert.equal(await tgPage.locator('.bottom-nav [data-tab]:visible').count(),5);
 assert.equal(await tgPage.locator('#webHomePage').isVisible(),false);
 await tgPage.screenshot({path:out+'/telegram-mobile-layout-390.png',fullPage:false});await telegram.close();console.log('Telegram PASS: five visible destinations and first-visit notice');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
