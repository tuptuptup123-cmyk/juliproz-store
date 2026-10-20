'use strict';
const {chromium}=require('./bff-browser-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 try{for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:width===320?568:900},reducedMotion:'reduce'}),errors=[],writes=[];
  let saved=null,failNext=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://qhgzzhgxwpcctafpzjid.supabase.co/**',r=>{
   const req=r.request(),url=new URL(req.url());
   if(['POST','PATCH','PUT','DELETE'].includes(req.method())&&(/\/rest\/v1\/(products|product_admin_notes)$/.test(url.pathname)||/\/storage\/v1\/object\/|store_save_product_costs/.test(url.pathname)))writes.push({path:url.pathname,body:req.postDataJSON()});
   if(url.pathname==='/rest/v1/products'){
    if(['POST','PATCH'].includes(req.method())){
     if(failNext){failNext=false;return r.fulfill({status:503,json:{message:'Synthetic save failure'}})}
     saved={...saved,...req.postDataJSON(),id:42,revision:(saved?.revision||0)+1};return r.fulfill({json:[saved]});
    }
    return r.fulfill({json:saved?[saved]:[]});
   }
   return r.fulfill({json:[]});
  });
  await page.route('https://juliproz-store.vercel.app/images/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
  await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
  await page.evaluate(()=>{
   sessionClock.start();session={cookie_session:true,session_id:'synthetic-session',aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}],expires_at:Date.now()/1000+3600,user:{id:'synthetic'}};
   adminSecurity.owner=false;$('authArea').classList.add('hidden');$('workspace').classList.remove('hidden');edit(null);
   photos=['https://juliproz-store.vercel.app/images/synthetic.png'];renderPhotos();
   const f=$('editor').elements;f.brand.value='Gucci';f.name.value='Тестовая сумка <img src=x>';f.name_en.value='Test bag';f.category.value='Сумки';f.description.value='Кожаная сумка, новая. В комплекте пыльник.';f.description_en.value='New leather bag with dust bag.';f.size.value='One Size';f.price.value='100';f.available.checked=true;editorDirty=true;
  });
  const dialog=page.locator('#productSaveReview'),checks=dialog.locator('input[type=checkbox]'),confirm=page.locator('#productSaveReviewConfirm');
  await page.locator('#save').click();await dialog.waitFor({state:'visible'});
  assert.equal(writes.length,0,'Opening review cannot write');assert.equal(await confirm.isDisabled(),true);
  assert.equal(await dialog.locator('img').count(),0,'Product name rendered as text');
  for(let i=0;i<4;i++)await checks.nth(i).check();
  assert.equal(await confirm.isDisabled(),true);
  await page.evaluate(()=>$('editor').requestSubmit());assert.equal(writes.length,0,'Repeated submit is ignored while reviewing');
  await page.locator('#productSaveReviewBack').click();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>!busy);
  assert.equal(writes.length,0);assert.equal(await page.locator('#editor [name=description]').inputValue(),'Кожаная сумка, новая. В комплекте пыльник.');assert.equal(await page.evaluate(()=>editorDirty),true);
  await page.locator('#save').click();await dialog.waitFor({state:'visible'});assert.equal(await dialog.locator('input:checked').count(),0);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!busy);assert.equal(writes.length,0);
  await page.locator('#save').click();await dialog.waitFor({state:'visible'});
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),`${width}: no horizontal overflow`);
  if(process.env.QA_OUTPUT){fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUTPUT,`product-review-${width}.png`)})}
  for(const checkbox of await checks.all())await checkbox.check();
  assert.equal(await confirm.isEnabled(),true);await checks.first().uncheck();assert.equal(await confirm.isDisabled(),true);await checks.first().check();
  await confirm.click();await page.waitForFunction(()=>!busy&&$('editor').classList.contains('hidden'));
  assert.equal(writes.filter(w=>w.path==='/rest/v1/products').length,1,'Exactly one product write');assert.equal(saved.available,true);
  await page.evaluate(p=>edit(p),saved);await page.locator('#editor [name=price]').fill('120');
  failNext=true;await page.locator('#save').click();await require('./admin-action-helper.cjs').confirmProductReview(page);await page.waitForFunction(()=>!busy);
  assert.match(await page.locator('#status').innerText(),/Synthetic save failure/);assert.equal(await page.locator('#editor [name=price]').inputValue(),'120');
  await page.locator('#save').click();await dialog.waitFor({state:'visible'});assert.equal(await dialog.locator('input:checked').count(),0,'Retry needs fresh review');
  await require('./admin-action-helper.cjs').confirmProductReview(page);await page.waitForFunction(()=>!busy&&$('editor').classList.contains('hidden'));assert.equal(saved.price,120);
  await page.evaluate(p=>edit(p),saved);await page.locator('#save').click();await dialog.waitFor({state:'visible'});const before=writes.length;
  await page.evaluate(()=>endSession());await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>!busy);
  assert.equal(writes.length,before,'Expired session cannot save');assert.equal(await page.locator('#login').isVisible(),true);
  assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});console.log(`PASS ${width}: mandatory review, cancel/Escape, retry, single write, session expiry, safe rendering`);
 }}finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
