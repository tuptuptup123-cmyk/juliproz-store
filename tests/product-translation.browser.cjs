'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png'},out=process.env.QA_OUTPUT||'/tmp/jp-product-translation';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**',route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/admin.html');
  await page.evaluate(()=>{
   sessionClock.start();session={cookie_session:true,session_id:'synthetic-session',aal:'aal2',amr:[{method:'totp',timestamp:Date.now()/1000}],expires_at:Date.now()/1000+3600,user:{id:'synthetic'}};adminSecurity.owner=false;
   window.AdminProductFinance=null;window.savedWrites=[];window.testRow={id:42,brand:'Brand',name:'Кроссовки',description:null,category:'Обувь',size:'40',price:300,currency:'EUR',available:true,revision:1,image_url:'https://juliproz-store.vercel.app/images/gucci-blackwhite-45.webp',fulfillment_status:'in_stock',gender:'unisex',product_condition:'new',stock_quantities:{40:1}};
   request=async(path,options={})=>{if(path.startsWith('/rest/v1/products')){if(options.method==='PATCH'){const patch=JSON.parse(options.body);savedWrites.push(patch);testRow={...testRow,...patch,revision:testRow.revision+1}}return [testRow]}if(path.includes('product_admin_notes'))return [];return null};
   items=[testRow];$('authArea').classList.add('hidden');$('workspace').classList.remove('hidden');edit(testRow);
  });
  await page.locator('#productSeoGuide > summary').click();
  await page.locator('#jpGuideTitle').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Open writing guide fits '+width);
  assert.equal(await page.locator('#productSeoGuide script').count(),0);
  await page.screenshot({path:out+'/writing-guide-'+width+'.png',fullPage:true});
  await page.locator('#productSeoGuide > summary').click();
  await page.locator('[name=name]').fill('Часы Datejust 31');
  await page.locator('#productEnglishFields').evaluate(el=>el.open=true);
  assert.match(await page.locator('#productSeoTitleEn').innerText(),/Datejust 31 watch/);
  await page.locator('[name=name]').fill('Сумка '+ 'Birkin '.repeat(18));
  assert.match(await page.locator('#productSeoTitleRu').innerText(),/Длинный заголовок/);
  await page.locator('[name=name]').fill('Авторская модель вне словаря');await page.locator('[name=description]').fill('Описание изделия с проверенными деталями.');
  await page.locator('#productEnglishFields').evaluate(el=>el.open=true);assert.match(await page.locator('#productTranslationStatus').innerText(),/Нужен английский перевод/);
  await page.locator('#save').click();await page.waitForFunction(()=>!busy);assert.match(await page.locator('#status').innerText(),/Заполните английский перевод/);assert.equal(await page.evaluate(()=>savedWrites.length),0);
  await page.locator('[name=name_en]').fill('Reviewed special edition');await page.locator('[name=description_en]').fill('Reviewed item details.');
  await page.screenshot({path:out+'/editor-'+width+'.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#save').click();await page.waitForFunction(()=>savedWrites.length===1&&!busy);
  assert.equal(await page.evaluate(()=>testRow.name_en),'Reviewed special edition');assert.equal(await page.evaluate(()=>testRow.description_en),'Reviewed item details.');
  await page.evaluate(()=>{editorDirty=false;edit(testRow)});await page.locator('#productEnglishFields').evaluate(el=>el.open=true);assert.equal(await page.locator('[name=name_en]').inputValue(),'Reviewed special edition');
  await page.locator('[name=name]').fill('Другая авторская модель');assert.equal(await page.locator('[name=name_en]').inputValue(),'');assert.match(await page.locator('#productTranslationStatus').innerText(),/Нужен английский перевод/);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS English product fields, publication guard, save/reopen, stale-copy reset and layout '+width);
 }
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
