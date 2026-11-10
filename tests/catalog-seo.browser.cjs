const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-catalog-seo-qa';fs.mkdirSync(out,{recursive:true});
const rows=[{id:42,available:true,brand:'Hermès',name:'Сумка Birkin 25, цвет: Noir, кожа: Togo, фурнитура: золотая',name_en:'Birkin 25 bag, colour: Noir, leather: Togo, hardware: gold-tone',category:'Сумки',size:'25',price:20000,currency:'EUR',product_condition:'new',image_url:'https://juliproz-store.vercel.app/images/brands/hermes-birkin.png'},{id:43,available:true,brand:'Hermès',name:'Сумка Kelly to go, Gold',size:'One Size',price:null,image_url:'https://juliproz-store.vercel.app/images/brands/hermes-birkin.png'},{id:44,available:true,brand:'Rolex',name:'Часы Datejust, ref. 126334',size:'41 mm',price:12000,image_url:'https://juliproz-store.vercel.app/images/brands/hermes-birkin.png'}];
const catalog=require('../catalog-seo.js'),model=require('../server/model-page.cjs'),product=require('../server/product-page.cjs'),template=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname.startsWith('/models/')){const m=catalog.models.find(m=>'/models/'+m.slug===url.pathname);res.writeHead(m?200:404,{'Content-Type':'text/html; charset=utf-8'});return res.end(m?model.render(m,rows,url.searchParams.get('lang')==='en'?'en':'ru'):'Not found')}
 if(url.pathname==='/product/42'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(product.render(template,rows[0],url.searchParams.get('lang')==='en'?'en':'ru'))}
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.woff2')?'font/woff2':'image/png'});res.end(err?'Missing':data)});
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();try{
 for(const width of [320,390,1280])for(const lang of ['ru','en']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://www.juliproz.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'Local link target'}));
  await context.route('**/rest/v1/products?**',route=>route.fulfill({json:rows}));await context.route('**/api/catalog',route=>route.fulfill({json:rows}));await context.route('**/api/analytics',route=>route.fulfill({status:204}));
  await context.route('https://juliproz-store.vercel.app/images/**',route=>route.fulfill({path:root+'/images/brands/hermes-birkin.png',contentType:'image/png'}));
  await context.addInitScript(()=>{localStorage.setItem('jpAnalyticsConsent','declined');localStorage.setItem('jpAntiScamSeenV1','1')});
  for(const m of catalog.models){await page.goto(origin+'/models/'+m.slug+(lang==='en'?'?lang=en':''));assert.equal(await page.locator('h1').innerText(),m.name);assert.equal(await page.locator('.model-card').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(lang==='en')assert.doesNotMatch(await page.locator('body').innerText(),/[А-Яа-яЁё]/);}
  await page.screenshot({path:out+'/models-'+lang+'-'+width+'.png',fullPage:true});
  await page.goto(origin+'/product/42'+(lang==='en'?'?lang=en':''));await page.locator('#productContent .product-specifications').waitFor();assert.equal(await page.locator('#productContent .product-collection-links a').count(),2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(lang==='en')assert.doesNotMatch(await page.locator('#productContent .product-specifications').innerText(),/[А-Яа-яЁё]/);
  await page.screenshot({path:out+'/facts-'+lang+'-'+width+'.png',fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Model pages and product facts passed at 320, 390 and 1280 px in RU and EN.');
}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
