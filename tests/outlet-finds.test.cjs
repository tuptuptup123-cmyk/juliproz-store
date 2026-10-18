const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const discovery=require('../discovery-pages.js'),site=require('../server/site-page.cjs'),photo=require('../server/product-page.cjs').photo;
const template=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const piece={id:442,brand:'Loro Piana',name:'Кроссовки Week End Walk',price:700,original_price:900,currency:'EUR',available:true,fulfillment_status:'in_stock',size:'44.5; 45; 46',stock_quantities:{'44.5':1,'45':0,'46':1},image_url:'https://juliproz-store.vercel.app/images/photo-manual-20261011/442-cover.webp'};
const find=(p=piece)=>discovery.outletFind([p],photo);
test('Outlet uses the confirmed boutique reference and live available sizes and price',()=>{
 assert.deepEqual(find().sizes,['44.5','46']);assert.equal(find().saving,200);assert.equal(find().percent,22);
 const changed=find({...piece,price:750,original_price:1000});assert.equal(changed.current,750);assert.equal(changed.reference,900);assert.equal(changed.saving,150);
});
test('Unavailable, reserved, unpriced, non-EUR, replaced and no-longer-discounted items cannot advertise savings',()=>{
 for(const patch of [{available:false},{reserved:true},{fulfillment_status:'on_order'},{stock_quantities:{'44.5':0,'45':0,'46':0}},{price:null},{price:0},{price:900},{price:1000},{currency:'USD'},{original_price:null},{brand:'Other'},{name:'Different model'},{image_url:'javascript:alert(1)'}])assert.equal(find({...piece,...patch}),null,JSON.stringify(patch));
 assert.equal(discovery.outletFind([],photo),null);
});
test('Outlet comparison and product links are rendered in RU/EN before JavaScript',()=>{
 for(const lang of ['ru','en']){
  const html=site.render(template,'outlet',null,lang,[piece]);
  const article=html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
  assert.match(article,/Week End Walk/);assert.match(article,/700 €/);assert.match(article,/900 €/);assert.match(article,/200 €/);assert.match(article,/−22%/);
  assert.ok(article.includes('href="/product/442'+(lang==='en'?'?lang=en':'')+'"'));
  if(lang==='en')assert.doesNotMatch(article,/[А-Яа-яЁё]/);
  assert.doesNotMatch(article,/data-outlet-wishlist|class="seo-product-list"/);
  assert.match(article,/sale=1&amp;collection=shoes/);
 }
});
test('Outlet fetches only its public featured item and retains the service page when the item cannot be read',async()=>{
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}});
 let requested;
 const handle=site.createHandler({readTemplate:async()=>template,request:async url=>{requested=new URL(url);return Response.json([piece])}}),ok=response();
 await handle({method:'GET',url:'/api/site-page?page=outlet&lang=en'},ok);
 assert.equal(ok.statusCode,200);assert.equal(requested.searchParams.get('id'),'eq.442');assert.equal(requested.searchParams.get('limit'),'1');assert.equal(requested.searchParams.get('available'),'eq.true');assert.match(ok.body,/data-outlet-product="442"/);
 const failure=site.createHandler({readTemplate:async()=>template,request:async()=>{throw Error('upstream')}}),unavailable=response();
 await failure({method:'GET',url:'/api/site-page?page=outlet&lang=en'},unavailable);
 assert.equal(unavailable.statusCode,200);assert.match(unavailable.body,/Outlets and private sales/);assert.doesNotMatch(unavailable.body,/data-outlet-product/);
});
