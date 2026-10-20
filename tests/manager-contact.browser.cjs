'use strict';
const playwright=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),engine=process.env.QA_BROWSER||'chromium',out=process.env.QA_OUTPUT||'/tmp/jp-contact-qa';
const row={id:501,brand:'Hermès',name:'Haccess Etoupe PM',size:'One Size',category:'Сумки',available:true,price:14500,currency:'EUR',fulfillment_status:'in_stock',stock_quantities:{'One Size':1}};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'};
(async()=>{
 // Exercise the official SDK down to its native bridge events. This does not
 // impersonate an authenticated Telegram user or send any messages.
 const sdk=process.env.QA_TELEGRAM_SDK?fs.readFileSync(process.env.QA_TELEGRAM_SDK,'utf8'):await fetch('https://telegram.org/js/telegram-web-app.js',{signal:AbortSignal.timeout(20000)}).then(r=>{assert.equal(r.ok,true);return r.text()});
 assert.ok(sdk.includes('WebApp.openTelegramLink = function'));
 fs.mkdirSync(out,{recursive:true});const browser=await playwright[engine].launch();
 try{
  for(const width of [320,390,1440])for(const mode of ['ru','en','ios','android','macos']){
   const native=!['ru','en'].includes(mode),origin=native?'https://app.juliproz.com':'https://www.juliproz.com';
   const url=origin+'/?product=501'+(mode==='en'?'&lang=en':'')+(native?'#tgWebAppVersion=9.1&tgWebAppPlatform='+mode:'');
   const context=await browser.newContext({viewport:{width,height:width===320?568:844},reducedMotion:'reduce'}),page=await context.newPage();
   const errors=[],popups=[];page.on('pageerror',e=>errors.push(e.message));page.on('popup',p=>popups.push(p));
   await context.addInitScript(native=>{
    try{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')}catch{}
    window.__nativeEvents=[];window.__copied=[];
    if(native)window.TelegramWebviewProxy={postEvent:(name,value)=>window.__nativeEvents.push({name,data:value?JSON.parse(value):null})};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.__denyClipboard)throw Error('denied');window.__copied.push(value)}}});
   },native);
   let fresh={...row},fail=false;const navigations=[];
   await context.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:sdk}));
   await context.route('https://qhgzzhgxwpcctafpzjid.supabase.co/**',async r=>{
    if(r.request().url().includes('/rest/v1/products?')){await new Promise(resolve=>setTimeout(resolve,1100));return r.fulfill({status:fail?503:200,json:fail?{}:[fresh]})}
    return r.fulfill({json:[]});
   });
   for(const target of ['https://t.me/**','https://wa.me/**'])await context.route(target,r=>{navigations.push(r.request().url());return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Contact destination fixture</title><p>Navigation received; no message was sent.</p>'})});
   for(const target of ['https://www.juliproz.com/**','https://app.juliproz.com/**'])await context.route(target,r=>{
    const request=new URL(r.request().url());if(request.pathname==='/api/catalog')return r.fulfill({json:[row]});
    const base=native?path.join(root,'apps/telegram/dist'):root,file=path.resolve(base,'.'+(request.pathname==='/'?'/index.html':request.pathname));
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
    return r.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   async function product(){await page.goto('about:blank');await page.goto(url);await page.locator('#productModal:not(.hidden) [data-action=contact]').waitFor();if(native)await page.waitForFunction(()=>window.Telegram?.WebApp?.platform!=='unknown'&&Boolean(window.Telegram?.WebApp?.openTelegramLink))}
   async function handoff(expectedText){
    let target;
    if(native){
     await page.waitForFunction(()=>window.__nativeEvents.some(e=>e.name==='web_app_open_tg_link'));
     const events=await page.evaluate(()=>window.__nativeEvents.filter(e=>['web_app_open_tg_link','web_app_close'].includes(e.name)));
     assert.equal(events.at(-1).name,'web_app_open_tg_link');assert.equal(events.some(e=>e.name==='web_app_close'),false,'do not interrupt recipient resolution by closing the view');
     target=new URL('https://t.me'+events.at(-1).data.path_full);
     assert.equal(await page.locator('#managerContactMessage').inputValue(),target.searchParams.get('text'));
     assert.ok(await page.locator('#managerContactDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),'fallback fits the viewport');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert.equal(await page.locator('#productShareDialog[open]').count(),0,'customer is not left behind the share modal');
    }else{
     await page.waitForURL(u=>['t.me','wa.me'].includes(u.hostname));target=new URL(page.url());assert.ok(navigations.length);assert.equal(popups.length,0,'async availability check never opens a popup');
    }
    assert.equal(target.origin+target.pathname,mode==='en'?'https://wa.me/971585394347':'https://t.me/juliproz');
    assert.match(target.searchParams.get('text'),expectedText);
    const draft=target.searchParams.get('text');assert.ok(draft.includes(native?'https://t.me/JuliProzBot/shop?startapp=p_501':'https://www.juliproz.com/product/501'));
    if(mode==='en')assert.doesNotMatch(draft,/[А-Яа-яЁё]/);
   }
   await product();await page.locator('[data-action=contact]').click();await handoff(/501/);
   await product();await page.locator('[data-action=share]').click();assert.equal(await page.locator('[data-share-action=bot-card]').isVisible(),false);await page.locator('[data-share-action=manager]').click();await handoff(/501/);
   await product();await page.locator('[data-action=add-cart]').click();await page.locator('.bottom-nav [data-tab=cart]').click();
   if(native&&width===320&&mode==='ios'){
    fresh={...row,reserved:true};await page.locator('[data-cart-action=checkout]').click();await page.locator('#cartStatus').filter({hasText:'на брони'}).waitFor();assert.equal(await page.locator('#managerContactDialog[open]').count(),0);
    fresh={...row};fail=true;await page.locator('[data-cart-action=checkout]').click();await page.locator('#cartStatus').filter({hasText:'Не удалось проверить'}).waitFor();assert.equal(await page.locator('#managerContactDialog[open]').count(),0);fail=false;
   }
   await page.locator('[data-cart-action=checkout]').click();await handoff(mode==='en'?/Quantity: 1/:/Количество: 1/);
   if(native){
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jpCart')).length),1,'closing Telegram does not clear the cart');
    await page.locator('[data-contact-copy]').click();assert.equal(await page.evaluate(()=>window.__copied.at(-1)),await page.locator('#managerContactMessage').inputValue());
    await page.screenshot({path:path.join(out,`contact-${engine}-${mode}-${width}.png`)});
    if(width===320&&mode==='ios'){
     await page.evaluate(()=>{window.Telegram.WebApp.openTelegramLink=()=>{throw Error('SDK unavailable')};window.Telegram.WebApp.openLink=()=>{throw Error('SDK unavailable')};window.__denyClipboard=true});
     await page.locator('[data-contact-copy]').click();assert.equal(await page.locator('#managerContactMessage').evaluate(e=>e.selectionEnd-e.selectionStart),await page.locator('#managerContactMessage').inputValue().then(v=>v.length));
     for(const selector of ['[data-contact-open]','[data-contact-external]','[data-contact-plain]']){
      if(selector==='[data-contact-external]')await page.locator('[data-contact-help]').click();
      const [destination]=await Promise.all([context.waitForEvent('page'),page.locator(selector).click()]);
      await destination.waitForURL(u=>u.hostname==='t.me');const url=new URL(destination.url());assert.equal(url.pathname,'/juliproz');
      if(selector!=='[data-contact-plain]')assert.match(url.searchParams.get('text'),/Количество: 1/);
      assert.equal(await page.locator('#managerContactDialog').isVisible(),true,'recovery keeps the draft available');await destination.close();
     }

    }
   }
   assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${engine} ${width} ${mode}: direct inquiry, share inquiry, checked cart, exact recipient/draft and ${native?'official SDK handoff without early close, saved cart, independent anchor recovery':'same-tab navigation after await, no popup'}`);
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
