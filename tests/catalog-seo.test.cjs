const {test}=require('node:test'),assert=require('node:assert/strict'),seo=require('../catalog-seo.js'),pages=require('../server/model-page.cjs');
test('public facts require explicit labels and never infer accessories, gold hardware or authenticity',()=>{
 const p={id:1,brand:'Hermès',name:'Сумка Birkin 25, цвет: Gold, кожа: Togo, фурнитура: серебряная',description:'',price:20000,size:'25',product_condition:'new',internal_note:'PRIVATE',purchase_cost:12};
 const facts=seo.facts(p);assert.equal(facts.find(f=>f.key==='color').value,'Gold');assert.equal(facts.find(f=>f.key==='hardware').value,'серебряная');assert.equal(facts.find(f=>f.key==='material').value,'Togo');
 assert.doesNotMatch(seo.factsHTML(p,'ru'),/PRIVATE|purchase_cost|подлинност|комплект/);
 assert.ok(!seo.facts({...p,name:'Bag Gold',description:''}).some(f=>f.key==='hardware'||f.key==='material'));
 assert.equal(seo.properties({name:'Часы Datejust, ref. 126334-0001'},'ru').mpn,'126334-0001');
 assert.doesNotMatch(seo.factsHTML({...p,size:'</dd><script>alert(1)</script>'},'en'),/<script>/);
});
test('model collections isolate the exact model and brand and render public crawlable bilingual pages',()=>{
 const rows=[{id:1,brand:'Hermès',name:'Сумка Birkin 25',available:true},{id:2,brand:'Hermès',name:'Сумка Birkin 250',available:true},{id:3,brand:'Other',name:'Birkin 25',available:true},{id:4,brand:'Hermès',name:'Сумка Birkin 25',available:false}];
 for(const lang of ['ru','en']){
  const html=pages.render(seo.models.find(m=>m.slug==='hermes-birkin-25'),rows,lang);assert.match(html,new RegExp('href="https://www.juliproz.com/product/1'+(lang==='en'?'\\?lang=en':'')+'"'));
  assert.doesNotMatch(html,/product\/(?:2|3|4)(?:\?|"|<)/);assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.match(html,/hreflang="en"/);assert.match(html,/CollectionPage/);
  if(lang==='en')assert.doesNotMatch(html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0],/[А-Яа-яЁё]/);
 }
});
test('unknown model slugs are 404s and upstream failure is retryable rather than a blank collection',async()=>{
 const handler=pages.createHandler({request:async()=>{throw Error('offline')}}),res=()=>({headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}});
 const missing=res();await handler({method:'GET',url:'/api/model-page?slug=made-up'},missing);assert.equal(missing.statusCode,404);
 const offline=res();await handler({method:'GET',url:'/api/model-page?slug=hermes-birkin-25'},offline);assert.equal(offline.statusCode,503);
});
test('lastmod rejects invalid and future dates and never uses the request time as an update',()=>{
 assert.equal(seo.lastmod('not a date'),null);assert.equal(seo.lastmod('2999-01-01'),null);assert.equal(seo.lastmod('2026-10-01'),'2026-10-01T00:00:00.000Z');
});

test('Rolex demand collections separate Daytona and Sky-Dweller and expose bilingual links',()=>{
 const rows=[{id:1,brand:'Rolex',name:'Часы Cosmograph Daytona ref 126500LN',available:true},{id:2,brand:'Rolex',name:'Часы Sky-Dweller ref 336934',available:true},{id:3,brand:'Other',name:'Daytona',available:true},{id:4,brand:'Rolex',name:'Daytona',available:false}];
 for(const [slug,id] of [['rolex-daytona',1],['rolex-sky-dweller',2]])for(const lang of ['ru','en']){
  const model=seo.models.find(m=>m.slug===slug),html=pages.render(model,rows,lang);
  assert.match(html,new RegExp('href="https://www.juliproz.com/product/'+id+(lang==='en'?'\\?lang=en':'')+'"'));
  for(const other of rows.filter(p=>p.id!==id))assert.doesNotMatch(html,new RegExp('href="https://www.juliproz.com/product/'+other.id+'(?:\\?|"|<)'));
  assert.match(seo.modelLinks('Rolex',lang),new RegExp('/models/'+slug));
  assert.match(seo.linksHTML(rows[id-1],lang),new RegExp('/models/'+slug));
 }
});

test('reviewed English attributes are used for English product details',()=>{
 const p={brand:'Chanel',name:'Минодьер Pomegranate',description:'Материал: эмаль; Цвет: красный',name_en:'Pomegranate minaudière',description_en:'Material: enamel; Colour: red; Reference: AS6647-B26663-UF239'};
 assert.equal(seo.properties(p,'en').material,'enamel');assert.equal(seo.properties(p,'en').color,'red');assert.equal(seo.properties(p,'en').mpn,'AS6647-B26663-UF239');
 assert.equal(seo.properties(p,'ru').material,'эмаль');
});

test('Hermes and Chrome Hearts collections distinguish related names and other brands',()=>{
 const cases=[['hermes-kelly-25','Hermès','Сумка Kelly 25','Сумка Kelly 250'],['hermes-hac-a-dos','Hermès','Рюкзак Hac à Dos PM','Сумка Haccess PM'],['chrome-hearts-hoodies','Chrome Hearts','Зип-худи Vertical Logo','Лонгслив Scroll Logo'],['chrome-hearts-long-sleeves','Chrome Hearts','Лонгслив Scroll Logo','Худи Vertical Logo']];
 for(const [slug,brand,name,other] of cases){const model=seo.models.find(m=>m.slug===slug);assert.equal(seo.matches(model,{brand,name}),true);assert.equal(seo.matches(model,{brand,name:other}),false);assert.equal(seo.matches(model,{brand:'Other',name}),false);}
});
