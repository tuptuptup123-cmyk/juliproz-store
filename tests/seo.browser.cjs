const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-seo';fs.mkdirSync(out,{recursive:true});
const products=[{id:99001,created_at:'2026-10-17T00:00:00Z',brand:'Hermès',name:'Сандалии Oran',category:'Обувь',size:'38',price:500,currency:'EUR',available:true,stock_quantities:{38:1},image_url:'https://juliproz-store.vercel.app/images/brands/hermes-birkin.png'},{id:99002,created_at:'2026-10-17T00:00:00Z',brand:'Gucci',name:'Кроссовки',category:'Обувь',size:'40',price:600,currency:'EUR',available:true,stock_quantities:{40:1}}];
const request=async url=>{const id=new URL(url).searchParams.get('id');return Response.json(id?products.filter(p=>'eq.'+p.id===id):products)};
const site=require('../server/site-page.cjs').createHandler({request}),product=require('../server/product-page.cjs').createHandler({request});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),route=url.pathname;
 if(route==='/'||['/catalog','/services','/sell','/outlet'].includes(route)||route.startsWith('/brands/')){url.searchParams.set('page',route==='/'?'home':route.startsWith('/brands/')?'brand':route.slice(1));if(route.startsWith('/brands/'))url.searchParams.set('slug',route.split('/')[2]);req.url='/api/site-page'+url.search;return site(req,res)}
 if(route.startsWith('/product/')){url.searchParams.set('id',route.split('/')[2]);req.url='/api/product-page'+url.search;return product(req,res)}
 const file=path.resolve(root,'.'+route);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)});
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();try{
 for(const width of [320,390,1280]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await context.route('**/api/catalog',r=>r.fulfill({json:products}));await context.route('**/rest/v1/products?**',r=>r.fulfill({json:products}));await context.route('https://juliproz-store.vercel.app/images/**',r=>r.fulfill({path:root+'/images/brands/hermes-birkin.png',contentType:'image/png'}));await context.route('**/api/analytics',r=>r.fulfill({status:204}));await context.addInitScript(()=>{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const homeRequests=[];page.on('request',r=>{if(/\/images\/home-(boutique|lifestyle)\.jpg/.test(r.url()))homeRequests.push(r.url())});
 await page.goto(origin+'/catalog?lang=en');await page.locator('html:not([data-server-view])').waitFor();
 assert.equal(homeRequests.length,0,'Hidden homepage photos must not download in the catalogue');
 assert.equal(await page.locator('.bottom-nav a[href][data-tab]').count(),9);
 assert.equal(await page.locator('.bottom-nav [data-tab=hermes]').getAttribute('href'),'/brands/hermes?lang=en');
 if(width>=900){const popupPromise=context.waitForEvent('page');await page.locator('.bottom-nav [data-tab=outlet]').click({modifiers:['Control']});const popup=await popupPromise;await popup.waitForURL(url=>url.pathname==='/outlet');assert.equal(new URL(popup.url()).pathname,'/outlet');assert.equal(new URL(page.url()).pathname,'/catalog');await popup.close();}
 await page.locator('.bottom-nav [data-tab=home]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.home-photographs img')].every(img=>img.complete&&img.naturalWidth>0));
 assert.equal(new Set(homeRequests).size,2,'SPA home navigation must load both photographs');

 await page.goto(origin+'/');await page.locator('html:not([data-server-view])').waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.match(await page.locator('#webHomeTitle').innerText(),/Buyer service/);
 assert.equal(await page.locator('#homeBuyerContent .home-buyer-steps>li').count(),3);
 assert.equal(await page.locator('#webHomePage a[data-manager-link]').getAttribute('href'),'https://t.me/juliproz');
 assert.equal(await page.locator('#homeBuyerContent a[data-contact-event]').getAttribute('href'),'https://t.me/juliproz');
 const question=page.locator('#homeBuyerContent details').nth(1);
 await question.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await question.getAttribute('open'),'');
 await page.locator('.home-hero-actions a[href="#homeHowItWorks"]').click();assert.ok(await page.locator('#homeHowItWorks').evaluate(el=>el.getBoundingClientRect().top<innerHeight));
 await page.evaluate(()=>scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/home-buyer-ru-'+width+'.png',fullPage:true});
 await page.locator('.masthead-inner [data-site-language=en]').click();
 assert.match(await page.locator('#webHomeTitle').innerText(),/Buyer service/);
 assert.doesNotMatch(await page.locator('#homeBuyerContent').innerText(),/[А-Яа-яЁё]/);
 assert.match(await page.locator('#webHomePage a[data-manager-link]').getAttribute('href'),/^https:\/\/wa.me\//);
 assert.match(await page.locator('#homeBuyerContent a[data-contact-event]').getAttribute('href'),/^https:\/\/wa.me\//);
 assert.equal(await page.locator('#homeBuyerContent a[href^="/services"]').getAttribute('href'),'/services?lang=en');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/home-buyer-en-'+width+'.png',fullPage:true});
 await page.reload();await page.locator('html:not([data-server-view])').waitFor();assert.match(await page.locator('#homeBuyerContent').innerText(),/How personal shopping works/);
 await page.locator('.masthead-inner [data-site-language=ru]').click();assert.match(await page.locator('#homeBuyerContent').innerText(),/Как заказать через байера/);
 assert.equal(new URL(page.url()).searchParams.has('lang'),false);
 assert.equal(await page.locator('meta[property="og:locale"]').getAttribute('content'),'ru_RU');
 assert.equal(await page.locator('#homeBuyerContent a[data-contact-event]').getAttribute('href'),'https://t.me/juliproz');
 console.log('PASS homepage steps, FAQ keyboard, anchor, RU/EN contacts, reload and layout',width);
 const nav=page.locator('.bottom-nav');
 assert.deepEqual(await nav.locator('[data-tab]:visible').evaluateAll(items=>items.map(x=>x.dataset.tab)),['home','catalog','hermes','outlet','favorites','cart','sell','services','about']);
 await nav.locator('[data-tab=hermes]').click();await page.waitForURL(url=>url.pathname==='/brands/hermes');
 assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-tab'),'hermes');
 assert.equal(await page.locator('#seoCatalogIntro .discovery-model').count(),3);
 await page.locator('#seoCatalogIntro .discovery-model summary').first().click();assert.equal(await page.locator('#seoCatalogIntro .discovery-model').first().getAttribute('open'),'');
 await page.locator('#seoCatalogIntro .discovery-model summary').first().click();
 await nav.locator('[data-tab=outlet]').click();await page.waitForURL(url=>url.pathname==='/outlet');
 assert.equal(await page.locator('#webOutletPage h1').innerText(),'Аутлеты и приватные сейлы');
 assert.equal(await page.locator('#webOutletPage .discovery-breadcrumb, #webOutletPage .discovery-eyebrow').count(),0);
 assert.equal(await page.locator('#grid').isVisible(),false);
 assert.equal(await page.locator('#webOutletPage .discovery-channels a').first().getAttribute('href'),'https://t.me/+lz-ze3-GDEQ0YmFi');
 await page.goBack();await page.waitForURL(url=>url.pathname==='/brands/hermes');assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-tab'),'hermes');
 await page.goForward();await page.waitForURL(url=>url.pathname==='/outlet');await page.reload();await page.locator('html:not([data-server-view])').waitFor();assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-tab'),'outlet');
 await page.locator('.masthead-inner [data-site-language=en]').click();assert.doesNotMatch(await page.locator('#webOutletPage').innerText(),/[А-Яа-яЁё]/);
 assert.match(await page.locator('#webOutletPage .discovery-button').first().getAttribute('href'),/^https:\/\/wa.me\//);
 assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://www.juliproz.com/outlet?lang=en');
 assert.equal(await page.locator('meta[property="og:locale"]').getAttribute('content'),'en_US');
 assert.equal(await page.locator('link[hreflang=ru]').getAttribute('href'),'https://www.juliproz.com/outlet');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/outlet-en-'+width+'.png',fullPage:true});await page.screenshot({path:out+'/outlet-first-'+width+'.png',fullPage:false});
 for(const tab of ['about','services','sell','cart','favorites','home','catalog','hermes']){await nav.locator('[data-tab='+tab+']').click();assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-tab'),tab);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.equal(await nav.evaluate(el=>el.scrollWidth>el.clientWidth),width<900);
 await page.locator('.masthead-inner [data-site-language=ru]').click();
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/hermes-ru-'+width+'.png',fullPage:true});await page.screenshot({path:out+'/hermes-first-'+width+'.png',fullPage:false});
 await nav.locator('[data-tab=catalog]').click();
 assert.equal(await page.locator('.discovery-directory').count(),0);
 assert.equal(await page.locator('#grid .product').count(),2);
 await page.locator('#openCatalogMenu').click();await page.locator('[data-menu-group=brand]').click();
 assert.equal(await page.locator('[data-menu-type=brand][data-menu-value="Hermès"]').getAttribute('href'),'/brands/hermes');await page.locator('[data-menu-type=brand][data-menu-value="Hermès"]').click();await page.locator('#showMenuProducts').click();
 assert.equal(await page.locator('#grid .product').count(),1);
 await page.locator('#openCatalogMenu').click();await page.locator('#resetMenu').click();await page.locator('#showMenuProducts').click();
 assert.equal(await page.locator('#grid .product').count(),2);
 await nav.locator('[data-tab=hermes]').click();await nav.locator('[data-tab=home]').click();await page.locator('[data-web-section=catalog]:visible').first().click();
 assert.equal(await page.locator('#grid .product').count(),2,'The main shop must not retain the editorial Hermes filter');
 for(const slug of ['chanel','loro-piana']){await page.goto(origin+'/brands/'+slug+'?lang=en');await page.locator('html:not([data-server-view])').waitFor();assert.doesNotMatch(await page.locator('#seoCatalogIntro').innerText(),/[А-Яа-яЁё]/);assert.equal(await page.locator('#grid .product').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 console.log('PASS nine tabs, Hermes/Outlet routing, reload, Back/Forward, contacts, existing brand filter and responsive overflow',width);

 await page.goto(origin+'/brands/hermes?lang=en');await page.locator('#grid .product').waitFor();assert.equal(await page.locator('#grid .product').count(),1);assert.match(await page.locator('#seoCatalogIntro h1').innerText(),/Hermès/);assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.match(await page.locator('#grid .product-open').getAttribute('href'),/product\/99001\?lang=en$/);
 await page.locator('.masthead-inner [data-site-language=ru]').click();assert.match(await page.locator('#seoCatalogIntro p').first().innerText(),/сумок Hermès/);await page.reload();await page.locator('#grid .product').waitFor();assert.equal(await page.locator('#grid .product').count(),1);
 await page.locator('.product-open').click();await page.locator('#productContent h1').waitFor();assert.match(await page.locator('a.related-card').first().getAttribute('href'),/product\/99002$/);await page.locator('a.related-card').first().click();assert.match(await page.locator('#productContent h1').innerText(),/Кроссовки/);await page.locator('#backProduct').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/seo-brand-'+width+'.png',fullPage:true});
 for(const route of ['/?lang=en','/catalog?lang=en','/services?lang=en','/sell?lang=en','/product/99001?lang=en']){await page.goto(origin+route);await page.locator('html:not([data-server-view])').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');if(route.startsWith('/product/'))await page.locator('#productContent h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await nav.locator('[data-tab=outlet]').click();
 assert.equal(await page.locator('meta[property="og:type"]').getAttribute('content'),'website');
 assert.equal(await page.locator('meta[name="twitter:title"]').getAttribute('content'),await page.title());
 assert.equal(await page.locator('script[type="application/ld+json"]').evaluateAll(items=>items.some(el=>JSON.parse(el.textContent)['@type']==='Product')),false,'Outlet must not keep product structured data');
 await page.goBack();await page.locator('#productContent h1').waitFor();
 assert.equal(await page.locator('#productModal').isVisible(),true,'Browser Back restores the product');
 assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://www.juliproz.com/product/99001?lang=en');
 await page.locator('.product-toolbar [data-site-language=ru]').click();
 assert.equal(await page.locator('meta[name="twitter:title"]').getAttribute('content'),await page.title());
 assert.equal(await page.locator('script[type="application/ld+json"]').evaluateAll(items=>items.map(el=>JSON.parse(el.textContent)).find(x=>x['@type']==='Product').url),'https://www.juliproz.com/product/99001');
 await page.locator('#backProduct').click();assert.equal(new URL(page.url()).pathname,'/catalog');
 await page.reload();await page.locator('#grid .product').first().waitFor();assert.equal(await page.locator('#productModal').isVisible(),false,'Reload after closing a direct product link stays in the catalog');
 assert.deepEqual(errors,[]);await context.close();console.log('PASS SEO hydration, links, brand filter, RU/EN switch, reload and mobile layout',width);
 }
 products[1].original_price=900;
 products.push(
  {id:99003,brand:'Gucci',name:'Куртка',category:'Куртки',size:'M',price:500,original_price:1500,currency:'EUR',available:true},
  {id:99004,brand:'Gucci',name:'Куртка без скидки',category:'Куртки',size:'M',price:500,currency:'EUR',available:true},
  {id:99005,brand:'Loro Piana',name:'Кепка',category:'Кепки',size:'M',price:100,original_price:200,currency:'EUR',available:true}
 );
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/api/catalog',r=>r.fulfill({json:products}));await context.route('**/rest/v1/products?**',r=>r.fulfill({json:products}));await context.route('**/api/analytics',r=>r.fulfill({status:204}));
  await context.addInitScript(()=>{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')});
  const page=await context.newPage();
  for(const [collection,id] of [['clothing','99003'],['shoes','99002'],['accessories','99005']]){
   await page.goto(origin+'/outlet?lang=en');await page.locator('#webOutletPage [data-sale-collection="'+collection+'"]').click();
   await page.waitForURL(url=>url.pathname==='/catalog'&&url.searchParams.get('collection')===collection);await page.locator('#grid .product').first().waitFor();
   assert.deepEqual(await page.locator('#grid .product').evaluateAll(cards=>cards.map(c=>c.dataset.id)),[id]);
   assert.equal(await page.locator('#seoCatalogIntro').isVisible(),false);assert.match(await page.locator('#filterSummary').innerText(),/SALE/);
   await page.reload();await page.locator('#grid .product').first().waitFor();assert.equal(await page.locator('#grid .product').count(),1);assert.equal(await page.locator('#grid .product').getAttribute('data-id'),id);
   await page.locator('.masthead-inner [data-site-language=ru]').click();assert.equal(new URL(page.url()).searchParams.get('collection'),collection);assert.equal(await page.locator('#grid .product').getAttribute('data-id'),id);
   await page.goBack();await page.locator('#webOutletPage h1').waitFor();assert.equal(new URL(page.url()).pathname,'/outlet');
   await page.goForward();await page.locator('#grid .product').first().waitFor();assert.equal(await page.locator('#grid .product').getAttribute('data-id'),id);
  }
  await page.locator('.bottom-nav [data-tab=outlet]').click();await page.locator('#webOutletPage .outlet-section-heading a').click();await page.locator('#grid .product').first().waitFor();assert.deepEqual((await page.locator('#grid .product').evaluateAll(cards=>cards.map(c=>c.dataset.id))).sort(),['99002','99003','99005']);
  await page.locator('#reset').click();assert.equal(await page.locator('#grid .product').count(),products.length);assert.equal(new URL(page.url()).searchParams.has('sale'),false);assert.equal(new URL(page.url()).searchParams.has('collection'),false);
  await page.reload();await page.locator('#grid .product').first().waitFor();assert.equal(await page.locator('#grid .product').count(),products.length);
  await context.close();console.log('PASS Outlet SALE categories, exact discount matching, reload, language, Back/Forward and reset '+width);
 }
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();await page.goto(origin+'/brands/hermes?lang=en');assert.match(await page.locator('#serverLanding h1').innerText(),/Hermès/);assert.equal(await page.locator('#serverLanding a[href*="/product/"]').count(),1);await page.goto(origin+'/product/99001?lang=en');assert.match(await page.locator('#serverProduct h1').innerText(),/Oran sandals/);console.log('PASS source pages remain readable and linked without JavaScript');await context.close();
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
