const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/catalog-price-qa';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(file===root+'/')file+='index.html';fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
const base={available:true,currency:'EUR',category:'Одежда',gender:'men',fulfillment_status:'in_stock',product_condition:'new',size:'L',photos:[],image_url:null};
const fixtures=[
 {...base,id:900001,brand:'Gucci',name:'Рубашка GG cotton poplin bowling',price:350,original_price:538.46,product_condition:'pre_owned',wear_condition:'gently_used',on_commission:true,size:'50',stock_quantities:{'50':3}},
 {...base,id:900002,brand:'Zilli',name:'Кофта',price:400,original_price:571.43},
 {...base,id:900003,brand:'Amiri',name:'Штаны Ball',price:624.9,original_price:892.72,size:'XL'},
 {...base,id:900004,brand:'Dior',name:'Кроссовки B27 Low Grey CD Diamond',price:700,original_price:990,size:'43'},
 {...base,id:900005,brand:'Hermès',name:'Сумка',price:12345.67,original_price:19876.54},
 {...base,id:900006,brand:'Prada',name:'Жакет с очень длинным названием без скрытой информации',price:800,original_price:null,reserved:true,on_commission:true},
 {...base,id:900007,brand:'Chanel',name:'Сумка',price:null,original_price:null},
 {...base,id:900008,brand:'Loro Piana',name:'Шарф',price:300,original_price:null,fulfillment_status:'on_order'},
 {...base,id:900009,brand:'Chrome Hearts',name:'Кепка',price:200,stock_quantities:{'L':15}}
];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});try{
 for(const width of [320,360,390,400,529,600,601,700,768,1024,1280,1920]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/products?**',r=>r.fulfill({json:fixtures}));
  await page.addInitScript(()=>localStorage.setItem('jpAnalyticsConsent','declined'));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.locator('.product').nth(7).waitFor();await page.evaluate(()=>document.fonts.ready);
  const surfaces=await page.locator('body,.brand,.menu-panel,.menu-header,.bottom-nav').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor));
  assert.ok(surfaces.every(c=>c==='rgb(255, 255, 255)'),'Storefront surfaces are white');
  assert.ok((await page.locator('.product .photo').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor))).every(c=>c==='rgb(245, 245, 245)'),'Photo panels are neutral pale gray');
  const hearts=await page.locator('.product .heart').evaluateAll(es=>es.map(e=>({color:getComputedStyle(e).color,border:getComputedStyle(e).borderWidth,background:getComputedStyle(e).backgroundColor,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
  assert.ok(hearts.every(h=>h.color==='rgb(198, 107, 149)'&&h.border==='0px'&&h.background==='rgba(0, 0, 0, 0)'&&h.width>=44&&h.height>=44),'Pink-only hearts have no circle and retain touch targets');
  assert.equal(await page.locator('.product .card-name-row p').first().evaluate(e=>getComputedStyle(e).fontWeight),'300');
  assert.equal(await page.locator('.product .price-current').first().evaluate(e=>getComputedStyle(e).fontWeight),'500');
  assert.equal(await page.locator('.brand-signature').innerText(),'BY VASYA');
  assert.equal(await page.locator('#search').evaluate(e=>getComputedStyle(e).fontSize),'16px');
  assert.equal(await page.locator('#offerItem svg').count(),1);
  assert.ok(await page.evaluate(()=>document.querySelector('meta[name=viewport]').content.includes('width=device-width')));
  assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).webkitTextSizeAdjust),'100%');
  const signature=await page.locator('.brand-signature').evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('#toggleSearch').getBoundingClientRect(),l=document.querySelector('.brand .logo').getBoundingClientRect();return {right:r.right,left:r.left,top:r.top,bottom:r.bottom,searchLeft:s.left,searchBottom:s.bottom,logoRight:l.right,size:getComputedStyle(e).fontSize}});
  const headerControls=await page.evaluate(()=>['.brand .logo','#openCatalogMenu','#toggleSearch'].map(s=>document.querySelector(s).getBoundingClientRect().toJSON()));
  const [logo,menu,search]=headerControls;
  assert.ok(logo.left>=menu.right-.5||logo.top>=menu.bottom||logo.bottom<=menu.top,'J.P does not overlap menu at '+width);
  assert.ok(signature.right<=search.left-8||signature.top>=search.bottom||signature.bottom<=search.top,'Signature clears search at '+width);
  assert.equal(signature.size,width<=600?'10px':'13px');assert.ok(signature.left>=signature.logoRight,'Signature sits right of J.P');assert.ok(signature.right<=signature.searchLeft||signature.top>=signature.searchBottom,'Signature does not overlap search');
  if(width<=600){const b=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {logo:r('.brand-lockup'),menu:r('#openCatalogMenu'),search:r('#toggleSearch')}});assert.ok(b.logo.left>=b.menu.right&&b.logo.right<=b.search.left,'Logo is between controls without overlap');assert.ok(Math.abs((b.logo.left+b.logo.right)/2-((b.menu.left+b.menu.right)/2+(b.search.left+b.search.right)/2)/2)<2,'Logo midpoint matches menu/search midpoint');assert.ok(Math.abs((b.logo.top+b.logo.bottom)/2-(b.menu.top+b.menu.bottom)/2)<2,'Logo and menu share the same row');}
  assert.equal(await page.locator('#catalogSortLabel').innerText(),'Сортировка');
  await page.locator('#catalogSort').click();await page.locator('[data-sort="price_asc"]').click();
  assert.equal(await page.locator('#catalogSortLabel').innerText(),'Сортировка');
  assert.match(await page.locator('#catalogSort').getAttribute('aria-label'),/Дешевле/);
  await page.locator('#catalogSort').click();await page.locator('[data-sort="newest"]').click();
  assert.equal(await page.locator('.product h3 .card-sale-badge').count(),5);
  assert.equal(await page.locator('.product .discount-badge').count(),0,'Public prices retain SALE and former price without percentage badges');
  assert.equal(await page.locator('.card-name-row .card-sale-badge').count(),0);
  const saleColors=await page.locator('.card-sale-badge').evaluateAll(es=>es.map(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})));
  assert.match(await page.locator('.card-sale-badge').first().evaluate(e=>getComputedStyle(e).boxShadow),/rgb\(120, 148, 182\)/,'SALE has a brand-blue outline');
  assert.ok(saleColors.every(c=>c.background==='rgb(228, 202, 221)'&&c.color==='rgb(37, 57, 79)'),'SALE is powder pink with dark readable text');
  assert.equal(await page.locator('.product .price-original').count(),5,'Former prices remain visible');
  assert.equal(await page.locator('.product .catalog-status').filter({hasText:'В наличии'}).count(),0);assert.equal(await page.locator('.product .stock-label').count(),0);assert.equal(await page.locator('[data-id="900006"] .stock-label').count(),0);assert.equal(await page.locator('[data-id="900008"] .stock-label').count(),0);
  assert.equal(await page.locator('.product .catalog-status.is-reserved').count(),1);
  assert.equal(await page.locator('.product .catalog-status.on-order').innerText(),'Под заказ');
  const saleOrder=await page.locator('.sale-price').evaluateAll(es=>es.map(e=>e.querySelector('.price-original').getBoundingClientRect().bottom<=e.querySelector('.price-current').getBoundingClientRect().y));
  assert.ok(saleOrder.every(Boolean),'Small former price precedes large current price');
  const brandBadges=await page.locator('.product h3:has(.card-sale-badge)').evaluateAll(es=>es.map(e=>({brand:e.querySelector('button').getBoundingClientRect().right,badge:e.querySelector('.card-sale-badge').getBoundingClientRect().x})));
  assert.ok(brandBadges.every(b=>Math.abs(b.badge-b.brand-6)<1),'SALE sits directly after the brand');
  assert.equal(await page.locator('[data-id="900001"] .condition-badge').first().innerText(),'PRE-OWNED');
  assert.equal(await page.locator('[data-id="900001"] .commission-badge').innerText(),'Комиссия');
  assert.equal(await page.locator('[data-id="900001"] .condition-wear').count(),0);

  assert.match(await page.locator('[data-id="900001"] .card-meta').innerText(),/Комиссия/);
  const infoBadges=await page.locator('.product .condition-badge').evaluateAll(es=>es.map(e=>({bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor,weight:getComputedStyle(e).fontWeight})));
  assert.ok(infoBadges.every(b=>b.bg==='rgb(246, 246, 246)'&&b.border==='rgb(216, 216, 216)'&&b.weight==='700'),'Informational badges are neutral with bold text');
  const cards=await page.locator('.product').evaluateAll(els=>els.map(el=>{
   const rect=x=>{const b=x.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom}};
   return {photo:rect(el.querySelector('.photo')),price:rect(el.querySelector('.price')),meta:el.querySelector('.card-meta')?.children.length?rect(el.querySelector('.card-meta')):null,size:rect(el.querySelector('.card-size')),card:rect(el),parts:[...el.querySelectorAll('.sale-price>*')].map(rect).sort((a,b)=>a.y-b.y)};
  }));
  for(const card of cards){
   assert.ok(card.price.right<=card.card.right+1,'Price fits card');
   assert.ok(card.price.y>=card.size.bottom,'Price follows the size');
   if(card.meta)assert.ok(Math.abs(card.meta.y-card.price.bottom-5)<1,'Badges always sit 5px below price, with or without a discount');
   for(let i=0;i<card.parts.length;i++){
    assert.ok(Math.abs(card.parts[i].x-card.price.x)<1,'Prices share left edge');
    assert.ok(card.parts[i].right<=card.card.right+1,'Amount fits card');
    if(i)assert.ok(card.parts[i].y>=card.parts[i-1].bottom,'Vertical price order');
   }
   const neighbours=cards.filter(c=>Math.abs(c.photo.y-card.photo.y)<1);
   assert.ok(neighbours.every(c=>Math.abs(c.price.bottom-card.price.bottom)<1),'Current prices end at the same height within each row');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.locator('.product').first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/catalog-'+width+'.png'});
  await page.locator('#openCatalogMenu').click();const hot=await page.locator('.hot-brands').boundingBox(),sale=await page.locator('[data-sale]').boundingBox();assert.ok(hot.y+hot.height<=sale.y,'Hot brands are above SALE');if(width===390||width===1280)await page.screenshot({path:out+'/hot-brands-'+width+'.png'});
  for(const [brand,id] of [['Hermès','900005'],['Chrome Hearts','900009']]){await page.locator('[data-hot-brand="'+brand+'"]').click();assert.equal(await page.locator('[data-hot-brand="'+brand+'"]').getAttribute('aria-pressed'),'true');await page.locator('#showMenuProducts').click();assert.equal(await page.locator('#grid .product').count(),1);assert.equal(await page.locator('#grid .product').getAttribute('data-id'),id);await page.locator('#openCatalogMenu').click();}
  await page.locator('#resetMenu').click();await page.locator('#showMenuProducts').click();
  await page.locator('[data-heart="900001"]').click();await page.locator('[data-tab="favorites"]').click();assert.equal(await page.locator('.product').count(),1);
  await page.locator('.product-open').click();
  assert.equal(await page.locator('.detail .condition-badge').first().innerText(),'PRE-OWNED');assert.equal(await page.locator('#detailStock').innerText(),'В наличии · 3 шт.');
  assert.match(await page.locator('.product-description').innerText(),/Состояние: Небольшие следы носки/);
  assert.equal(await page.locator('.detail .product-eyebrow span').count(),0,'Do not repeat positive in-stock status in detail');
  assert.equal(await page.locator('.detail .discount-badge').count(),0,'Detail hides percentage badges too');
  assert.equal(await page.locator('.detail .price-original').count(),1,'Detail retains former price');
  const detailBadge=await page.locator('.detail .condition-badge').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,weight:getComputedStyle(e).fontWeight}));assert.deepEqual(detailBadge,{bg:'rgb(246, 246, 246)',weight:'700'});
  assert.equal(await page.locator('.purchase-action').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(228, 202, 221)');
  const managerCta=await page.locator('.product-sourcing .sourcing-link').evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,height:e.getBoundingClientRect().height}));
  assert.equal(managerCta.background,'rgb(228, 202, 221)');assert.equal(managerCta.color,'rgb(37, 57, 79)');assert.ok(managerCta.height>=48);
  if(width===390){await page.locator('.product-sourcing .sourcing-link').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/manager-contact-390.png'});}
  await page.locator('#backProduct').click();assert.equal(await page.locator('.product').count(),1);
  const headerBaseline=await page.locator('.brand .logo').evaluate(e=>e.getBoundingClientRect().bottom+window.scrollY);
  await page.locator('[data-tab="services"]').click();
  for(const target of ['catalog','favorites','cart','sell','services']){
   await page.locator('[data-tab="'+target+'"]').click();
   assert.equal(await page.locator('.bottom-nav [aria-current="page"]').getAttribute('data-tab'),target);
   if(target==='sell'||target==='services'){
    assert.equal(await page.locator('#sellPage .sell-paw,#servicesPage .sell-paw').count(),0,'Only the main header paw remains');
    if(width<=600){const bounds=await page.locator('.brand-lockup,.brand-signature,.brand-paw').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));const left=Math.min(...bounds.map(b=>b.left)),right=Math.max(...bounds.map(b=>b.right));assert.ok(Math.abs((left+right)/2-width/2)<16,'Complete logo grouping is visually centered');assert.ok(left>=0&&right<=width,'Header fits phone width');}
   }
   if(width<=600){const b=await page.locator('.brand-lockup,.brand-signature,.brand-paw').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));assert.ok(Math.abs((Math.min(...b.map(x=>x.left))+Math.max(...b.map(x=>x.right)))/2-width/2)<16,'Every public tab keeps the complete logo centered');}
   if(width<=600)assert.ok(Math.abs(await page.locator('.brand .logo').evaluate(e=>e.getBoundingClientRect().bottom+window.scrollY)-headerBaseline)<1,'Logo baseline stays consistent between public sections');
   if(target==='sell'||target==='services'){const gap=await page.evaluate(()=>document.querySelector('.sell-page:not(.hidden) h1').getBoundingClientRect().top-document.querySelector('.brand-lockup').getBoundingClientRect().bottom);assert.ok(gap>=48&&gap<=(width<=600?80:104),'Information intro removes stacked padding while preserving breathing room: '+gap+'px');}
   if(target==='sell'){
    assert.ok((await page.locator('#sellPage .sell-checklist li').evaluateAll(es=>es.map(e=>getComputedStyle(e).textAlign))).every(a=>a==='center'));
    if(width<=600){const gap=await page.evaluate(()=>document.querySelector('#sellTitle').getBoundingClientRect().top-document.querySelector('.brand-lockup').getBoundingClientRect().bottom);assert.ok(gap>=48&&gap<=80,'Sell intro keeps a compact, readable logo gap');}
    if(width===390||width===529||width===1280)await page.screenshot({path:out+'/services-sell-'+width+'.png',fullPage:true});
   }
   const nav=await page.locator('.bottom-nav button').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,background:getComputedStyle(e).backgroundColor,iconWidth:e.querySelector('svg').getBoundingClientRect().width,outline:getComputedStyle(e.querySelector('svg')).outlineStyle})));
   assert.ok(nav.every(n=>n.background==='rgba(0, 0, 0, 0)'&&n.iconWidth===24&&n.outline==='none'),'Navigation has no tile fills or icon borders');
   const floating=await page.locator('.bottom-nav').evaluate(e=>({height:e.getBoundingClientRect().height,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,bottom:e.getBoundingClientRect().bottom,radius:getComputedStyle(e).borderRadius,background:getComputedStyle(e).backgroundColor}));
   assert.equal(floating.height,68);assert.equal(floating.radius,'24px');assert.equal(floating.background,'rgb(255, 255, 255)');
   assert.ok(floating.left>=12&&floating.right<=width-12,'Floating panel keeps side insets');
   const oval=await page.locator('.bottom-nav button.active').evaluate(e=>({width:getComputedStyle(e,'::before').width,height:getComputedStyle(e,'::before').height,background:getComputedStyle(e,'::before').backgroundColor}));
   assert.deepEqual(oval,{width:'48px',height:'29px',background:'rgb(237, 237, 237)'});
   assert.ok(nav.every(n=>Math.abs(n.width-nav[0].width)<1),'Navigation columns are equal');
  }
  assert.equal(await page.locator('.services-page .sell-paw').count(),0,'Services keeps only the main J.P paw');
  assert.equal(await page.locator('#brandPaw img').count(),1);
  assert.match(await page.locator('#sellPage').textContent(),/JULIVASYABOT/);
  assert.equal(await page.locator('#sellPrepare').evaluate(e=>getComputedStyle(e).textAlign),'center');
  assert.equal(await page.locator('#sellTitle').evaluate(e=>getComputedStyle(e).textAlign),'center');
  const sellModes=await page.locator('#sellPage .sell-method').evaluateAll(es=>es.map(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e.querySelector('p')).color})));
  assert.equal(sellModes.length,2);assert.ok(sellModes.every(e=>e.bg==='rgb(228, 202, 221)'&&e.color==='rgb(37, 57, 79)'),'Both Sell methods use powder pink with dark text');
  assert.doesNotMatch(await page.locator('#sellPage').textContent(),/JULI\.PROZ/);
  assert.equal(await page.locator('.services-page .sell-intro p').innerText(),'Поможем выкупить нужную вещь, проверить её подлинность, подобрать ателье и организовать профессиональный уход. Работаем с вашими вещами по всему миру.');
  assert.equal(await page.locator('.services-page .sell-intro p').evaluate(e=>getComputedStyle(e).textAlign),'center');
  const services=await page.locator('.services-page .service-card p').evaluateAll(es=>es.map(e=>({align:getComputedStyle(e).textAlign,hyphens:getComputedStyle(e).hyphens})));
  assert.ok(services.length>=2&&services.every(s=>s.align==='left'&&s.hyphens==='none'),'Service details stay left-aligned without automatic hyphens');
  const serviceButtons=await page.locator('.services-page .service-contact').evaluateAll(es=>es.map(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight,height:e.getBoundingClientRect().height,svg:!!e.querySelector('svg')})));
  assert.equal(serviceButtons.length,2);assert.ok(serviceButtons.every(b=>b.bg==='rgb(228, 202, 221)'&&b.color==='rgb(37, 57, 79)'&&b.size==='16px'&&b.weight==='500'&&b.height>=48&&b.svg),'Services buttons use gentle brand colours and vector arrows');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Services fit narrow screens');
  if(width===390||width===529||width===1280)await page.screenshot({path:out+'/services-'+width+'.png',fullPage:true});
  if(width===320||width===390){
   await page.locator('[data-tab="catalog"]').click();
   await page.evaluate(()=>document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','34px'));
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   const safe=await page.evaluate(()=>({bottom:innerHeight-document.querySelector('.bottom-nav').getBoundingClientRect().bottom,navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top,lastBottom:[...document.querySelectorAll('.product')].at(-1).getBoundingClientRect().bottom}));
   assert.equal(safe.bottom,46);assert.ok(safe.lastBottom<=safe.navTop,'Last card can scroll clear of floating navigation');
   await page.evaluate(()=>{document.documentElement.style.removeProperty('--tg-safe-area-inset-bottom');scrollTo(0,0)});
   await page.setViewportSize({width,height:360});
   await page.locator('#toggleSearch').click();await page.locator('#search').focus();
   const keyboard=await page.evaluate(()=>({inputBottom:document.querySelector('#search').getBoundingClientRect().bottom,navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.ok(!keyboard.overflow&&keyboard.inputBottom<=keyboard.navTop,'Search remains clear in reduced keyboard-height viewport');
  }
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
  await page.locator('.product .photo img').first().evaluate(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,10000)}));
  await page.screenshot({path:out+'/live-sale-catalog-'+width+'.png'});
  const roundedCard=page.locator('.product').filter({hasText:'Штаны Ball'});
  if(await roundedCard.count()){await roundedCard.first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/live-sale-catalog-rounding-'+width+'.png'});}
  await page.close();
 }
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
