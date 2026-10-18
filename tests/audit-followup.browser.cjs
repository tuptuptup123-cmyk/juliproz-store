'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-audit-followup';fs.mkdirSync(out,{recursive:true});
const rows=[
 {id:99004,brand:'Test Brand',name:'Необычная подвеска Орбита',name_en:'Orbit pendant',description:'Описание новой вещи вне словаря.',description_en:'A pendant with an adjustable cord.',category:'Украшения',size:'One Size',price:null,currency:'EUR',available:true},
 {id:99001,brand:'Hermès',name:'Сумка Kelly',category:'Сумки',size:'25; 28',price:500,currency:'EUR',available:true,stock_quantities:{25:2,28:1},image_url:'https://juliproz-store.vercel.app/images/brands/hermes-birkin.png'},
 {id:475,brand:'Chanel',name:'Сумка Chanel 25 mini',category:'Сумки',size:'One Size',price:600,currency:'EUR',available:true,stock_quantities:{'One Size':1}},
 ...[301,302].map(id=>({id,brand:'Brioni',name:'Футболка',category:'Футболки',size:id===301?'XXL':'XL',price:500,currency:'EUR',available:true,stock_quantities:{[id===301?'XXL':'XL']:1}})),
 ...[388,297].map(id=>({id,brand:'Loro Piana',name:'Кепка',category:'Головной убор',size:'M',price:350,currency:'EUR',available:true,stock_quantities:{M:1}}))
];
const request=async url=>{const id=new URL(url).searchParams.get('id');return Response.json(id?rows.filter(p=>'eq.'+p.id===id):rows)};
const site=require('../server/site-page.cjs').createHandler({request}),product=require('../server/product-page.cjs').createHandler({request}),legal=require('../server/legal-page.cjs').createHandler();
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),route=url.pathname;
 if(['/terms.html','/privacy.html'].includes(route)){url.searchParams.set('page',route.slice(1,-5));req.url='/api/legal-page'+url.search;return legal(req,res)}
 if(route==='/'||['/catalog','/services','/sell','/outlet'].includes(route)||route.startsWith('/brands/')){url.searchParams.set('page',route==='/'?'home':route.startsWith('/brands/')?'brand':route.slice(1));if(route.startsWith('/brands/'))url.searchParams.set('slug',route.split('/')[2]);req.url='/api/site-page'+url.search;return site(req,res)}
 if(route.startsWith('/product/')){url.searchParams.set('id',route.split('/')[2]);req.url='/api/product-page'+url.search;return product(req,res)}
 const file=path.resolve(root,'.'+route);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
 try{
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
   await context.route('https://telegram.org/**',r=>r.abort());await context.route('**/api/catalog',r=>r.fulfill({json:rows}));await context.route('**/rest/v1/products?**',r=>r.fulfill({json:rows}));await context.route('https://juliproz-store.vercel.app/images/**',r=>r.fulfill({path:root+'/images/brands/hermes-birkin.png',contentType:'image/png'}));
   await context.addInitScript(()=>{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/catalog?lang=en');await page.locator('#grid .product').first().waitFor();
   const bag=await page.locator('.bottom-nav [data-tab=cart]').boundingBox();assert.ok(bag.x>=0&&bag.x+bag.width<=width,'Bag immediately visible');
   await page.locator('#toggleSearch').click();await page.locator('#search').fill('Kelly');await page.locator('#grid .product').waitFor();
   await page.locator('.product-open').click();await page.waitForURL(u=>u.pathname==='/product/99001');assert.match(await page.title(),/Hermès/);
   await page.locator('[data-size="28"]').click();assert.equal(new URL(page.url()).searchParams.get('size'),'28');
   assert.equal(await page.locator('.related-name').innerText(),'25 Mini bag');
   await page.goBack();await page.locator('#grid .product').waitFor();assert.equal(await page.locator('#grid .product').count(),1);assert.equal(await page.evaluate(()=>state.search),'Kelly');
   await page.goForward();await page.locator('[data-size="28"][aria-pressed=true]').waitFor();
   await page.reload();await page.locator('[data-size="28"][aria-pressed=true]').waitFor();assert.match(await page.title(),/Hermès/);
   await page.locator('.related-card').click();await page.waitForURL(u=>u.pathname==='/product/475');assert.match(await page.title(),/Chanel/);
   const schema=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.textContent)).find(s=>s['@type']==='Product'));
   assert.equal(schema.sku,'475');assert.equal(schema.offers.price,600);assert.equal(schema.offers.url,'https://www.juliproz.com/product/475?lang=en');
   await page.locator('#backProduct').click();await page.waitForURL(u=>u.pathname==='/catalog');await page.locator('#grid .product').waitFor();assert.equal(await page.evaluate(()=>state.search),'Kelly');
   if(width<900){
    await page.locator('#moreNavigation').click();await page.locator('[data-more-tab=about]').click();assert.equal(await page.evaluate(()=>state.tab),'about');
    await page.locator('#moreNavigation').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('moreNavigationDialog').open);assert.equal(await page.evaluate(()=>document.activeElement.id),'moreNavigation');
   }
   await page.screenshot({path:out+'/navigation-'+width+'.png',fullPage:false});
   await page.goto(origin+'/product/302?lang=en');await page.locator('[data-size=XXL]').click();await page.waitForURL(u=>u.pathname==='/product/301');
   await page.reload();await page.locator('[data-size=XXL][aria-pressed=true]').waitFor();
   await page.goto(origin+'/product/301?lang=en&size=XL');await page.locator('[data-size=XXL][aria-pressed=true]').waitFor();assert.equal(new URL(page.url()).pathname,'/product/301','Conflicting size query cannot switch a physical SKU');
   await page.goto(origin+'/product/388?lang=en');await page.locator('[data-color-id="297"]').click();await page.waitForURL(u=>u.pathname==='/product/297');
   await page.reload();await page.locator('[data-color-id="297"][aria-pressed=true]').waitFor();
   await page.goto(origin+'/product/99004?lang=en');await page.locator('#productContent h1').waitFor();assert.equal(await page.locator('#productContent h1').innerText(),'Orbit pendant');assert.match(await page.locator('.product-description').innerText(),/adjustable cord/);assert.match(await page.title(),/Orbit pendant/);
   await page.locator('.product-toolbar [data-site-language=ru]').click();assert.match(await page.locator('#productContent h1').innerText(),/Орбита/);
   await page.locator('.product-toolbar [data-site-language=en]').click();assert.equal(await page.locator('#productContent h1').innerText(),'Orbit pendant');
   const unpricedSchema=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.textContent)));assert.ok(!unpricedSchema.some(s=>s['@type']==='Product'));
   await page.goto(origin+'/product/1?lang=ru');assert.match(await page.locator('body').innerText(),/Этой вещи сейчас нет/);
   for(const kind of ['terms','privacy']){
    await page.goto(origin+'/'+kind+'.html?lang=en');await page.locator('[data-site-language=en][aria-pressed=true]').waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(),/[А-Яа-яЁё]/);
    await page.locator('[data-site-language=ru]').click();assert.match(await page.locator('h1').innerText(),/Условия|Конфиденциальность/);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://www.juliproz.com/'+kind+'.html');
    await page.locator('[data-site-language=en]').click();assert.doesNotMatch(await page.locator('main').innerText(),/[А-Яа-яЁё]/);
    assert.equal(await page.locator('[data-manager-link]').getAttribute('href'),'https://wa.me/message/LX6SBE3QCQXKG1');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:out+'/'+kind+'-en-'+width+'.png',fullPage:true});
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS audit fixes: bag, product URL/size/reload/history/filter, schema, translation, legal pages '+width);
  }
  const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
  await page.goto(origin+'/product/99004?lang=en');assert.match(await page.locator('#serverProduct').innerText(),/Orbit pendant/);assert.doesNotMatch(await page.locator('#serverProduct').innerText(),/[А-Яа-яЁё]/);
   for(const kind of ['terms','privacy']){await page.goto(origin+'/'+kind+'.html?lang=en');assert.doesNotMatch(await page.locator('main').innerText(),/[А-Яа-яЁё]/);assert.match(await page.title(),/JULI.PROZ/);assert.equal(await page.locator('noscript a').count(),2)}
  await context.close();console.log('PASS legal English content and language links without JavaScript');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
