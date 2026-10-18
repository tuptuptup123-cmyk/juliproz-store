'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const product=require('../server/product-page.cjs'),site=require('../server/site-page.cjs'),seo=require('../server/seo.cjs');
const template=fs.readFileSync('index.html','utf8');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}});
test('unavailable products return readable UTF-8 HTML and HEAD has no body',async()=>{
 const handler=product.createHandler({request:async()=>Response.json([])});
 for(const lang of ['ru','en'])for(const method of ['GET','HEAD']){
  const res=response();await handler({method,url:'/api/product-page?id=1&lang='+lang},res);
  assert.equal(res.statusCode,404);assert.equal(res.headers['Content-Type'],'text/html; charset=utf-8');assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['X-Robots-Tag'],'noindex');
  if(method==='HEAD')assert.equal(res.body,undefined);else assert.match(res.body,lang==='ru'?/Этой вещи сейчас нет/:/no longer in the collection/);
 }
});
test('reviewed product copy and explicit translations cover new model names without changing facts',()=>{
 for(const value of ['Сумка Birkin 25 Togo Gold','Лоферы Summer Walk','Кошелёк','Шлёпанцы Track Slide','В наличии, полный комплект'])assert.doesNotMatch(seo.translate(value,'en'),/[А-Яа-яЁё]/);
 const p={id:999,name:'Новая модель вне словаря',name_en:'New reviewed model',description:'Новый текст',description_en:'Reviewed item details',brand:'Brand',price:null,available:true};
 const html=product.render(template,p,'en'),article=html.match(/<article id="serverProduct"[\s\S]*?<\/article>/)[0];
 assert.match(article,/New reviewed model/);assert.match(article,/Reviewed item details/);assert.doesNotMatch(article,/[А-Яа-яЁё]/);assert.doesNotMatch(html,/"@type":"Product"/);
 const contact=article.match(/class="seo-contact" href="([^"]+)"/)[1],url=new URL(contact);assert.match(url.searchParams.get('text'),/New reviewed model.*product\/999\?lang=en/);
 const context={window:{}};vm.createContext(context);for(const f of ['site-translations.js','product-translations.js','product-copy.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
 assert.deepEqual([...context.window.ProductCopy.missing(p)],[]);assert.deepEqual([...context.window.ProductCopy.missing({name:'Новая модель вне словаря'})],['name']);
 assert.equal(context.window.ProductCopy.value(p,'name','ru'),p.name);
});
test('server pages expose one page heading and keep inactive application sections in inert JSON',()=>{
 for(const kind of ['home','catalog','services','sell','outlet']){
  const html=site.render(template,kind,null,'en',[]);
  assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,kind);
  assert.match(html,/id="storefrontShell"/);assert.match(html,/src="\/storefront-shell.js"/);
  const shell=JSON.parse(html.match(/id="storefrontShell">([\s\S]*?)<\/script>/)[1]);assert.match(shell,/id="grid"/);assert.match(shell,/src="\/images\/brand-paw.webp"/);
 }
});
test('HTML revalidation checks current availability before returning a cached body',async()=>{
 let published=true,reads=0;const p={id:42,brand:'Brand',name:'Model',price:100,available:true};
 const handler=product.createHandler({readTemplate:async()=>template,request:async()=>{reads++;return Response.json(published?[p]:[])}});
 const req={method:'GET',url:'/api/product-page?id=42',headers:{}},first=response();await handler(req,first);assert.equal(first.statusCode,200);assert.equal(first.headers['Vercel-CDN-Cache-Control'],'no-store');
 req.headers['if-none-match']=first.headers.ETag;const same=response();await handler(req,same);assert.equal(same.statusCode,304);assert.equal(reads,2);
 published=false;const removed=response();await handler(req,removed);assert.equal(removed.statusCode,404);assert.equal(removed.headers['Cache-Control'],'no-store');
});
