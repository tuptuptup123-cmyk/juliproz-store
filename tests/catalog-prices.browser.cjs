const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/catalog-price-qa';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(file===root+'/')file+='index.html';fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
const base={available:true,currency:'EUR',category:'Одежда',gender:'men',fulfillment_status:'in_stock',product_condition:'new',size:'L',photos:[],image_url:null};
const fixtures=[
 {...base,id:900001,brand:'Gucci',name:'Рубашка GG cotton poplin bowling',price:350,original_price:1380,product_condition:'pre_owned',wear_condition:'gently_used',on_commission:true,size:'50'},
 {...base,id:900002,brand:'Zilli',name:'Кофта',price:400,original_price:1300},
 {...base,id:900003,brand:'Amiri',name:'Штаны Ball',price:624.9,original_price:892.72,size:'XL'},
 {...base,id:900004,brand:'Dior',name:'Кроссовки B27 Low Grey CD Diamond',price:700,original_price:990,size:'43'},
 {...base,id:900005,brand:'Hermès',name:'Сумка',price:12345.67,original_price:19876.54},
 {...base,id:900006,brand:'Prada',name:'Жакет с очень длинным названием без скрытой информации',price:800,original_price:null,reserved:true},
 {...base,id:900007,brand:'Chanel',name:'Сумка',price:null,original_price:null},
 {...base,id:900008,brand:'Loro Piana',name:'Шарф',price:300,original_price:null,fulfillment_status:'on_order'}
];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});try{
 for(const width of [320,360,390,400,529,768,1280]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/products?**',r=>r.fulfill({json:fixtures}));
  await page.addInitScript(()=>localStorage.setItem('jpAnalyticsConsent','declined'));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.locator('.product').nth(7).waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.product h3 .card-sale-badge').count(),5);
  assert.equal(await page.locator('.card-name-row .card-sale-badge').count(),0);
  assert.equal(await page.locator('.product .catalog-status').filter({hasText:'В наличии'}).count(),0);
  assert.equal(await page.locator('.product .catalog-status.is-reserved').count(),1);
  assert.equal(await page.locator('.product .catalog-status.on-order').innerText(),'Под заказ');
  const saleOrder=await page.locator('.sale-price').evaluateAll(es=>es.map(e=>e.querySelector('.price-original').getBoundingClientRect().bottom<=e.querySelector('.price-current').getBoundingClientRect().y));
  assert.ok(saleOrder.every(Boolean),'Small former price precedes large current price');
  const brandBadges=await page.locator('.product h3:has(.card-sale-badge)').evaluateAll(es=>es.map(e=>({brand:e.querySelector('button').getBoundingClientRect().right,badge:e.querySelector('.card-sale-badge').getBoundingClientRect().x})));
  assert.ok(brandBadges.every(b=>Math.abs(b.badge-b.brand-6)<1),'SALE sits directly after the brand');
  assert.match(await page.locator('[data-id="900001"] .card-meta').innerText(),/Небольшие следы носки/);
  assert.match(await page.locator('[data-id="900001"] .card-meta').innerText(),/Комиссия/);
  const cards=await page.locator('.product').evaluateAll(els=>els.map(el=>{
   const rect=x=>{const b=x.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom}};
   return {photo:rect(el.querySelector('.photo')),price:rect(el.querySelector('.price')),size:rect(el.querySelector('.card-size')),card:rect(el),parts:[...el.querySelectorAll('.sale-price>*')].map(rect).sort((a,b)=>a.y-b.y)};
  }));
  for(const card of cards){
   assert.ok(card.price.right<=card.card.right+1,'Price fits card');
   assert.ok(card.price.y-card.size.bottom<=6,'Compact size-to-price spacing');
   for(let i=0;i<card.parts.length;i++){
    assert.ok(Math.abs(card.parts[i].x-card.price.x)<1,'Prices share left edge');
    assert.ok(card.parts[i].right<=card.card.right+1,'Amount fits card');
    if(i)assert.ok(card.parts[i].y>=card.parts[i-1].bottom,'Vertical price order');
   }
   const neighbours=cards.filter(c=>Math.abs(c.photo.y-card.photo.y)<1);
   assert.ok(neighbours.every(c=>Math.abs(c.price.y-card.price.y)<1),'Prices start at same height within each row');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.locator('.product').first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/catalog-'+width+'.png'});
  await page.locator('[data-heart="900001"]').click();await page.locator('[data-tab="favorites"]').click();assert.equal(await page.locator('.product').count(),1);
  await page.locator('.product-open').click();await page.locator('#backProduct').click();assert.equal(await page.locator('.product').count(),1);
  await page.locator('[data-tab="services"]').click();
  for(const target of ['catalog','favorites','cart','sell','services']){
   await page.locator('[data-tab="'+target+'"]').click();
   assert.equal(await page.locator('.bottom-nav [aria-current="page"]').getAttribute('data-tab'),target);
   const nav=await page.locator('.bottom-nav button').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,background:getComputedStyle(e).backgroundColor,iconWidth:e.querySelector('svg').getBoundingClientRect().width,outline:getComputedStyle(e.querySelector('svg')).outlineStyle})));
   assert.ok(nav.every(n=>n.background==='rgba(0, 0, 0, 0)'&&n.iconWidth===24&&n.outline==='none'),'Navigation has no tile fills or icon borders');
   assert.ok(nav.every(n=>Math.abs(n.width-nav[0].width)<1),'Navigation columns are equal');
  }
  const services=await page.locator('.services-page .sell-intro p,.services-page .service-card p').evaluateAll(es=>es.map(e=>({align:getComputedStyle(e).textAlign,hyphens:getComputedStyle(e).hyphens})));
  assert.ok(services.length>=3&&services.every(s=>s.align==='left'&&s.hyphens==='none'),'Services copy is left-aligned without automatic hyphens');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Services fit narrow screens');
  if(width===390||width===529)await page.screenshot({path:out+'/services-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);await page.close();console.log(width+' PASS: aligned price stacks, full metadata, no overflow, wishlist and product back');
 }

 // Capture real public catalogue data with this revision's UI, without writes.
 for(const width of [390,529]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('jpAnalyticsConsent','declined'));
  await page.route('https://juliproz-store.vercel.app/images/**',r=>{
   const file=path.join(root,new URL(r.request().url()).pathname);
   return fs.existsSync(file)?r.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'image/webp'}):r.continue();
  });
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.locator('.product').first().waitFor();await page.locator('#openCatalogMenu').click();
  await page.locator('[data-sale]').click();await page.locator('#showMenuProducts').click();
  await page.locator('.product .sale-price').first().waitFor();
  await page.locator('.product').first().scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:out+'/live-sale-catalog-'+width+'.png'});
  const roundedCard=page.locator('.product').filter({hasText:'Штаны Ball'});
  if(await roundedCard.count()){await roundedCard.first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/live-sale-catalog-rounding-'+width+'.png'});}
  await page.close();
 }
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
