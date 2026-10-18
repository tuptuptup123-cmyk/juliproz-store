'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const seo=require('../server/seo.cjs'),product=require('../server/product-page.cjs');
const context={window:{}};vm.createContext(context);
for(const file of ['site-translations.js','product-translations.js','product-copy.js','site-language.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const copy=context.window.ProductCopy,language=context.window.SiteLanguage;
test('English product names put types after models without repeating types already in the model',()=>{
 const pairs=[
  ['Сумка Birkin 25 Togo Gold','Birkin 25 Togo Gold bag'],
  ['Сумка New Model, Gold','New Model bag, Gold'],
  ['Лоферы Summer Walk','Summer Walk loafers'],
  ['Шлёпанцы Track Slide','Track Slide'],
  ['Кроссовки Tabi High Top Sneaker','Tabi High Top sneakers'],
  ['Брюки Buckle Pants','Buckle Pants'],
  ['Худи Rock Logo Popover Hoody in Purple','Rock Logo Popover hoodie in Purple'],
  ['Часы Datejust 31','Datejust 31 watch'],
  ['Часы Datejust Ref. 278243','Datejust watch Ref. 278243'],
  ['Часы Datejust 31mm, Steel and Yellow gold, White Roman Dial Ref. 278273','Datejust 31mm watch, Steel and Yellow gold, White Roman Dial Ref. 278273'],
  ['Сумка Car Flap Bag','Car Flap Bag'],['Кошелёк','Wallet']
 ];
 for(const [name,expected] of pairs){
  const p={name};assert.equal(seo.productCopy(p,'name','en'),expected,name);
  assert.equal(copy.value(p,'name','en',language.english),expected,'client '+name);
  assert.equal(copy.value(p,'name','ru'),name,'Russian unchanged');
 }
});
test('reviewed translations, descriptions, unknown facts and already-English names are preserved',()=>{
 assert.equal(copy.value({name:'Сумка Birkin',name_en:'Reviewed Birkin title'},'name','en'),'Reviewed Birkin title');
 assert.equal(copy.value({description:'Сумка Birkin 25 Togo Gold'},'description','en'),'Bag Birkin 25 Togo Gold');
 assert.equal(copy.value({name:'Watch strap with bag charm'},'name','en'),'Watch strap with bag charm');
 assert.deepEqual([...copy.missing({name:'Сумка неизвестная фактура'})],['name']);
 assert.equal(copy.value({name:'Часы Datejust 31'},'name','en'),'Datejust 31 watch');
});
test('rendered product heading, metadata, structured data and contact all use the corrected English name',()=>{
 const p={id:456,name:'Лоферы Summer Walk',brand:'Loro Piana',price:500,currency:'EUR',available:true,size:'40'};
 const html=product.render(fs.readFileSync('index.html','utf8'),p,'en');
 assert.match(html,/<h1>Loro Piana — Summer Walk loafers<\/h1>/);
 assert.match(html,/<title>Loro Piana — Summer Walk loafers \| JULI.PROZ<\/title>/);
 assert.match(html,/"name":"Loro Piana — Summer Walk loafers"/);
 const url=new URL(html.match(/class="seo-contact" href="([^"]+)"/)[1]);
 assert.match(url.searchParams.get('text'),/Summer Walk loafers/);
});
