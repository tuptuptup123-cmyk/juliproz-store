'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./admin-bff-fixture.cjs'),f=fixture({browser:true});
const {period}=require('../server/google-search.cjs');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||'/tmp/jp-google-qa';fs.mkdirSync(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/admin'){let data='';for await(const chunk of req)data+=chunk;req.body=JSON.parse(data);req.headers['x-vercel-forwarded-for']='192.0.2.1';return f.handler(req,res)}
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)});
});
const sample=days=>({status:'ready',site:'https://www.juliproz.com/',period:period(days),totals:{clicks:120,impressions:2400,ctr:.05,position:8.2},previous:{clicks:80,impressions:2000,ctr:.04,position:9.3},updatedAt:new Date().toISOString(),lastDataDate:'2026-10-16',firstIncompleteDate:'2026-10-16',daily:[{key:'2026-10-15',clicks:40,impressions:800,ctr:.05,position:8.3},{key:'2026-10-16',clicks:80,impressions:1600,ctr:.05,position:8.1}],queries:[{key:'<img src=x onerror="window.injected=true">',clicks:40,impressions:800,ctr:.05,position:8.2}],pages:[{key:'https://www.juliproz.com/products/523?lang=en',clicks:80,impressions:1600,ctr:.05,position:8.1},{key:'javascript:alert(1)',clicks:1,impressions:20,ctr:.05,position:10}],countries:[{key:'gbr',clicks:30,impressions:600,ctr:.05,position:7.2}]});
(async()=>{
 await new Promise(resolve=>server.listen(8796,resolve));const browser=await chromium.launch({args:['--no-sandbox']});
 try{for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];let mode='not_connected',calls=0,hold=null;
  page.on('pageerror',error=>errors.push(error.message));await context.route('https://**/*',route=>route.fulfill({json:[]}));
  await context.route('**/api/admin',async route=>{
   const envelope=route.request().postDataJSON();if(envelope.path!=='/reports/google-search')return route.continue();calls++;
   if(mode==='not_connected')return route.continue();
   if(mode==='held'){await new Promise(resolve=>hold=resolve);return route.fulfill({json:sample(envelope.body.days)}).catch(()=>{})}
   if(mode==='error')return route.fulfill({status:503,json:{message:'Google временно не отдаёт статистику.'}});
   const data=sample(envelope.body.days);if(mode==='empty'){data.status='empty';data.totals=null;data.previous=null;data.daily=[]}
   return route.fulfill({json:data});
  });
  await page.goto('http://localhost:8796/admin.html');await page.waitForFunction(()=>!busy);
  await page.locator('#login [name=email]').fill(f.user.email);await page.locator('#login [name=password]').fill('synthetic-password');await page.locator('#login button[type=submit]').click();await page.locator('#mfaPanel').waitFor();await page.locator('#mfaVerify [name=code]').fill('123456');await page.locator('#mfaVerify button').click();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!busy&&!overviewBusy&&!activityPromise);
  assert.equal(calls,0,'no Google requests on inventory');await page.locator('.top-navigation [data-view=analytics]').click();await page.waitForFunction(()=>!analyticsBusy);assert.equal(calls,0,'no Google requests on site analytics');
  await page.locator('[data-analytics-channel=google]').click();await page.getByText('Отчёт готов к подключению',{exact:true}).waitFor();assert.equal(await page.locator('#storeAnalyticsReport').isHidden(),true);assert.equal(await page.locator('#googleSearchPanel').isVisible(),true);
  mode='ready';await page.locator('#googleSearchRefresh').click();await page.locator('.google-metrics').waitFor();assert.equal(await page.locator('.google-metric strong').nth(0).innerText(),'120');assert.equal(await page.locator('.google-metric strong').nth(2).innerText(),'5%');assert.match(await page.locator('.google-metric small').nth(0).innerText(),/\+50%/);
  assert.equal(await page.locator('#googleSearchContent img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.locator('[data-google-table=pages]').click();assert.equal(await page.locator('.google-table a').count(),1);assert.match(await page.locator('.google-table a').getAttribute('href'),/products\/523\?lang=en/);
  await page.locator('[data-google-table=countries]').click();assert.match(await page.locator('.google-lists .google-table').innerText(),/Великобритания/);
  await page.locator('[data-google-metric=impressions]').click();assert.equal(await page.locator('.google-chart svg').getAttribute('aria-label'),'Показы по дням');
  await page.locator('#googleSearchDays').selectOption('7');await page.waitForFunction(()=>!document.getElementById('googleSearchPanel').hasAttribute('aria-busy'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no document overflow');
  await page.locator('#googleSearchPanel').screenshot({path:path.join(out,`google-search-synthetic-${width}.png`)});
  const loaded=calls;await page.locator('[data-analytics-channel=website]').click();await page.waitForFunction(()=>!analyticsBusy);assert.equal(await page.locator('#googleSearchPanel').isHidden(),true);assert.equal(await page.locator('#storeAnalyticsReport').isVisible(),true);await page.locator('[data-analytics-channel=google]').click();assert.equal(calls,loaded,'reuse current report');
  mode='empty';await page.locator('#googleSearchRefresh').click();await page.getByText('Google пока не вернул статистику за этот период.',{exact:true}).waitFor();assert.equal(await page.locator('.google-metric strong').first().innerText(),'—');
  mode='error';await page.locator('#googleSearchRefresh').click();await page.getByText('Google временно не отдаёт статистику.',{exact:true}).waitFor();assert.equal(await page.locator('.google-metrics').count(),0,'failed request cannot leave stale success');assert.equal(await page.locator('#workspace').isVisible(),true,'Google error keeps admin session');
  mode='held';await page.locator('#googleSearchRefresh').click();await page.waitForFunction(()=>document.getElementById('googleSearchPanel').getAttribute('aria-busy')==='true');
  await require('./admin-action-helper.cjs').clickAdminControl(page,'#logout');await page.locator('#login').waitFor();hold?.();await page.waitForFunction(()=>document.getElementById('googleSearchContent').textContent==='');assert.equal(await page.locator('#googleSearchContent').innerHTML(),'');assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS Google report ${width}px: cookie/MFA login, lazy loading, connection/ready/empty/error, periods, comparison, safe links/XSS, cache, logout race`);
 }}finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
