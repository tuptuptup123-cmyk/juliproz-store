const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff':'font/woff'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
(async()=>{await new Promise(r=>server.listen(8782,r));const browser=await chromium.launch({args:['--no-sandbox']});try{
 const page=await browser.newPage();let touches=0,refreshes=0,signouts=0,sessionStart=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-13T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-13T09:00:01Z'));
 await page.route('https://**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='qhgzzhgxwpcctafpzjid.supabase.co')return route.fulfill({status:404,body:''});
  const now=await page.evaluate(()=>Date.now()),user={id:'synthetic-owner',email:'synthetic@example.invalid',factors:[]};
  if(url.pathname==='/auth/v1/token'){if(url.searchParams.get('grant_type')==='refresh_token')refreshes++;else sessionStart=now;return route.fulfill({json:{access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:now/1000+3600,user}})}
  if(url.pathname==='/auth/v1/logout'){signouts++;return route.fulfill({status:204})}
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
  if(url.pathname.endsWith('touch_store_admin_session')){touches++;return route.fulfill({json:{server_now:new Date(now).toISOString(),expires_at:new Date(sessionStart+604800000).toISOString(),idle_expires_at:null}})}
  if(url.pathname.endsWith('store_admin_security_status'))return route.fulfill({json:{paused:true,access_role:'owner'}});
  if(url.pathname==='/rest/v1/store_admins')return route.fulfill({json:[{user_id:user.id}]});
  if(url.pathname==='/rest/v1/products')return route.fulfill({json:[{id:1,brand:'Private',name:'Hidden fixture',available:false,price:100,currency:'EUR',photos:[]}]});
  return route.fulfill({json:{counts:{},healthy:true}});
 });
 await page.goto('http://localhost:8782/admin.html');
 const login=async()=>{await page.locator('#login [name=email]').fill('synthetic@example.invalid');await page.locator('#login [name=password]').fill('synthetic-password');await page.locator('#login button[type=submit]').click();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!sessionCheckPromise&&!overviewBusy)};
 await login();assert.equal(touches,1);const deadline=await page.evaluate(()=>sessionClock.deadline());
 await page.clock.fastForward(30*60000);assert.equal(await page.locator('#workspace').isVisible(),true);assert.equal(await page.locator('#sessionWarning').isHidden(),true);
 await page.clock.fastForward(12*3600000);await page.waitForFunction(()=>!overviewBusy);assert.equal(await page.locator('#workspace').isVisible(),true);assert.equal(touches,1,'idle/background checks do not send activity');
 await page.clock.fastForward(6*86400000-12*3600000-30*60000);await page.waitForFunction(()=>!overviewBusy);assert.equal(await page.locator('#sessionWarning').isHidden(),true);
 await page.reload();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!sessionCheckPromise&&!overviewBusy);assert.equal(touches,2);assert.equal(await page.evaluate(()=>sessionClock.deadline()),deadline,'reload does not reset the week');
 await page.clock.fastForward(86400000-120000);await page.locator('#sessionWarning').waitFor();assert.match(await page.locator('#sessionWarningText').innerText(),/недельный/);assert.equal(await page.locator('#continueSession').count(),0);
 await page.keyboard.press('Tab');assert.equal(touches,2);assert.ok(refreshes>0,'weekly session can refresh its short-lived access token');
 await page.clock.fastForward(120000);await page.locator('#login').waitFor();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Неделя'));
 assert.equal(await page.locator('#workspace').isHidden(),true);assert.equal(await page.evaluate(()=>session),null);assert.equal(await page.locator('#inventory').innerText(),'');assert.equal(await page.evaluate(()=>localStorage.getItem('jpAdminSessionV2')),null);assert.equal(signouts,1);
 await login();assert.equal(await page.locator('#workspace').isVisible(),true);assert.deepEqual(errors,[]);
 console.log('PASS no idle logout, six inactive days, reload persistence, token refresh, fixed seven-day expiry, private data clearing and fresh login');

}finally{await browser.close();server.close()}})().catch(error=>{console.error(error);server.close();process.exitCode=1});
