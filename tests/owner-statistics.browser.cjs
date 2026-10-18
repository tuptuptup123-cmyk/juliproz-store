'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./admin-bff-fixture.cjs'),{clickAdminControl}=require('./admin-action-helper.cjs');
const security={paused:false,pending:false,access_role:'owner'},f=fixture({browser:true,security});
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-owner-statistics';fs.mkdirSync(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/admin'){let data='';for await(const chunk of req)data+=chunk;req.body=JSON.parse(data);req.headers['x-vercel-forwarded-for']='192.0.2.1';return f.handler(req,res)}
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)});
});
const product={id:99001,brand:'Gucci',name:'Кроссовки Ace',category:'Обувь',size:'40',price:300,currency:'EUR',available:true,fulfillment_status:'in_stock',stock_quantities:{40:2},revision:1,photos:[]};
const isReport=p=>/store_(?:analytics_|bot_health|operational_health|product_wishlist_counts|finance_|product_finance)/.test(p)||p==='/reports/google-search';
(async()=>{await new Promise(r=>server.listen(8796,r));const browser=await chromium.launch({args:['--no-sandbox']});try{
 for(const width of [320,390,1280]){
  security.access_role='owner';const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],calls=[];let held=null,hold=false;
  page.on('pageerror',e=>errors.push(e.message));await context.route('https://**/*',r=>r.fulfill({json:[]}));
  await context.route('**/api/admin',async route=>{
   const {path:p,body:b}=route.request().postDataJSON();calls.push(p);
   if(p.startsWith('/rest/v1/products?'))return route.fulfill({json:[product]});
   if(p.endsWith('/store_analytics_summary')){if(hold){await new Promise(r=>held=r);hold=false}return route.fulfill({json:{active:765,visitors:765,sessions:1,daily:[],products:[]}}).catch(()=>{})}
   if(p.endsWith('/store_product_wishlist_counts'))return route.fulfill({json:{counts:{99001:8}}});
   if(p.endsWith('/store_finance_report'))return route.fulfill({json:{rows:[],summary:{gross:12345,sold_units:1,sold_count:1,profit_known:1000,profit_missing:0,received:12345,received_missing:0,receivable:0,owner_due:0,owner_paid:0,owner_unpaid:0,owner_missing:0,active_count:0,active_amount:0,refund_due:0,refund_unknown:0,cancelled_count:0},legacy_count:0}});
   if(p.endsWith('/store_upload_schedule'))return route.fulfill({json:{current_user_id:f.user.id,today:'2026-10-18',days:[],members:[],totals:[]}});
   if(p.endsWith('/store_product_finance'))return route.fulfill({json:{terms:{product_id:99001,revision:0,purchase_per_unit:null,expenses_per_unit:null},rows:[],summary:{count:0,quantity:0,amount:0,profit_known:0,profit_missing:0}}});
   return route.continue();
  });
  async function login(){await page.locator('#login [name=email]').fill(f.user.email);await page.locator('#login [name=password]').fill('synthetic-password');await page.locator('#login button[type=submit]').click();await page.locator('#mfaPanel').waitFor();await page.locator('#mfaVerify [name=code]').fill('123456');await page.locator('#mfaVerify button').click();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!busy&&!overviewBusy&&!activityPromise)}
  async function managerHidden(){for(const selector of ['.top-navigation [data-view=analytics]','#homePanel','#productWishlistStatus','#statisticsNavigation','#analyticsPanel','#financePanel','#productFinanceCard'])assert.equal(await page.locator(selector).isVisible(),false,selector);assert.equal(await page.locator('[data-product-wishlist]').count(),0);assert.equal(await page.locator('#analyticsCards').innerHTML(),'');assert.equal(await page.locator('#financeSummary').innerHTML(),'');assert.equal(await page.locator('#googleSearchContent').innerHTML(),'');}
  await page.goto('http://localhost:8796/admin.html');await page.waitForFunction(()=>!busy);await login();
  await page.waitForFunction(()=>$('overviewActive').textContent==='765');assert.equal(await page.locator('.top-navigation [data-view=analytics]').isVisible(),true);await page.waitForFunction(()=>productWishlistCounts!==null);assert.match(await page.locator('[data-product-wishlist]').innerText(),/8/);
  await page.locator('.top-navigation [data-view=analytics]').click();await page.waitForFunction(()=>!analyticsBusy);assert.equal(await page.locator('#analyticsPanel').isVisible(),true);
  await page.locator('[data-analytics-channel=google]').click();await page.getByText('Отчёт готов к подключению',{exact:true}).waitFor();
  await page.locator('#financeTab').click();await page.locator('#financeStatus').filter({hasText:'Обновлено'}).waitFor();assert.equal(await page.locator('#financePanel').isVisible(),true);assert.match(await page.locator('#financeSummary').innerText(),/12\s?345/);
  await page.screenshot({path:out+'/owner-finance-'+width+'.png'});
  // A report started by the owner must not reappear after a manager logs in.
  await page.evaluate(()=>{analyticsChannel='website'});hold=true;await page.evaluate(()=>{loadAnalytics()});await page.waitForFunction(()=>analyticsBusy);
  await clickAdminControl(page,'#logout');await page.locator('#login').waitFor();security.access_role='admin';const start=calls.length;
  await login();held();await page.waitForFunction(()=>!analyticsBusy);await managerHidden();
  await page.evaluate(async()=>{selectView('analytics');selectView('finance');AdminFinance.onView('finance');await loadAnalytics();await refreshOverview();await loadProductWishlistCounts();await AdminGoogleSearch.load(true);await AdminHealth.refresh()});
  await managerHidden();assert.equal(await page.locator('#inventoryPanel').isVisible(),true);assert.deepEqual(calls.slice(start).filter(isReport),[],'manager must not request reports');
  const denied=await page.evaluate(async()=>{try{await request('/reports/google-search',{method:'POST',body:JSON.stringify({days:7})});return 200}catch(e){return e.httpStatus}});assert.equal(denied,403,'server blocks manager Google requests');
  await clickAdminControl(page,'#profileMenu [data-view=settings]');assert.equal(await page.locator('[data-owner-statistics]').filter({hasText:'О статистике'}).isVisible(),false);
  await page.evaluate(()=>selectView('all'));await page.locator('[data-edit="99001"]').click();assert.equal(await page.locator('#editor').isVisible(),true);assert.equal(await page.locator('#productFinanceCard').isVisible(),false);assert.equal(await page.locator('[data-sell="99001"]').isVisible(),true);assert.equal(await page.locator('[data-reserve="99001"]').isVisible(),true);
  await page.locator('#backToCatalog').click();await managerHidden();await page.reload();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!busy);await managerHidden();assert.equal(await page.locator('#inventory article').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.screenshot({path:out+'/manager-inventory-'+width+'.png'});
  await context.close();console.log('PASS owner and manager',width,'navigation, report API, finance, counters, settings, stale data, reload, inventory, sale/reserve actions and layout');
 }
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
