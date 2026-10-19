'use strict';
const playwright=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),engine=process.env.QA_BROWSER||'chromium';
const base={id:501,brand:'Hermès',name:'Haccess Etoupe PM',category:'Сумки',size:'One Size',price:14500,currency:'EUR',available:true,fulfillment_status:'in_stock',gender:'men',stock_quantities:{'One Size':1},on_commission:true,team_pick:true,description:'Описание вещи. '.repeat(100),image_url:'images/brands/hermes-birkin.png'};
const rows=[base,...Array.from({length:12},(_,i)=>({...base,id:600+i,brand:i%2?'Rolex':'Chrome Hearts',name:'Background '+i,on_commission:false}))];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'};
(async()=>{
 const browser=await playwright[engine].launch();
 try{
  for(const width of [320,390,768,1440])for(const telegram of [false,true]){
   const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(telegram=>{
    localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1');
    window.__prepared=[];window.__links=[];const handlers={};
    if(telegram)window.Telegram={WebApp:{ready(){},expand(){},initData:'signed-fixture',initDataUnsafe:{start_param:'p_501'},platform:'ios',isVersionAtLeast:()=>true,
     onEvent:(name,fn)=>(handlers[name]??=new Set()).add(fn),offEvent:(name,fn)=>handlers[name]?.delete(fn),
     shareMessage:(id,callback)=>{if(window.__sdkThrow){window.__sdkThrow=false;throw Error('WebAppShareMessageOpened')}window.__prepared.push(id);window.__shareCallback=callback},openTelegramLink:url=>window.__links.push(['telegram',url]),openLink:url=>window.__links.push(['external',url])}};
    window.__shareFailure=error=>{window.__shareCallback(false);for(const fn of handlers.shareMessageFailed||[])fn({error})};
   },telegram);
   let fail=false,shareGate=null,shareCalls=0;const reports=[];
   await context.route('https://www.juliproz.com/**',serve);
   await context.route('https://app.juliproz.com/**',serve);
   async function serve(route){
    const url=new URL(route.request().url());
    if(url.pathname==='/api/catalog')return route.fulfill({json:rows});
    if(url.pathname==='/api/telegram-share'){
     const body=route.request().postDataJSON();assert.equal(body.product_id,'501');assert.equal(body.init_data,'signed-fixture');
     if(body.action==='report'){reports.push(body.result);return route.fulfill({status:202,json:{accepted:true}})}
     shareCalls++;
     if(shareGate)await shareGate;
     return route.fulfill({status:fail?503:200,json:fail?{error:'unavailable'}:{id:'prepared-fixture',expiration_date:Math.floor(Date.now()/1000)+300}});
    }
    const basePath=url.hostname==='app.juliproz.com'?path.join(root,'apps/telegram/dist'):root;
    const filename=url.pathname==='/'||url.pathname==='/product/501'?'/index.html':url.pathname;
    const file=path.resolve(basePath,'.'+filename);
    if(!file.startsWith(basePath+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:filename==='/index.html'?fs.readFileSync(file,'utf8').replace('<head>','<head><base href="/">'):fs.readFileSync(file)});
   }
   await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
   await context.route('**/rest/v1/products?**',r=>r.fulfill({json:rows}));
   const url=telegram?'https://app.juliproz.com/?tgWebAppStartParam=p_501':'https://www.juliproz.com/product/501';
   await page.goto(url);await page.locator('#productModal:not(.hidden) h1').waitFor();
   async function assertLayers(){
    const bounds=await page.evaluate(()=>{
     const modal=document.getElementById('productModal'),content=document.getElementById('productContent'),nav=document.querySelector('.bottom-nav');
     const m=modal.getBoundingClientRect(),c=content.getBoundingClientRect(),n=nav.getBoundingClientRect();
     return {height:innerHeight,modalBottom:m.bottom,contentBottom:c.bottom,navTop:n.top,
      covered:modal.contains(document.elementFromPoint(2,innerHeight-2)),background:getComputedStyle(document.querySelector('main')).visibility,
      navWorks:nav.contains(document.elementFromPoint(n.left+n.width/2,n.top+n.height/2)),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(bounds.modalBottom,bounds.height,'product covers the entire viewport including the navigation area');
    assert.equal(bounds.covered,true,'catalogue cannot paint through the bottom of the product');assert.equal(bounds.background,'hidden');
    assert.ok(bounds.contentBottom<=bounds.navTop,'scrolling controls stay above navigation');assert.equal(bounds.navWorks,true);assert.equal(bounds.overflow,false);
   }
   await assertLayers();
   await page.evaluate(async()=>{await loadProducts(true);document.getElementById('productContent').scrollTop=300});await assertLayers();
   await page.locator('[data-action=share]').click();const dialog=page.locator('#productShareDialog'),button=page.locator('[data-share-action=telegram]');
   assert.equal(await page.locator('#productShareUrl').inputValue(),telegram?'https://t.me/JuliProzBot/shop?startapp=p_501':'https://www.juliproz.com/product/501');
   if(telegram){
    await page.evaluate(()=>{window.__originalNow=Date.now;Date.now=()=>window.__originalNow()+7*86400000});
    await button.click();await page.waitForFunction(()=>window.__prepared.length===1);assert.equal(await page.evaluate(()=>window.__links.length),0);
    assert.equal(await button.isDisabled(),true,'preparing a message does not unlock the button while the native picker is pending');
    await button.evaluate(b=>b.click());assert.equal(shareCalls,1,'a second tap cannot collide with the open Telegram picker');
    await page.evaluate(()=>Date.now=window.__originalNow);
    await page.evaluate(()=>window.__shareCallback(false));await page.locator('.product-share-status').filter({hasText:'Вещь не отправлена'}).waitFor();
    await button.click();await page.waitForFunction(()=>window.__prepared.length===2);await page.evaluate(()=>window.__shareCallback(true));await page.locator('.product-share-status').filter({hasText:'Вещь отправлена'}).waitFor();
    await page.evaluate(()=>window.__sdkThrow=true);await button.click();await page.locator('.product-share-status').filter({hasText:'Telegram не завершил предыдущую отправку'}).waitFor();assert.equal(await button.isEnabled(),true);
    await button.click();await page.waitForFunction(()=>window.__prepared.length===3);
    const failedReport=page.waitForResponse(response=>response.url().endsWith('/api/telegram-share')&&response.request().postDataJSON().result==='MESSAGE_SEND_FAILED');
    await page.evaluate(()=>window.__shareFailure('MESSAGE_SEND_FAILED'));await page.locator('.product-share-status').filter({hasText:'Telegram не смог отправить карточку'}).waitFor();await failedReport;
    assert.ok(reports.includes('SDK_BUSY'));assert.ok(reports.includes('SENT'));
    fail=true;await button.click();await page.locator('.product-share-status').filter({hasText:'Не удалось открыть отправку'}).waitFor();assert.equal(await button.isEnabled(),true);fail=false;
    // Hold the response until the dialog is closed; elapsed delays race slow CI clicks.
    let releaseShare;shareGate=new Promise(resolve=>releaseShare=resolve);
    const previous=shareCalls,pendingResponse=page.waitForResponse('**/api/telegram-share');
    await button.click();assert.equal(await button.isDisabled(),true);await page.locator('[data-share-close]').click();await dialog.waitFor({state:'hidden'});
    releaseShare();const response=await pendingResponse;await response.finished();shareGate=null;
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(shareCalls,previous+1);assert.equal(await page.evaluate(()=>window.__prepared.length),3,'closed dialogs cannot open a late recipient picker');
    await page.locator('[data-action=share]').click();await page.clock.install();await button.click();await page.waitForFunction(()=>window.__prepared.length===4);
    await page.clock.fastForward(31000);await page.locator('.product-share-status').filter({hasText:'Получить карточку в боте'}).waitFor();
    const botCard=page.locator('[data-share-action=bot-card]');assert.equal(await botCard.isEnabled(),true);
    if(process.env.QA_OUTPUT){fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUTPUT,`share-recovery-${engine}-${width}.png`)})}
    await botCard.click();assert.deepEqual(await page.evaluate(()=>window.__links.at(-1)),['telegram','https://t.me/JuliProzBot?start=share_501']);
    assert.equal(await page.evaluate(()=>window.__prepared.length),4,'fallback does not launch another stuck native picker');
    await page.locator('[data-share-close]').click();await dialog.waitFor({state:'hidden'});await page.locator('[data-action=share]').click();assert.equal(await button.isDisabled(),true);
    await page.evaluate(()=>window.__shareCallback(true));await page.waitForFunction(()=>!document.querySelector('[data-share-action=telegram]').disabled);
    await page.evaluate(()=>delete window.Telegram.WebApp.shareMessage);await button.click();
    assert.equal(await page.evaluate(()=>window.__links.at(-1)[0]),'external','old clients open a sharing page outside the Mini App');
   }else assert.equal(await page.locator('[data-share-action=bot-card]').isVisible(),false);
   assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.locator('#backProduct').click();assert.equal(await page.locator('main').evaluate(e=>getComputedStyle(e).visibility),'visible');
   await page.locator('.product[data-id="501"]').click();await assertLayers();
   if(process.env.QA_OUTPUT){fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUTPUT,`product-link-${engine}-${telegram?'telegram':'website'}-${width}.png`)})}
   assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${engine} ${width} ${telegram?'Mini App':'website'} direct link, scroll, back, reopen${telegram?', native share/cancel/error/stale response and legacy fallback':''}`);
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
