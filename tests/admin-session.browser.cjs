const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff':'font/woff'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
const KEY='jpAdminSession30dV1',DAY=86400000,URL_ADMIN='http://localhost:8782/admin.html';
(async()=>{await new Promise(r=>server.listen(8782,r));const browser=await chromium.launch({args:['--no-sandbox']});try{
 let touches=0,refreshes=0,signouts=0,passwordLogins=0,sessionStart=0,rotation=0,refreshToken='synthetic-refresh-0';const errors=[];
 const user={id:'synthetic-owner',email:'synthetic@example.invalid',factors:[{id:'synthetic-factor',status:'verified',factor_type:'totp'}]};
 const auth=now=>({access_token:`synthetic.${Buffer.from(JSON.stringify({aal:'aal2',session_id:'synthetic-session',rotation})).toString('base64url')}.synthetic`,refresh_token:refreshToken,expires_at:now/1000+3600,user});
 async function route(route){
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='qhgzzhgxwpcctafpzjid.supabase.co')return route.fulfill({status:404,body:''});
  const now=await req.frame().page().evaluate(()=>Date.now());
  if(url.pathname==='/auth/v1/token'){
   if(url.searchParams.get('grant_type')==='refresh_token'){assert.equal(req.postDataJSON().refresh_token,refreshToken,'refresh must use latest shared token');refreshes++;rotation++;refreshToken='synthetic-refresh-'+rotation}
   else{sessionStart=now;passwordLogins++}
   return route.fulfill({json:auth(now)});
  }
  if(url.pathname==='/auth/v1/logout'){signouts++;return route.fulfill({status:204})}
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
  if(url.pathname.endsWith('touch_store_admin_session')){touches++;return route.fulfill({json:{server_now:new Date(now).toISOString(),expires_at:new Date(sessionStart+30*DAY).toISOString(),idle_expires_at:new Date(sessionStart+30*DAY).toISOString()}})}
  if(url.pathname.endsWith('store_admin_security_status'))return route.fulfill({json:{paused:false,access_role:'owner'}});
  if(url.pathname==='/rest/v1/store_admins')return route.fulfill({json:[{user_id:user.id}]});
  if(url.pathname==='/rest/v1/products')return route.fulfill({json:[{id:1,brand:'Private',name:'Hidden fixture',available:false,archive_status:'hidden',price:100,currency:'EUR',photos:[]}]});
  return route.fulfill({json:{counts:{},healthy:true}});
 }
 async function context(state){const c=await browser.newContext(state?{storageState:state}:{});await c.route('https://**/*',route);return c}
 async function page(c,time){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date(time)});await p.clock.pauseAt(new Date(time+1000));await p.goto(URL_ADMIN);return p}
 async function settled(p){await p.waitForFunction(()=>!busy&&!activityPromise&&!overviewBusy)}
 async function login(p){await p.locator('#login [name=email]').fill(user.email);await p.locator('#login [name=password]').fill('synthetic-password');await p.locator('#login button[type=submit]').click();await p.locator('#workspace').waitFor();await settled(p)}
 let c=await context(),p=await page(c,Date.parse('2026-10-15T09:00:00Z'));await login(p);
 const deadline=await p.evaluate(()=>sessionClock.snapshot().absolute);
 assert.equal(await p.evaluate(key=>sessionStorage.getItem(key),KEY),null);
 for(let i=0;i<2;i++){await p.reload();await p.locator('#workspace').waitFor();await settled(p);assert.equal(await p.evaluate(()=>sessionClock.snapshot().absolute),deadline)}
 const beforeSleep=touches;
 await p.clock.fastForward(29*DAY);await settled(p);assert.equal(await p.locator('#workspace').isVisible(),true);assert.equal(await p.locator('#sessionWarning').isHidden(),true);assert.equal(touches,beforeSleep,'background checks cannot touch activity');
 const reopenTime=await p.evaluate(()=>Date.now()),state=await c.storageState();await c.close();
 c=await context(state);p=await page(c,reopenTime);await p.locator('#workspace').waitFor();await settled(p);
 assert.equal(passwordLogins,1,'reopening browser after 29 days requires no password');assert.ok(refreshes>0,'expired access token refreshes on reopen');assert.equal(await p.locator('#mfaPanel').isHidden(),true);assert.equal(await p.evaluate(()=>sessionClock.snapshot().absolute),deadline);
 // A second tab shares the completed login; concurrent refresh uses one rotation.
 const p2=await page(c,await p.evaluate(()=>Date.now()));await p2.locator('#workspace').waitFor();await settled(p2);
 await p.evaluate(key=>{session.expires_at=1;const saved=JSON.parse(localStorage.getItem(key));saved.session.expires_at=1;localStorage.setItem(key,JSON.stringify(saved))},KEY);
 await p2.evaluate(()=>session.expires_at=1);const refreshBefore=refreshes;
 await Promise.all([p.evaluate(()=>request('/auth/v1/user')),p2.evaluate(()=>request('/auth/v1/user'))]);
 assert.equal(refreshes,refreshBefore+1,'Web Lock prevents duplicate refresh across tabs');
 const remaining=await p.evaluate(()=>sessionClock.state().remaining);await p.clock.fastForward(remaining-60000);await p.locator('#sessionWarning').waitFor();assert.match(await p.locator('#sessionWarningText').innerText(),/30-дневный/);assert.equal(await p.locator('#continueSession').isHidden(),true);
 await p.clock.fastForward(60000);await p.locator('#login').waitFor();await p2.locator('#login').waitFor();assert.equal(await p.locator('#inventory').innerText(),'');assert.equal(await p.evaluate(key=>localStorage.getItem(key),KEY),null);await p.waitForFunction(()=>document.getElementById('status').textContent.includes('Время входа истекло'));assert.equal(signouts,1);
 await p.reload();await settled(p);assert.equal(await p.locator('#workspace').isHidden(),true);
 await login(p);await p.locator('#logout').click();await p.locator('#login').waitFor();await p.reload();await settled(p);assert.equal(await p.locator('#workspace').isHidden(),true);assert.equal(await p.evaluate(key=>localStorage.getItem(key),KEY),null);assert.deepEqual(errors,[]);
 await c.close();
 console.log('PASS reload, 29-day idle + browser restart, token rotation, concurrent tabs, exact 30-day expiry, cross-tab cleanup and manual logout');
}finally{await browser.close();server.close()}})().catch(error=>{console.error(error);server.close();process.exitCode=1});
