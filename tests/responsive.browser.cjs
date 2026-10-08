const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||path.join(root,'browser-qa');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file===root+path.sep)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)});});
(async()=>{
 await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch();
 const cfg={window:{}};require('node:vm').runInNewContext(fs.readFileSync(root+'/config.js','utf8'),cfg);
 const liveResponse=await fetch(cfg.window.STORE_CONFIG.url+'/rest/v1/products?select=id,brand,name,category,size,price,currency,image_url,photos,description,available,fulfillment_status&available=eq.true',{headers:{apikey:cfg.window.STORE_CONFIG.key}});
 assert.equal(liveResponse.status,200);const live=await liveResponse.json();assert.ok(live.length>0);assert.ok(live.every(p=>p.fulfillment_status==='in_stock'||p.fulfillment_status==='on_order'));
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const name=viewport.width<800?'mobile':'desktop',context=await browser.newContext({viewport,isMobile:name==='mobile',hasTouch:name==='mobile'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/');await page.locator('.product').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/'+name+'-catalog.png',fullPage:false});
  assert.equal(await page.locator('.product').count(),live.length);
  const assertFits=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows horizontally');await assertFits();
  await page.locator('[data-id="36"]').click();await page.locator('.hero img').waitFor();await page.screenshot({path:out+'/'+name+'-single-size.png',fullPage:false});assert.equal(await page.locator('[data-size]').count(),0);await assertFits();await page.locator('#backProduct').click();
  // Fixture data stays in this browser; no catalogue writes or Telegram sends.
  let fresh={...live.find(p=>p.id===60),id:900001,size:'40; 41; 44.5',fulfillment_status:'on_order',description:'Первая строка\nВторая строка <script>не HTML</script>'};
  await page.route('**/rest/v1/products?**',route=>route.fulfill({json:[fresh]}));let telegram=[];await page.addInitScript(()=>{window.open=url=>{window.__qaTelegram=url};});
  await page.reload();await page.locator('[data-id="900001"]').waitFor();await page.locator('[data-filter="size"]').click();await page.locator('#sheetOptions [data-v="41"]').click();await page.locator('#applyFilter').click();assert.equal(await page.locator('.product').count(),1);
  await page.locator('[data-id="900001"]').click();assert.equal(await page.locator('[data-size]').count(),3);assert.equal(await page.locator('[data-size="41"]').getAttribute('aria-pressed'),'true');await assertFits();
  const boxes=await page.evaluate(()=>{const a=document.querySelector('.product-gallery').getBoundingClientRect(),b=document.querySelector('.detail').getBoundingClientRect();return {gallery:{x:a.x,y:a.y,width:a.width,height:a.height},detail:{x:b.x,y:b.y}}});assert.ok(name==='desktop'?boxes.detail.x>boxes.gallery.x+boxes.gallery.width-1:boxes.detail.y>=boxes.gallery.y+boxes.gallery.height-1);
  await page.screenshot({path:out+'/'+name+'-multiple-sizes.png',fullPage:true});assert.match(await page.locator('.product-description').innerText(),/<script>не HTML<\/script>/);
  await page.locator('#backProduct').click();await page.locator('#reset').click();await page.locator('[data-id="900001"]').click();await page.locator('.buy').click();assert.match(await page.locator('#sizeHint').innerText(),/выберите/);assert.equal(await page.evaluate(()=>window.__qaTelegram),undefined);
  await page.locator('[data-size="44.5"]').click();fresh={...fresh,size:'40; 41'};await page.locator('.buy').click();assert.match(await page.locator('#shareStatus').innerText(),/больше недоступен/);
  await page.goto('http://127.0.0.1:8765/admin.html');await page.screenshot({path:out+'/'+name+'-admin-login.png',fullPage:true});await assertFits();
  // Render and exercise the real editor with a synthetic session/API response.
  let inventory=[{...live.find(p=>p.id===60),id:900002,size:'40; 41; 44.5',fulfillment_status:'on_order',revision:1}];
  await page.route('**/rest/v1/products?**',route=>{const req=route.request();if(req.method()==='PATCH'){inventory[0]={...inventory[0],...req.postDataJSON(),revision:inventory[0].revision+1};return route.fulfill({json:inventory})}return route.fulfill({json:inventory})});
  await page.evaluate(rows=>{session={access_token:'synthetic',expires_at:Date.now()/1000+3600,user:{id:'synthetic'}};items=rows;document.querySelector('#login').classList.add('hidden');document.querySelector('#workspace').classList.remove('hidden');render();},inventory);
  await assertFits();await page.screenshot({path:out+'/'+name+'-admin-inventory.png',fullPage:true});await page.locator('[data-edit="900002"]').click();assert.equal(await page.locator('[name="size"]').inputValue(),'40\n41\n44.5');assert.equal(await page.locator('[name="fulfillment_status"]').inputValue(),'on_order');await assertFits();await page.screenshot({path:out+'/'+name+'-admin-editor.png',fullPage:true});
  await page.locator('[name="size"]').fill('40\n44,5\n40');await page.locator('[name="fulfillment_status"]').selectOption('in_stock');await page.locator('#save').click();await page.locator('#status').filter({hasText:'Товар сохранён'}).waitFor();assert.equal(inventory[0].size,'40; 44.5');assert.equal(inventory[0].fulfillment_status,'in_stock');await page.locator('[data-edit="900002"]').click();assert.equal(await page.locator('[name="size"]').inputValue(),'40\n44.5');await page.locator('#cancel').click();await page.locator('[data-toggle="900002"]').click();assert.equal(inventory[0].available,false);assert.equal(inventory[0].fulfillment_status,'in_stock');
  assert.deepEqual(errors,[]);console.log(name+' PASS: live catalogue, decimal/single/multiple sizes, filters, selection, stale-size rejection, escaping, layouts, editor roundtrip, visibility');await context.close();
 }
 await browser.close();server.close();fs.writeFileSync(out+'/summary.json',JSON.stringify({liveProducts:live.length,viewports:[390,1280],result:'passed'},null,2));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
