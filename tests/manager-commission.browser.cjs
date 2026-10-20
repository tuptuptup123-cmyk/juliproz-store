'use strict';
const {chromium}=require('./bff-browser-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff':'font/woff'})[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)});
});
(async()=>{
 await new Promise(r=>server.listen(8797,r));
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],writes=[];
  let saved=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://qhgzzhgxwpcctafpzjid.supabase.co/**',r=>{
   const request=r.request(),url=new URL(request.url());
   if(url.pathname==='/rest/v1/products'){
    if(['POST','PATCH'].includes(request.method())){const payload=request.postDataJSON();writes.push(payload);saved={...saved,...payload,id:42,revision:(saved?.revision||0)+1};return r.fulfill({json:[saved]})}
    return r.fulfill({json:saved?[saved]:[]});
   }
   return r.fulfill({json:[]});
  });
  await page.route('https://juliproz-store.vercel.app/images/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
  await page.goto('http://localhost:8797/admin.html');
  await page.evaluate(()=>{
   sessionClock.start();session={cookie_session:true,session_id:'synthetic-session',aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}],expires_at:Date.now()/1000+3600,user:{id:'synthetic'}};
   adminPreferences.reducedMotion=true;document.body.classList.add('reduce-motion');adminSecurity.owner=false;$('authArea').classList.add('hidden');$('workspace').classList.remove('hidden');edit(null);
   // Synthetic photo avoids uploading any files; the real submit and BFF payload run below.
   photos=['https://juliproz-store.vercel.app/images/synthetic.png'];renderPhotos();
  });
  const field=page.locator('#editor [name=on_commission]');
  assert.equal(await field.isEnabled(),true);
  assert.equal(await page.locator('#productOwnershipGuide').isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: guide fits`);
  await page.locator('#editor [name=brand]').fill('Gucci');
  await page.locator('#editor [name=name]').fill('Synthetic client item');
  await page.locator('#editor [name=category]').fill('Сумки');
  await page.locator('#editor [name=size]').fill('One Size');
  await page.locator('#editor [name=price]').fill('100');
  await page.locator('#editor [name=available]').uncheck();
  await field.check();
  await page.locator('#save').click();await require('./admin-action-helper.cjs').confirmProductReview(page);
  await page.waitForFunction(()=>!busy&&document.getElementById('status').textContent.startsWith('Товар сохранён'));
  assert.equal(writes.length,1);assert.equal(saved.on_commission,true);
  await page.evaluate(p=>edit(p),saved);
  assert.equal(await field.isChecked(),true);assert.equal(await field.isEnabled(),true);
  await field.uncheck();await page.locator('#save').click();await require('./admin-action-helper.cjs').confirmProductReview(page);
  await page.waitForFunction(()=>!busy&&document.getElementById('status').textContent.startsWith('Товар сохранён'));
  assert.equal(writes.length,2);assert.equal(saved.on_commission,false);
  await page.evaluate(p=>edit(p),saved);
  assert.equal(await field.isChecked(),false);
  if(process.env.QA_OUTPUT){fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(process.env.QA_OUTPUT,`manager-commission-${width}.png`),fullPage:false})}
  assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});
  console.log(`PASS ${width}: manager creates a commission item, unchecks and reopens it; guide fits`);
 }}finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
