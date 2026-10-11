const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/sale-labels-qa';fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(file===root+'/')file+='index.html';fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
const base={available:true,currency:'EUR',category:'Рубашки',gender:'men',fulfillment_status:'in_stock',product_condition:'new',size:'M',photos:[],image_url:null,stock_quantities:{M:1}};
const fixtures=[{...base,id:900001,brand:'Maison Margiela',name:'Рубашка',price:250,original_price:500},{...base,id:900002,brand:'Gucci',name:'Рубашка',price:250,original_price:null}];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});try{
for(const width of [320,390,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 await page.route('**/rest/v1/products?**',r=>r.fulfill({json:fixtures}));
 await page.addInitScript(()=>localStorage.setItem('jpAnalyticsConsent','declined'));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const badge=page.locator('.product .card-sale-badge');await badge.waitFor();assert.equal(await badge.count(),1);assert.equal(await badge.innerText(),'SALE');
 assert.equal(await badge.evaluate(e=>getComputedStyle(e).fontSize),'10px');
 assert.ok(await badge.evaluate(e=>e.getBoundingClientRect().right<=e.closest('.product').getBoundingClientRect().right));
 await page.screenshot({path:path.join(out,'sale-catalog-'+width+'.png'),fullPage:true});
 await page.locator('[data-id="900001"] .product-open').click();
 await page.locator('.detail').waitFor();assert.equal(await page.locator('.detail-sale-badge').count(),0);
 assert.equal(await page.locator('.discount-badge').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(out,'sale-detail-'+width+'.png'),fullPage:true});
 await page.goBack();await badge.waitFor();await page.locator('[data-id="900002"] .product-open').click();await page.locator('.detail').waitFor();assert.equal(await page.locator('.detail-sale-badge').count(),0);
 await page.close();
}console.log('SALE catalogue/detail responsive checks passed at 320, 390, 768, 1280px');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
