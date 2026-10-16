// Large-catalogue regression: work stays bounded without losing search results or edits.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=process.env.QA_ADMIN_ROOT||path.resolve(__dirname,'..'),adminURL=process.env.QA_ADMIN_URL||'http://localhost:8794/admin.html';
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff':'font/woff'})[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
(async()=>{await new Promise(r=>server.listen(8794,r));const browser=await chromium.launch({executablePath:process.env.QA_BROWSER_BINARY||undefined,args:['--no-sandbox']});try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://qhgzzhgxwpcctafpzjid.supabase.co/**',r=>r.fulfill({json:[]}));
  await page.route('https://juliproz-store.vercel.app/images/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
  await page.goto(adminURL);
  await page.evaluate(()=>{session={access_token:'synthetic',expires_at:Date.now()/1000+3600,user:{id:'synthetic'}};adminPreferences.reducedMotion=true;document.body.classList.add('reduce-motion');$('workspace').classList.remove('hidden');$('authArea').classList.add('hidden');items=Array.from({length:414},(_,i)=>({id:i+1,brand:i%2?'Chanel':'Gucci',name:i===413?'Последняя вещь':'Товар '+(i+1),description:i===413?'уникальный поиск':'',category:i%2?'Сумки':'Обувь',price:1500,currency:'EUR',size:'One Size',available:true,gender:'unisex',revision:1,image_url:'https://juliproz-store.vercel.app/images/synthetic.png',photos:[]}));render();window.firstCard=$('inventory').firstElementChild;window.firstCategory=$('categoryFilter').firstElementChild});
  assert.equal(await page.locator('#inventory article').count(),48);assert.equal(await page.locator('[data-count=all]').innerText(),'414');
  await page.locator('#moreInventory').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('#inventory article').length>48);
  assert.equal(await page.evaluate(()=>window.firstCard===$('inventory').firstElementChild),true,'append retains existing cards');
  // Return from an opened card to the same batch and scroll position.
  await page.locator('[data-edit="70"]').scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>window.scrollY),cards=await page.locator('#inventory article').count();
  await page.locator('[data-edit="70"]').click();await page.locator('#editor').waitFor();await page.locator('#backToCatalog').click();
  assert.equal(await page.evaluate(()=>window.firstCard===$('inventory').firstElementChild),true);assert.equal(await page.locator('#inventory article').count(),cards);assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-scroll)<5,'return restores scroll');
  await page.locator('#adminSearch').fill('уникальный поиск');await page.locator('[data-edit="414"]').waitFor();assert.equal(await page.locator('#inventory article').count(),1);
  assert.equal(await page.evaluate(()=>window.firstCategory===$('categoryFilter').firstElementChild),true,'search retains filters');
  await page.locator('[data-edit="414"]').click();await page.evaluate(()=>window.previewNode=$('previewImage').querySelector('img'));
  await page.locator('[name=name]').fill('Черновик названия');assert.equal(await page.evaluate(()=>window.previewNode===$('previewImage').querySelector('img')),true,'typing must not recreate or decode the same photo');
  page.once('dialog',d=>d.accept());await page.locator('#backToCatalog').click();await page.locator('#adminSearch').fill('шанель');await page.waitForFunction(()=>inventoryRows.length===207);assert.equal(await page.locator('#inventory article').count(),48);
  // Replaced rows and revision changes must invalidate counts, search and cards.
  await page.evaluate(()=>{items[413]={...items[413],brand:'Hermès',description:'новое описание',available:false,archive_status:'hidden',revision:2};render()});
  assert.equal(await page.locator('[data-count=hidden]').textContent(),'1');await page.locator('#adminSearch').fill('новое описание');await page.locator('[data-edit="414"]').waitFor();assert.match(await page.locator('#inventory').textContent(),/Hermès/);
  await page.locator('#resetFilters').click();await page.locator('[data-edit="1"]').waitFor();
  // Manual keyboard fallback works even without an intersection notification.
  await page.evaluate(()=>{$('moreInventory').focus({preventScroll:true});$('moreInventory').click()});assert.equal(await page.evaluate(()=>document.activeElement.dataset.edit),'49');
  await page.evaluate(()=>{while(inventoryRendered<inventoryRows.length)renderInventoryBatch()});assert.equal(await page.locator('#inventory article').count(),414);assert.equal(await page.locator('#moreInventory').isHidden(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // View switches keep card nodes; sorting covers the entire inventory and unknown prices stay last.
  await page.evaluate(()=>window.beforeLayout=$('inventory').firstElementChild);await page.locator('#inventoryListView').click();assert.equal(await page.evaluate(()=>window.beforeLayout===$('inventory').firstElementChild),true);assert.equal(await page.locator('#inventoryListView').getAttribute('aria-pressed'),'true');
  await page.locator('#inventoryGridView').click();assert.equal(await page.evaluate(()=>window.beforeLayout===$('inventory').firstElementChild),true);
  await page.evaluate(()=>{items[0]={...items[0],price:100,revision:10};items[1]={...items[1],price:5000,revision:10};items[2]={...items[2],price:null,revision:10};render()});
  await page.locator('#inventorySort').selectOption('price_asc');assert.equal(await page.locator('#inventory [data-edit]').first().getAttribute('data-edit'),'1');assert.equal(await page.locator('#inventory article').count(),48);assert.equal(await page.evaluate(()=>inventoryRows.at(-1).id),3);
  await page.locator('#inventorySort').selectOption('price_desc');assert.equal(await page.locator('#inventory [data-edit]').first().getAttribute('data-edit'),'2');assert.equal(await page.evaluate(()=>inventoryRows.at(-1).id),3);
  await page.locator('#resetFilters').click();assert.equal(await page.locator('#inventorySort').inputValue(),'newest');assert.equal(await page.locator('#inventory [data-edit]').first().getAttribute('data-edit'),'1');
  await page.evaluate(()=>endSession());assert.equal(await page.locator('#inventory article').count(),0);assert.equal(await page.locator('#moreInventory').isHidden(),true);assert.equal(await page.evaluate(()=>inventoryRows.length),0);
  assert.deepEqual(errors,[]);await page.close({runBeforeUnload:false});console.log(`PASS ${width}: bounded 414-product list, auto/manual batches, full search, stable filters and preview, scroll restore, revisions and logout`);
 }
}finally{await browser.close();server.close()}})().catch(error=>{console.error(error);server.close();process.exitCode=1});
