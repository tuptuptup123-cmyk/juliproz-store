'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-split-qa';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const product={id:99001,brand:'Gucci',name:'Кроссовки',category:'Обувь',size:'40; 41',price:500,currency:'EUR',available:true,reserved:false,fulfillment_status:'in_stock',gender:'unisex',stock_quantities:{40:2,41:1},image_url:'images/brands/hermes-birkin.png'};
let browser;
(async()=>{
 browser=await chromium.launch();
 async function setup(context){
  for(const origin of ['https://www.juliproz.com','https://app.juliproz.com'])await context.route(origin+'/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/catalog')return route.fulfill({json:[product]});
   if(url.pathname==='/api/analytics')return route.fulfill({status:202,json:{accepted:true}});
   const bot=url.hostname==='app.juliproz.com'||url.pathname.startsWith('/telegram/');
   const base=bot?path.join(root,'apps/telegram/dist'):root;
   let name=url.pathname.replace(/^\/telegram\//,'/');if(name==='/')name='/index.html';
   const file=path.resolve(base,'.'+name);
   if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
  });
  await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
  await context.route('**/rest/v1/products?**',r=>r.fulfill({json:[product]}));
 }
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await setup(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://www.juliproz.com/?lang=en');await page.locator('#webHomePage').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.locator('.masthead-inner [data-site-language=ru]').click();await page.locator('.masthead-inner [data-site-language=en]').click();
  await page.evaluate(p=>{
   localStorage.setItem('jpFav',JSON.stringify([String(p.id)]));
   localStorage.setItem('jpCart',JSON.stringify([{id:String(p.id),size:'40',quantity:1,product:p}]));
   localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1');
  },product);
  // Same origin, existing browser state, old BotFather entry, full launch fragment.
  const fragment='#tgWebAppPlatform=ios&tgWebAppVersion=8.0&tgWebAppData=query_id%3Dsynthetic';
  await page.goto('https://www.juliproz.com/?startapp=p_99001&lang=en'+fragment);
  await page.waitForURL('**/telegram/**');await page.locator('#productModal:not(.hidden)').waitFor();
  assert.equal(new URL(page.url()).hash,fragment);assert.equal(new URL(page.url()).origin,'https://www.juliproz.com');
  assert.equal(await page.locator('html').getAttribute('data-storefront'),'telegram');assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  assert.equal(await page.locator('[data-site-language],#webHomePage,#webAboutPage').count(),0);
  assert.equal(await page.locator('.bottom-nav [data-tab]:visible').count(),5);
  assert.deepEqual(await page.evaluate(()=>({cart:cart.length,size:cart[0].size,fav:state.favorites.has('99001'),language:localStorage.getItem('jpWebsiteLanguageV1'),translator:typeof window.SiteLanguage})),{cart:1,size:'40',fav:true,language:'en',translator:'undefined'});
  await page.locator('[data-size="40"]').click();await page.locator('[data-action=share]').click();
  assert.equal(await page.locator('#productShareUrl').inputValue(),'https://t.me/JuliProzBot/shop?startapp=p_99001');await page.locator('[data-share-close]').click();
  await page.locator('.bottom-nav [data-tab=cart]').click();await page.locator('#cartPage').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.bottom-nav [data-tab=catalog]').click();await page.locator('.product').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:out+`/separate-telegram-${width}.png`,fullPage:true});
  for(const tab of ['favorites','sell','services','cart']){await page.locator(`.bottom-nav [data-tab=${tab}]`).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),tab+' fits '+width)}
  await page.reload();assert.equal(await page.evaluate(()=>cart.length),1);
  await page.goto('https://www.juliproz.com/?lang=en');await page.locator('#webHomePage').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.deepEqual(errors,[]);await context.close();console.log(width+' PASS independent Telegram view, legacy URL, cart/favourites/consent continuity, exact product links and return to English website');
 }
 const context=await browser.newContext({viewport:{width:390,height:844}});await setup(context);const page=await context.newPage();
 await page.goto('https://app.juliproz.com/?lang=en');await page.locator('#catalogAntiScam').waitFor();await page.locator('#acknowledgeAntiScam').click();await page.locator('#analyticsDecline').click();await page.locator('.product').first().waitFor();
 assert.equal(await page.locator('html').getAttribute('lang'),'ru');assert.equal(await page.locator('.bottom-nav [data-tab]:visible').count(),5);
 await page.locator('.product-open').first().click();await page.locator('[data-size="40"]').click();await page.locator('[data-action=add-cart]').click();assert.equal(await page.evaluate(()=>cart.length),1);
 await page.goto('https://app.juliproz.com/privacy.html');assert.equal(await page.locator('[data-site-language]').count(),0);assert.equal(await page.locator('a').first().getAttribute('href'),'./');
 await context.close();console.log('PASS standalone mini-app origin, Russian notice, add-to-cart and privacy');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()});
