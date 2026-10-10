const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/light-shadow-qa';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'text/plain'});res.end(err?'Missing':data)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();try{
for(const width of [320,390,529]){
const page=await browser.newPage({viewport:{width,height:490},reducedMotion:'reduce'});
await page.goto(origin+'/style.css');
await page.setContent(`<link rel="stylesheet" href="${origin}/style.css"><style>body{padding:24px 16px;background:white}h1{font:400 18px Arial;margin:0 0 18px}main{display:grid;grid-template-columns:1fr 1fr;gap:12px}.product{display:block}.photo{aspect-ratio:4/5}.photo img{padding:6%}.label{font:400 14px Arial;margin:12px 0 5px;color:#202020}.note{font:400 12px/1.5 Arial;color:#626262;margin:24px 0}#before{filter:drop-shadow(0 3px 5px #25394f30)}</style><h1>Контур белой вещи</h1><main><article class="product"><div class="photo"><img id="before" src="${origin}/images/chrome-hearts-scroll-usa-white-109.webp"></div><div class="label">Сейчас</div></article><article class="product"><div class="photo"><img id="after" src="${origin}/images/chrome-hearts-scroll-usa-white-109.webp"></div><div class="label">Мягкая тень</div></article></main><p class="note">Одно и то же фото. Изменена только тень по контуру, пиксели вещи не менялись.</p><div class="photo" style="display:none"><img id="other" src="${origin}/images/brand-paw.webp"></div>`);
await page.locator('#after').evaluate(img=>img.decode());await page.locator('#before').evaluate(img=>img.decode());
const filters=await page.locator('img').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.id,getComputedStyle(e).filter])));
assert.match(filters.after,/drop-shadow/);assert.notEqual(filters.after,filters.before);assert.equal(filters.other,filters.before,'Unselected image retains existing shadow');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:out+'/light-shadow-comparison-'+width+'.png'});
await page.setContent(`<link rel="stylesheet" href="${origin}/style.css"><style>body{padding:24px 16px;background:white}h1{font:400 18px Arial;margin:0 0 18px}main{display:grid;grid-template-columns:1fr 1fr;gap:12px}.product{display:block}.label{font:400 14px Arial;margin-top:12px}#scale-before{transform:scale(1)}</style><h1>C.P. Company · размер фото</h1><main><article class="product"><div class="photo"><img id="scale-before" src="${origin}/images/photo-fix-oct10-368-0.webp"></div><div class="label">До</div></article><article class="product"><div class="photo"><img id="scale-after" src="${origin}/images/photo-fix-oct10-368-0.webp"></div><div class="label">После</div></article></main><div class="photo" style="display:none"><img id="future-cover" src="${origin}/images/brand-paw.webp"></div>`);
await page.locator('#scale-after').evaluate(img=>img.decode());await page.locator('#scale-before').evaluate(img=>img.decode());
assert.equal(await page.locator('#scale-after').evaluate(e=>getComputedStyle(e).transform),'matrix(0.7, 0, 0, 0.7, 0, 0)');
await page.locator('#scale-after').hover();
assert.equal(await page.locator('#scale-after').evaluate(e=>getComputedStyle(e).transform),'matrix(0.7, 0, 0, 0.7, 0, 0)','Hover must not undo the normalized cover scale');
assert.equal(await page.locator('#future-cover').evaluate(e=>getComputedStyle(e).transform),'none');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:out+'/cover-scale-368-'+width+'.png'});await page.close();console.log(width+' shadow preview and opt-in isolation PASS');
}

const covers=require('./light-cover-fixtures.json');
assert.equal(covers.length,15);assert.ok(!covers.some(c=>c.id===420));
for(const width of [320,390,529]){
 const page=await browser.newPage({viewport:{width,height:1300},reducedMotion:'reduce'});
 await page.route('https://juliproz-store.vercel.app/images/**',r=>{const f=path.join(root,new URL(r.request().url()).pathname);return r.fulfill({body:fs.readFileSync(f),contentType:'image/webp'})});
 await page.goto(origin+'/style.css');
 const examples=covers.filter(c=>[41,363,421].includes(c.id));
 await page.setContent(`<link rel="stylesheet" href="${origin}/style.css"><style>body{padding:16px;background:white}h1{font:400 18px Arial;margin:0 0 18px}main{display:grid;grid-template-columns:1fr 1fr;gap:18px 12px}.product{display:block}.before{filter:drop-shadow(0 3px 5px #25394f30)!important}.label{font:400 12px Arial;margin-top:8px}</style><h1>Белые вещи · тень по контуру</h1><main>${examples.map(c=>['before','after'].map(kind=>`<article class="product"><div class="photo"><img class="${kind}" src="${c.url}"></div><div class="label">#${c.id} · ${kind==='before'?'До':'После'}</div></article>`).join('')).join('')}</main><div class="photo" style="display:none">${covers.map(c=>`<img data-audited="${c.id}" src="${c.url}">`).join('')}<img id="replacement" src="${origin}/images/future-white-cover.webp"></div>`);
 await page.locator('main img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
 const filters=await page.locator('[data-audited]').evaluateAll(es=>es.map(e=>getComputedStyle(e).filter));
 assert.ok(filters.every(f=>(f.match(/drop-shadow/g)||[]).length===2),'All exact audited covers opt in');
 assert.equal((await page.locator('#replacement').evaluate(e=>getComputedStyle(e).filter)).match(/drop-shadow/g).length,1,'Replacement covers do not inherit the opt-in');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/light-cover-rollout-'+width+'.png',fullPage:true});await page.close();console.log(width+' PASS: 15 exact-source shadow opt-ins and replacement isolation');
}
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
