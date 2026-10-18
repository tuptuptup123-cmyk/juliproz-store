const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const seo=require('../server/seo.cjs'),site=require('../server/site-page.cjs'),product=require('../server/product-page.cjs');
const template=fs.readFileSync(require('node:path').resolve(__dirname,'../index.html'),'utf8');
const rows=[{id:42,brand:'Hermès',name:'Сандалии Oran',description:'Цвет: Розовый',size:'38',price:500,currency:'EUR',available:true,stock_quantities:{38:1}},{id:43,brand:'Gucci',name:'Кроссовки',price:null,available:true}];
function head(html){return html.split('</head>')[0]}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}}}
test('homepage service content is indexable in both languages with matching contact destinations',()=>{
 for(const lang of ['ru','en']){
  const html=site.render(template,'home',null,lang),body=html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
  assert.ok(body.includes(seo.page('home').heading[lang]));
  assert.equal((body.match(/<details/g)||[]).length,3);
  assert.equal((body.match(/class="home-step-number"/g)||[]).length,3);
  assert.ok(body.includes(require('../home-buyer.js').render(lang,'server-')));
  assert.match(body,lang==='en'?/https:\/\/wa.me\/message\//:/https:\/\/t.me\/juliproz/);
  if(lang==='en')assert.doesNotMatch(body,/[А-Яа-яЁё]/);
  assert.doesNotMatch(body,/FAQPage|AggregateRating/);
 }
});
test('both language versions have distinct self canonicals and reciprocal global hreflang',()=>{
 for(const lang of ['ru','en'])for(const [kind,slug] of [['home'],['catalog'],['services'],['sell'],['outlet'],['brand','hermes'],['brand','chanel'],['brand','loro-piana']]){
  const html=site.render(template,kind,slug,lang,rows),page=seo.page(kind,slug),h=head(html);
  assert.match(html,new RegExp('<html lang="'+lang+'"'));assert.ok(h.includes('<link rel="canonical" href="'+seo.url(page.path,lang)+'">'));
  for(const alternate of ['ru','en','x-default'])assert.ok(h.includes('hreflang="'+alternate+'"'));
  assert.equal((h.match(/<title>/g)||[]).length,1);assert.equal((h.match(/name="description"/g)||[]).length,1);
  assert.doesNotMatch(h,/en-AE|ru-RU|geo\.region|Yandex|yandex/);
 }
});
test('English product source and schema are translated before any JavaScript executes',()=>{
 const html=product.render(template,rows[0],'en');assert.match(head(html),/Hermès — Oran sandals/);
 const article=html.match(/<article id="serverProduct"[\s\S]*?<\/article>/)[0];assert.doesNotMatch(article,/[А-Яа-яЁё]/);assert.match(article,/wa.me/);
 const schema=JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(schema.name,'Hermès — Oran sandals');assert.equal(schema.offers.url,'https://www.juliproz.com/product/42?lang=en');
});
test('brand landing includes only matching public products with crawlable links',()=>{
 const html=site.render(template,'brand','hermes','en',rows),body=html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
 assert.match(body,/product\/42\?lang=en/);assert.doesNotMatch(body,/product\/43|[А-Яа-яЁё]/);assert.match(body,/delivery options for your country/);
 assert.doesNotMatch(body,/purchase_cost|internal_note/);
});
test('untrusted product strings cannot escape HTML or JSON-LD',()=>{
 const html=site.render(template,'catalog',null,'en',[{...rows[0],name:'</a><script>alert(1)</script>'}]);
 assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;script&gt;/);
});
test('unknown brands are real 404s and unavailable catalogue is 503',async()=>{
 let calls=0;const handle=site.createHandler({readTemplate:async()=>template,request:async()=>{calls++;throw Error('upstream')}});
 const unknown=response();await handle({method:'GET',url:'/api/site-page?page=brand&slug=unknown'},unknown);assert.equal(unknown.statusCode,404);assert.equal(calls,0);
 const failure=response();await handle({method:'GET',url:'/api/site-page?page=catalog&lang=en'},failure);assert.equal(failure.statusCode,503);assert.equal(failure.headers['Retry-After'],'30');
});

test('Outlet and brand guides are readable without JavaScript and expose only the agreed routes',()=>{
 for(const lang of ['ru','en']){
  for(const [kind,slug] of [['outlet'],['brand','hermes'],['brand','chanel'],['brand','loro-piana']]){
   const html=site.render(template,kind,slug,lang,rows),body=html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
   assert.equal((body.match(/<h1>/g)||[]).length,1);
   if(lang==='en')assert.doesNotMatch(body,/[А-Яа-яЁё]/);
   assert.match(body,/data-contact-event="manager_general"/);
   assert.doesNotMatch(body,/href="[^"]*\/(?:journal|about|buyer-service|models)\b/);
  }
  const outlet=site.render(template,'outlet',null,lang);
  assert.match(outlet,/https:\/\/t.me\/\+lz-ze3-GDEQ0YmFi/);
  assert.match(outlet,/https:\/\/t.me\/\+NWLPh8nc47kzMzI0/);
 }
});


test('SALE selection includes discounted subcategories and aliases, excluding full-price and unavailable pieces',()=>{
 const sale=require('../sale-collections.js');
 const saleRows=[
  {id:101,brand:'Gucci',name:'Куртка',category:'Куртки',price:500,original_price:1000,available:true},
  {id:102,brand:'Gucci',name:'Обувь',category:'Обувь',price:300,original_price:600,available:true},
  {id:103,brand:'Loro Piana',name:'Кепка',category:'Кепки',price:100,original_price:200,available:true},
  {id:104,brand:'Gucci',name:'Без скидки',category:'Куртки',price:500,available:true},
  {id:105,brand:'Gucci',name:'Продано',category:'Куртки',price:500,original_price:1000,available:false},
  {id:106,brand:'Gucci',name:'Цена по запросу',category:'Куртки',price:null,original_price:1000,available:true}
 ];
 for(const [collection,id] of [['clothing',101],['shoes',102],['accessories',103]]){
  assert.deepEqual(saleRows.filter(p=>sale.matches(p,collection)).map(p=>p.id),[id]);
  const html=site.render(template,'catalog',null,'en',saleRows,sale.fromSearch('?sale=1&collection='+collection)),body=html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(body,/<h1>|Discounted pieces from our collection/);assert.deepEqual([...body.matchAll(/href="https:\/\/www.juliproz.com\/product\/(\d+)/g)].map(m=>Number(m[1])),[id]);
 }
 assert.deepEqual(sale.fromSearch('?sale=1&collection=__proto__'),{sale:true,saleCollection:null});
 assert.deepEqual(sale.fromSearch('?collection=clothing'),{sale:false,saleCollection:null});
 assert.equal(sale.url('en','shoes'),'/catalog?sale=1&collection=shoes&lang=en');
});
