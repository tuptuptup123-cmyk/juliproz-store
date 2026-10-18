const {test}=require('node:test'),assert=require('node:assert/strict'),{render,createHandler}=require('../server/product-page.cjs');
const template='<!doctype html><html><head><title>Old</title><meta name="description" content="Old"><meta property="og:title" content="Old"><script src="app.js"></script></head><body></body></html>';
const product={id:42,brand:'Brand',name:'Model <test>',description:'Full description',available:true,size:'M',price:150,currency:'EUR',stock_quantities:{M:1},image_url:'https://juliproz-store.vercel.app/images/test.webp',internal_note:'PRIVATE',purchase_cost:100};
test('product HTML includes canonical, public metadata and safe JSON-LD without private fields',()=>{
 const html=render(template,{...product,name:'Model </script><script>alert(1)</script>'});
 assert.match(html,/rel="canonical" href="https:\/\/www.juliproz.com\/product\/42"/);assert.match(html,/src="\/app.js"/);assert.equal((html.match(/og:title/g)||[]).length,1);
 const schema=JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(schema.offers.price,150);assert.equal(schema.offers.availability,'https://schema.org/InStock');assert.doesNotMatch(html,/PRIVATE|purchase_cost|<script>alert/);
 assert.match(html,/id="serverProduct"/);
});
test('price on request never invents an offer and on-order stock uses preorder',()=>{
 const schema=p=>JSON.parse(render(template,p).match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(schema({...product,price:null}).offers,undefined);assert.equal(schema({...product,fulfillment_status:'on_order'}).offers.availability,'https://schema.org/PreOrder');
 assert.equal(schema({...product,reserved:true}).offers.availability,'https://schema.org/OutOfStock');
});
test('hidden/deleted cards get 404 and metadata fetch never forwards admin authorization',async()=>{
 let options;const handler=createHandler({request:async(url,o)=>{options=o;assert.match(url,/available=eq.true/);return Response.json([])},readTemplate:async()=>template});const result={};
 await handler({method:'GET',url:'/api/product-page?id=42',headers:{authorization:'Bearer private'}},{setHeader(k,v){result[k]=v},set statusCode(v){result.status=v},end(v){result.body=v}});
 assert.equal(result.status,404);assert.equal(result['X-Robots-Tag'],'noindex');assert.equal(options.headers.Authorization,undefined);assert.doesNotMatch(result.body,/Full description/);
});

test('sitemap validates public availability with the shared catalog reader',async()=>{
 const prior=globalThis.fetch;globalThis.fetch=async input=>{const url=new URL(input);assert.equal(url.searchParams.get('available'),'eq.true');const fields=url.searchParams.get('select').split(',');assert.ok(fields.includes('available'));return Response.json([Object.fromEntries(fields.map(key=>[key,{id:42,created_at:'2026-10-17T00:00:00Z',available:true}[key]]))])};
 try{const result={};await require('../api/sitemap.js')({method:'GET'},{setHeader(k,v){result[k]=v},set statusCode(v){result.status=v},end(v){result.body=v}});assert.equal(result.status,200);assert.match(result.body,/<loc>https:\/\/www.juliproz.com\/product\/42<\/loc>/);assert.doesNotMatch(result.body,/available|created_at/);}finally{globalThis.fetch=prior}
});


test('shared condition notes keep model-specific translated search snippets',()=>{
 const first={...product,name:'Часы Datejust, 41 мм, сталь и белое золото, синий циферблат, ref. 126334',description:'2026 год, новые, полный комплект'};
 const second={...first,id:43,name:'Часы Datejust 31mm Steel Blue Dial; Синий циферблат Ref. 278274'};
 const description=p=>render(template,p,'en').match(/name="description" content="([^"]*)"/)[1];
 assert.notEqual(description(first),description(second));
 assert.match(description(first),/126334/);assert.match(description(second),/278274/);
 assert.doesNotMatch(description(first)+description(second),/[А-Яа-яЁё]/);
 assert.match(description(first),/2026, new, full set/);
});
