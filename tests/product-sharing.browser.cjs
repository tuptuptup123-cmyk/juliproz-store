const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)});
});
const base={brand:'Brioni',name:'Джинсы Brioni',category:'Джинсы',price:300,currency:'EUR',available:true,reserved:false,product_condition:'new',gender:'men',fulfillment_status:'in_stock',revision:1,photos:[]};
const rows=[{...base,id:301,size:'XXL',stock_quantities:{XXL:1}},{...base,id:302,size:'XL',stock_quantities:{XL:1}},...[[396,'Персиковая'],[397,'Лиловая']].map(([id,name])=>({...base,id,brand:'Loro Piana',name:name+' кепка',size:'XL'})),{...base,id:400,available:false,name:'Sold fixture'}];
async function prepare(page,telegram){
 await page.addInitScript(telegram=>{
  localStorage.setItem('jpAnalyticsConsent','declined');window.__shared=[];window.__copied=[];window.__clipboardDenied=false;
  window.Telegram={WebApp:{ready(){},expand(){},initDataUnsafe:{},initData:telegram?'synthetic-launch':'',platform:telegram?'ios':'unknown',openTelegramLink:url=>window.__shared.push(url)}};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.__clipboardDenied)throw Error('denied');window.__copied.push(text)}}});
  document.addEventListener('click',event=>{const a=event.target.closest?.('a');if(a?.href.startsWith('https://t.me/')){event.preventDefault();window.__shared.push(a.href)}},true);
 },telegram);
 await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await page.route('**/api/catalog',r=>r.fulfill({json:rows.filter(p=>p.available)}));
 await page.route('https://qhgzzhgxwpcctafpzjid.supabase.co/**',r=>{
  const url=new URL(r.request().url());
  if(url.pathname==='/rest/v1/products')return r.fulfill({json:rows.filter(p=>p.available&&(!url.searchParams.get('id')||url.searchParams.get('id')==='eq.'+p.id))});
  if(url.pathname==='/rest/v1/product_admin_notes')return r.fulfill({json:[{product_id:302,note:'PRIVATE NOTE',location:'PRIVATE LOCATION',custodian:'PRIVATE CONTACT',revision:1}]});
  return r.fulfill({json:[]});
 });
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({args:['--no-sandbox']});
 try{
  for(const width of [320,1280])for(const telegram of [false,true]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await prepare(page,telegram);
   await page.addInitScript(()=>localStorage.setItem('jpAntiScamSeenV1','1'));await page.goto(origin+'/?tab=catalog');await page.locator('[data-id="302"]').waitFor();await page.locator('[data-id="302"]').click();await page.locator('[data-size="XXL"]').click();
   await page.locator('[data-action=share]').click();const dialog=page.locator('#productShareDialog');await dialog.waitFor();
   const expected=telegram?'https://t.me/JuliProzBot/shop?startapp=p_301':'https://www.juliproz.com/?product=301';
   assert.equal(await page.locator('#productShareUrl').inputValue(),expected);
   await page.locator('[data-share-action=copy]').click();await page.waitForFunction(()=>window.__copied.length===1);assert.equal(await page.evaluate(()=>window.__copied[0]),expected);
   await page.locator('[data-share-action=telegram]').click();let link=new URL(await page.evaluate(()=>window.__shared.at(-1)));assert.equal(link.searchParams.get('url'),expected);assert.match(link.searchParams.get('text'),/XXL/);
   await page.locator('[data-share-action=manager]').click();link=new URL(await page.evaluate(()=>window.__shared.at(-1)));assert.equal(link.pathname,'/juliproz');assert.ok(link.searchParams.get('text').includes(expected));
   await page.evaluate(()=>window.__clipboardDenied=true);await page.locator('[data-share-action=copy]').click();await page.locator('.product-share-status').filter({hasText:'Скопируйте выделенную ссылку'}).waitFor();assert.equal(await page.locator('#productShareUrl').evaluate(e=>e.selectionEnd-e.selectionStart),expected.length);
   for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(d=>d.contains(document.activeElement)),'focus stays in share dialog')}
   assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth),'dialog has no horizontal overflow');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('#productModal').isVisible(),true);assert.equal(await page.locator('[data-action=share]').evaluate(e=>e===document.activeElement),true);
   await page.goto(origin+'/?product=301');await page.locator('[data-size="XXL"][aria-pressed=true]').waitFor();
   await page.goto(origin+'/?startapp=p_397');await page.locator('[data-color-id="397"][aria-pressed=true]').waitFor();await page.locator('[data-action=share]').click();assert.match(await page.locator('#productShareUrl').inputValue(),telegram?/startapp=p_397$/:/product=397$/);
   if(telegram){
    await page.keyboard.press('Escape');await page.evaluate(()=>{window.Telegram=undefined;history.replaceState(null,'',location.pathname+location.search+'#tgWebAppPlatform=ios')});
    await page.locator('[data-action=share]').click();assert.equal(await page.locator('#productShareUrl').inputValue(),'https://t.me/JuliProzBot/shop?startapp=p_397','Telegram launch keeps its link when the async SDK is unavailable');
   }
   assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${width} ${telegram?'Telegram':'website'}: source-aware copy/share, exact size/color links, clipboard denial, keyboard and layout`);
  }
  for(const width of [320,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await prepare(page,false);await page.goto(origin+'/admin.html');
   await page.evaluate(rows=>{session={access_token:'PRIVATE TOKEN',expires_at:Date.now()/1000+3600,user:{id:'synthetic-owner'}};items=rows;$('authArea').classList.add('hidden');$('workspace').classList.remove('hidden');selectView('all',true)},rows);
   await page.locator('[data-edit="302"]').click();await page.locator('#shareEditorProduct').click();await page.locator('#productShareDialog').waitFor();assert.equal(await page.locator('#productShareUrl').inputValue(),'https://www.juliproz.com/?product=302');await page.keyboard.press('Escape');
   await page.evaluate(p=>edit(p),rows[1]);await page.waitForFunction(()=>!document.querySelector('[name=internal_note]').disabled);await page.locator('[name=name]').fill('UNSAVED TITLE');await page.locator('#shareEditorProduct').click();await page.locator('.product-share-status').filter({hasText:'сохранённую карточку'}).waitFor();
   await page.locator('[data-share-action=telegram]').click();await page.locator('[data-share-action=copy]').click();assert.doesNotMatch(await page.evaluate(()=>JSON.stringify([window.__shared,window.__copied,document.querySelector('#productShareDialog').textContent])),/PRIVATE|UNSAVED/);
   assert.ok(await page.locator('#productShareDialog').evaluate(d=>d.scrollWidth<=d.clientWidth));await page.keyboard.press('Escape');
   await page.evaluate(p=>{editorDirty=false;edit(p)},rows.at(-1));assert.equal(await page.locator('#shareEditorProduct').isDisabled(),true);
   await page.evaluate(()=>edit(null));assert.equal(await page.locator('#shareEditorProduct').isDisabled(),true);
   await page.evaluate(p=>edit(p),rows[1]);await page.locator('#shareEditorProduct').click();await page.evaluate(()=>endSession());assert.equal(await page.locator('#productShareDialog').isVisible(),false);
   assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${width} admin: list/editor sharing, no draft/private fields, unavailable/draft guards, logout closes dialog`);
  }
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
