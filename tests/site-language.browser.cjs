const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-language';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)});});
const products=[
 {id:99001,brand:'Gucci',name:'Кроссовки',category:'Обувь',size:'40; 41',price:500,currency:'EUR',available:true,fulfillment_status:'in_stock',gender:'unisex',description:'Белые кроссовки с оранжевыми и голубыми деталями.',stock_quantities:{40:2,41:1},image_url:'images/brands/hermes-birkin.png'},
 {id:99002,brand:'Hermès',name:'Сандалии Oran',category:'Обувь',size:'38',price:600,original_price:800,currency:'EUR',available:true,fulfillment_status:'on_order',gender:'women'},
 {id:99003,brand:'Loro Piana',name:'Кепка, лиловая',category:'Головной убор',size:'One Size',price:350,currency:'EUR',available:true,fulfillment_status:'in_stock',product_condition:'pre_owned',wear_condition:'gently_used',gender:'unisex'}
];
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch();
 async function prepare(context){
  await context.route('https://telegram.org/**',r=>r.abort());
  await context.route('**/api/catalog',r=>r.fulfill({json:products}));
  await context.route('**/rest/v1/products?**',r=>r.fulfill({json:products}));
  await context.addInitScript(()=>{localStorage.setItem('jpAnalyticsConsent','declined');window.auditOpenedLinks=[];window.auditOpenedTargets=[];window.open=(url,target)=>{window.auditOpenedLinks.push(url);window.auditOpenedTargets.push(target);return null};document.addEventListener('click',event=>{const link=event.target.closest('a');if(link&&new URL(link.href).hostname==='wa.me'){event.preventDefault();window.auditOpenedLinks.push(link.href)}},true)});
 }
 async function fits(page,name){
  const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nav:[...document.querySelectorAll('.bottom-nav [data-tab]')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect(),small=b.querySelector('small');return {tab:b.dataset.tab,left:r.left,right:r.right,label:small.scrollWidth-small.clientWidth}})}));
  assert.ok(result.scroll<=result.width+1,name+': no horizontal page overflow '+JSON.stringify(result));
  assert.ok(result.nav.every(b=>b.left>=0&&b.right<=result.width+1&&b.label<=1),name+': navigation fits '+JSON.stringify(result));
 }
 async function english(page,selector='body'){
  const leftovers=await page.locator(selector).evaluate(el=>{
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),bad=[];while(walker.nextNode()){const n=walker.currentNode;if(/[А-Яа-яЁё]/.test(n.textContent)&&n.parentElement.getClientRects().length&&!n.parentElement.closest('script,style,[hidden],.hidden,[inert],[data-no-translate]'))bad.push(n.textContent.trim())}return bad;
  });assert.deepEqual(leftovers,[],'Visible English copy must be complete');
 }
 for(const width of [320,390,768,900,1024,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await prepare(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('#webHomePage').waitFor();await page.evaluate(()=>document.fonts.ready);
  await fits(page,'RU home '+width);await page.screenshot({path:out+`/design-ru-home-${width}.png`,fullPage:true});
  await page.locator('.masthead-inner [data-site-language=en]').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');await english(page);await fits(page,'EN home '+width);
  const box=await page.locator('.masthead-inner .language-switch').boundingBox(),logo=await page.locator('.brand-lockup').boundingBox();assert.ok(box.y+box.height<=logo.y+1||box.x>=logo.x+logo.width||box.x+box.width<=logo.x,'Language control does not cover the logo');
  if(width>=900){const shop=await page.locator('.home-shop-link').boundingBox(),course=await page.locator('.brand .buyer-education-card').boundingBox();assert.ok(Math.abs(shop.y+shop.height/2-course.y-course.height/2)<2,'Shop and course align on desktop: '+JSON.stringify({width,shop,course}))}
  const actions=page.locator(width>=900?'.home-shop-actions':'.home-mobile-shop-actions'),shopAction=await actions.locator('button').boundingBox(),socials=actions.locator('.home-social-card');
  assert.equal(await page.locator('.home-social-card:visible').count(),3);
  if(width>=900){const group=await actions.boundingBox(),mark=await page.locator('.brand-lockup').boundingBox(),course=await page.locator('.brand .buyer-education-card').boundingBox();const separate=(a,b)=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y;assert.ok(separate(group,mark)&&separate(group,course),'Homepage actions do not overlap the logo or course at '+width)}
  assert.equal(await socials.nth(0).getAttribute('href'),'https://www.instagram.com/juli.proz/');assert.equal(await socials.nth(1).getAttribute('href'),'https://t.me/+9q95XTJFt9kxYTQ0');assert.equal(await socials.nth(2).getAttribute('href'),'https://wa.me/message/LX6SBE3QCQXKG1');
  for(const social of await socials.all()){assert.equal(await social.locator('svg').evaluate(e=>getComputedStyle(e).color),'rgb(0, 0, 0)','Social icons contrast with the white header');const box=await social.boundingBox();assert.ok(box.x>=shopAction.x+shopAction.width&&box.width>=44&&box.height>=44&&Math.abs(box.y+box.height/2-shopAction.y-shopAction.height/2)<2,'Social buttons sit beside the shop action at '+width)}
  await page.screenshot({path:out+`/design-en-home-${width}.png`,fullPage:true});
  for(const tab of ['sell','services','about','favorites','cart']){
   await page.locator(`.bottom-nav [data-tab=${tab}]`).click();
   if(tab==='sell'||tab==='services'){
    for(const button of await page.locator(tab==='sell'?'#offerItem':'[data-service]').all()){await button.click();const link=new URL(await page.evaluate(()=>window.auditOpenedLinks.at(-1)));assert.equal(link.origin+link.pathname,'https://wa.me/971585394347');assert.match(link.searchParams.get('text'),/^Hello!/);assert.doesNotMatch(link.searchParams.get('text'),/[А-Яа-яЁё]/)}
    await page.evaluate(()=>{window.auditOpenedLinks=[]});
   }
   if(tab==='about'){assert.equal(await page.locator('.information-contact').getAttribute('href'),'https://wa.me/message/LX6SBE3QCQXKG1');assert.equal(await page.locator('[data-manager-handle]').innerText(),'WhatsApp');assert.equal(await page.locator('[data-manager-platform=whatsapp]').isVisible(),true)}
   await english(page);await fits(page,`EN ${tab} ${width}`);await page.screenshot({path:out+`/design-en-${tab}-${width}.png`,fullPage:true});
  }
  await page.locator('.bottom-nav [data-tab=catalog]').click();await page.locator('#catalogAntiScam').waitFor();await english(page,'#catalogAntiScam');assert.equal(await page.locator('.anti-scam-contact').getAttribute('href'),'https://wa.me/message/LX6SBE3QCQXKG1');
  assert.ok(await page.locator('#catalogAntiScam').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth}));
  await page.screenshot({path:out+`/design-en-notice-${width}.png`});await page.locator('#acknowledgeAntiScam').click();await page.locator('.product').first().waitFor();await english(page);await fits(page,'EN catalogue '+width);
  await page.locator('#openCatalogMenu').click();await english(page,'#catalogMenu');await page.locator('[data-menu-type=category][data-menu-value="Обувь"]').click();await page.locator('#showMenuProducts').click();assert.equal(await page.evaluate(()=>state.category),'Обувь');
  await page.locator('.masthead-inner [data-site-language=ru]').click();assert.equal(await page.evaluate(()=>state.category),'Обувь');assert.match(await page.locator('#count').innerText(),/В каталоге/);
  await page.locator('.masthead-inner [data-site-language=en]').click();await page.locator('#toggleSearch').click();await page.locator('#search').fill('sneakers');await page.locator('.product[data-id="99001"]').waitFor();assert.equal(await page.locator('.product').count(),1,'English search finds Russian catalogue records');
  await page.locator('.product[data-id="99001"] .product-open').click();await page.locator('[data-size="40"]').click();await english(page,'#productModal');await fits(page,'EN detail '+width);
  assert.equal(await page.locator('main').getAttribute('inert'),'');assert.equal(await page.locator('.brand').getAttribute('inert'),'');
  await page.locator('#openProductMenu').click();await page.locator('#closeCatalogMenu').click();
  assert.equal(await page.locator('main').getAttribute('inert'),'','Closing filters keeps the background inactive while the product is open');

  await page.locator('[data-action=wishlist]').click();await page.locator('[data-action=add-cart]').click();await page.locator('.product-toolbar [data-site-language=ru]').click();assert.equal(await page.evaluate(()=>selectedSize),'40');assert.equal(await page.evaluate(()=>cart.length),1);assert.equal(await page.evaluate(()=>state.favorites.has('99001')),true);
  await page.locator('.product-toolbar [data-site-language=en]').click();await english(page,'#productModal');await page.screenshot({path:out+`/design-en-product-${width}.png`,fullPage:false});
  await page.locator('[data-action=share]').click();await english(page,'#productShareDialog');assert.match(await page.locator('#productShareUrl').inputValue(),/product=99001&lang=en$/);if(width<=600)assert.ok(await page.locator('#productShareUrl').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'Mobile input avoids focus zoom');await page.screenshot({path:out+`/design-en-share-${width}.png`});
  await page.locator('[data-share-action=manager]').click();const shared=new URL(await page.evaluate(()=>window.auditOpenedLinks.at(-1)));assert.equal(shared.origin+shared.pathname,'https://wa.me/971585394347');assert.match(shared.searchParams.get('text'),/product=99001&lang=en/);assert.match(shared.searchParams.get('text'),/Size \/ option: 40/);assert.doesNotMatch(shared.searchParams.get('text'),/[А-Яа-яЁё]/);await page.locator('[data-share-close]').click();
  await page.locator('[data-action=sourcing]').click();assert.equal(await page.evaluate(()=>window.auditOpenedLinks.at(-1)),'https://wa.me/message/LX6SBE3QCQXKG1');await page.evaluate(()=>{window.auditOpenedLinks=[]});
  await page.locator('.bottom-nav [data-tab=cart]').click();await english(page,'#cartPage');await fits(page,'EN full bag '+width);assert.equal(await page.locator('main').getAttribute('inert'),null);assert.equal(await page.locator('.brand').getAttribute('inert'),null);await page.screenshot({path:out+`/design-en-bag-${width}.png`,fullPage:true});
  await page.locator('[data-cart-action=checkout]').click();await page.waitForFunction(()=>window.auditOpenedLinks.length===1);
  const enLink=new URL(await page.evaluate(()=>window.auditOpenedLinks[0]));assert.equal(enLink.origin+enLink.pathname,'https://wa.me/971585394347');assert.equal(await page.evaluate(()=>window.auditOpenedTargets.at(-1)),'_self','Async WhatsApp checkout avoids popup blockers on mobile');const enDraft=enLink.searchParams.get('text');assert.match(await page.locator('.checkout-note').innerText(),/WhatsApp/);
  assert.match(enDraft,/^Hello!/);assert.match(enDraft,/https:\/\/www\.juliproz\.com\/\?product=99001&lang=en/);assert.doesNotMatch(enDraft,/[А-Яа-яЁё]/);
  await page.locator('.masthead-inner [data-site-language=ru]').click();await page.locator('[data-cart-action=checkout]').click();await page.waitForFunction(()=>window.auditOpenedLinks.length===2);
  const ruLink=new URL(await page.evaluate(()=>window.auditOpenedLinks[1]));assert.equal(ruLink.origin+ruLink.pathname,'https://t.me/juliproz');assert.match(await page.locator('.checkout-note').innerText(),/Telegram/);assert.equal(await page.locator('.information-contact').getAttribute('href'),'https://t.me/juliproz');const ruDraft=ruLink.searchParams.get('text');assert.match(ruDraft,/https:\/\/www\.juliproz\.com\/\?product=99001\n/);assert.doesNotMatch(ruDraft,/JuliProzBot|lang=en/);
  await page.locator('.masthead-inner [data-site-language=en]').click();

  await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.evaluate(()=>cart.length),1);assert.equal(await page.evaluate(()=>state.favorites.has('99001')),true);
  await page.goto(origin+'/privacy.html?lang=en');await english(page);await fits(page,'EN privacy '+width);assert.equal(await page.locator('[data-manager-link]').getAttribute('href'),'https://wa.me/message/LX6SBE3QCQXKG1');await page.locator('[data-site-language=ru]').click();assert.equal(await page.locator('[data-manager-link]').getAttribute('href'),'https://t.me/juliproz');
  assert.deepEqual(errors,[]);await context.close();console.log(width+' PASS RU/EN design, translations, filters, English search, size, wishlist, bag, share, persistence and privacy');
 }
 for(const [width,height] of [[320,568],[390,667],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});await prepare(context);const page=await context.newPage();
  await page.goto(origin+'/?lang=en');await page.locator('[data-web-section=catalog]:visible').first().click();await page.locator('#catalogAntiScam').waitFor();
  const notice=await page.locator('#catalogAntiScam').boundingBox();assert.ok(notice.x>=0&&notice.y>=0&&notice.x+notice.width<=width+1&&notice.y+notice.height<=height+1,'Anti Scam fits short screen '+width+'x'+height);
  await page.locator('#acknowledgeAntiScam').click();await page.locator('#openCatalogMenu').click();await english(page,'#catalogMenu');await page.locator('#showMenuProducts').click();
  await page.locator('.product[data-id="99001"] .product-open').click();await page.locator('[data-size="40"]').click();await page.locator('[data-action=add-cart]').click();await fits(page,'Short screen product '+width+'x'+height);
  await page.locator('[data-action=share]').click();await english(page,'#productShareDialog');await page.screenshot({path:out+`/audit-short-share-${width}x${height}.png`});await page.locator('[data-share-close]').click();
  await page.locator('.bottom-nav [data-tab=cart]').click();await fits(page,'Short screen bag '+width+'x'+height);await page.screenshot({path:out+`/audit-short-bag-${width}x${height}.png`,fullPage:true});
  await context.close();console.log(width+'x'+height+' PASS short portrait/landscape notice, filters, selected size, add to bag, share and navigation');
 }
 for(const mode of ['sdk','launch','late-sdk','blocked-storage']){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await prepare(context);
  await context.addInitScript(()=>localStorage.setItem('jpWebsiteLanguageV1','en'));
  if(mode==='sdk')await context.addInitScript(()=>{window.Telegram={WebApp:{platform:'ios',initData:'test-launch',ready(){},expand(){}}}});
  if(mode==='blocked-storage')await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('Storage blocked')}});
  const page=await context.newPage();await page.goto(origin+'/?lang=en'+(mode==='launch'?'#tgWebAppPlatform=ios':''));
  if(mode==='late-sdk')await page.evaluate(()=>{window.Telegram={WebApp:{platform:'ios',initData:'test-launch',ready(){},expand(){}}};initializeTelegram()});
  if(mode==='blocked-storage'){assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.locator('.masthead-inner [data-site-language=ru]').click();assert.equal(await page.locator('html').getAttribute('lang'),'ru')}
  else{assert.equal(await page.locator('html').getAttribute('lang'),'ru');assert.equal(await page.locator('.language-switch:visible').count(),0);assert.equal(await page.locator('.bottom-nav [data-tab]:visible').count(),5);assert.equal(await page.locator('#webHomePage').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('jpWebsiteLanguageV1')),'en','Bot cannot overwrite the website preference')}
  await context.close();console.log(mode+' PASS website-only language guard');
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
