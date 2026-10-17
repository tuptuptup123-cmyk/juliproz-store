const taxonomy=window.CatalogTaxonomy||{category:v=>String(v||'').trim(),brandParts:v=>[...new Set(String(v||'').split(/\s*×\s*/).map(x=>x.trim()).filter(Boolean))],unique:v=>[...new Set(v)]};
const adminCategoryAliases={'Сумка':'Сумки','Клатч':'Сумки','Клатчи':'Сумки','Кроссовки':'Обувь','Кроссовок':'Обувь','Ботинки':'Обувь','Сандалии':'Обувь','Туфли':'Обувь','Футболка':'Футболки','Рубашка':'Рубашки','Свитер':'Свитеры','Кардиган':'Кардиганы','Куртка':'Куртки','Жилет':'Жилеты','Костюм':'Костюмы','Шорты':'Шорты','Джинсы':'Джинсы','Брюки':'Брюки','Пиджак':'Пиджаки','Платье':'Платья','Юбка':'Юбки','Топ':'Топы','Майка':'Майки','Свитшот':'Свитшоты','Пуховик':'Пуховики','Тренч':'Тренчи','Купальник':'Купальники','Комбинезон':'Комбинезоны','Час':'Часы','Очки':'Очки','Аксессуар':'Аксессуары','Украшение':'Украшения','Парфюм':'Духи','Свеча':'Ароматические свечи','Свечи':'Ароматические свечи','Ароматическая свеча':'Ароматические свечи','Благовоние':'Благовония','Головной убор':'Головной убор','Зип худи':'Зип-худи','Зип-худи':'Зип-худи','Зипхуди':'Зип-худи','Леггинс':'Леггинсы','Легинсы':'Леггинсы','Легинс':'Леггинсы','Лонгслив':'Лонгсливы','Лонгсливы':'Лонгсливы','Блуза':'Блузы','Блузка':'Блузы','Блузки':'Блузы','Поло':'Поло','Худи':'Худи','Одежда':'Одежда','Пальто':'Пальто','Перчатка':'Перчатки','Спортивная одежда':'Спортивная одежда','Пляжная одежда':'Пляжная одежда','Техника':'Техника','Парфюмерия':'Духи','Аромат':'Духи','Ароматы':'Духи','Косметичка':'Косметички','Косметички':'Косметички','Чехол':'Чехлы','Чехлы':'Чехлы','Щетка':'Щётки','Щетки':'Щётки'};
const adminCategoryKey=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
const adminCategories=new Map(Object.entries(adminCategoryAliases).flatMap(([a,b])=>[[adminCategoryKey(a),b],[adminCategoryKey(b),b]]));
const adminCategory=v=>adminCategories.get(adminCategoryKey(v))||taxonomy.category(v);
const categoryOf=p=>adminCategory(p?.category);
const adminBrandAliases={'эрмес':'hermes','гермес':'hermes','шанель':'chanel','гуччи':'gucci','диор':'dior','луи виттон':'louis vuitton','луи вuitton':'louis vuitton','лоро пиана':'loro piana','боттега венета':'bottega veneta','боттега':'bottega','хром хартс':'chrome hearts','миу миу':'miu miu','прада':'prada','лоэве':'loewe','сен лоран':'saint laurent'};
function adminSearchText(v){
 let value=String(v??'').replace(/№/g,' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е');
 for(const [alias,brand] of Object.entries(adminBrandAliases))value=value.replaceAll(alias,brand);
 return value.replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function matchesAdminSearch(p,query){
 const terms=adminSearchText(query).split(' ').filter(Boolean);
 return !terms.length||terms.every(term=>productSearchText(p).includes(term));
}
const sameLabel=(a,b)=>taxonomy.key?taxonomy.key(a)===taxonomy.key(b):a===b;
const hasCategory=(p,value)=>sameLabel(categoryOf(p),value);
const wearLabels={like_new:'Как новая',gently_used:'Небольшие следы носки',used:'Следы носки',very_used:'Сильный износ'};
const wearLabel=p=>p?.product_condition==='pre_owned'?(wearLabels[p.wear_condition]||''):'';
const conditionLabels={new:'Новая вещь',pre_owned:'PRE-OWNED',vintage:'VINTAGE'};
function brandsOf(p){return taxonomy.brandParts(p?.brand)}
function editorBrand(f){return taxonomy.unique([f.brand.value,f.collaboration_brand?.value].flatMap(v=>taxonomy.brandParts(v))).join(' × ')}
const {url,key}=window.STORE_CONFIG;
let adminSecurity={paused:false,pending:false};
const mfaPaused=()=>adminSecurity.paused===true;
const MFA_ENROLLMENT_ENABLED=window.STORE_CONFIG.mfaEnrollmentEnabled===true;
const $=id=>document.getElementById(id);
const ADMIN_SESSION_KEY='jpAdminSessionInfoV2';
let legacyMigration=null;
let rememberAdminSession=false,restorePending=false,persistedAdminSession=false,persistedRefreshToken=null;
let session=null,items=[],editing=null,photos=[],busy=false;
function stockSummary(rows){const stock=rows.filter(p=>p.available&&p.fulfillment_status!=='on_order');let total=0,unpriced=0,unconverted=0,count=0;for(const p of stock){const units=typeof ProductSizes!=='undefined'?ProductSizes.stockUnits(p):1;count+=units;if(!units)continue;if(window.ProductPricing.amount(p.price,p.currency)==null){unpriced++;continue}if(!['EUR','€'].includes(p.currency||'EUR')){unconverted++;continue}total+=window.ProductPricing.amount(p.price,p.currency)*units}return {count,total,unpriced,unconverted}}
function setStockNumber(id,value,animate=false){
 const el=$(id);if(el.dataset.numberValue===value&&el.textContent!=='—'&&animate!=='force')return;el.dataset.numberValue=value;
 if(!animate||adminPreferences.reducedMotion||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof document.createElement!=='function'){el.textContent=value;return}
 el.textContent='';const spoken=document.createElement('span');spoken.className='sr-only';spoken.textContent=value;el.append(spoken);
 const visual=document.createElement('span');visual.className='stock-number';visual.setAttribute('aria-hidden','true');el.append(visual);
 let digit=0;for(const char of value){if(!/\d/.test(char)){const text=document.createElement('span');text.textContent=char;visual.append(text);continue}
  const reel=document.createElement('span'),strip=document.createElement('span');reel.className='stock-digit';strip.className='stock-digit-strip';const steps=20+Number(char);
  for(let i=0;i<=steps;i++){const n=document.createElement('span');n.textContent=String(i%10);strip.append(n)}reel.append(strip);visual.append(reel);
  strip.style.transform=`translateY(-${steps*1.25}em)`;
  const motion=strip.animate?.([{transform:'translateY(0)'},{transform:`translateY(-${steps*1.25}em)`}],{duration:900+digit*85,easing:'cubic-bezier(.15,.7,.2,1)'});if(motion)motion.onfinish=()=>{reel.textContent=char;if(!visual.querySelector('.stock-digit-strip')){visual.textContent=value;visual.classList.add('stock-number-finished')}};else reel.textContent=char;digit++;
 }
}
function updateStockSummary(animate=!$('workspace').classList.contains('hidden')){const s=stockSummary(items);setStockNumber('stockTotal',String(items.length),animate);setStockNumber('stockCount',String(s.count),animate);setStockNumber('stockValue',(s.unconverted?'от ':'')+new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(s.total),animate);$('stockValueNote').textContent=[s.unpriced?'Без цены: '+s.unpriced:'',s.unconverted?'Требуют проверки цены: '+s.unconverted:''].filter(Boolean).join(' · ')}

// Only non-secret coordination metadata is stored in the browser.
function clearLegacyAdminSession(){for(const key of ['jpAdminSessionV1','jpAdminReloadSessionV1']){try{localStorage.removeItem(key)}catch{}try{sessionStorage.removeItem(key)}catch{}}}
function readSavedAdminSession(){try{return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY)||'null')}catch{return null}}
function clearSavedAdminSession(){clearLegacyAdminSession();try{localStorage.removeItem(ADMIN_SESSION_KEY);localStorage.removeItem('jpAdminSession30dV1')}catch{}persistedAdminSession=false;persistedRefreshToken=null}
function adminSessionId(s){return s?.session_id||null}
function syncSavedAdminSession(){
 if(!session||!rememberAdminSession||!persistedAdminSession)return;
 const saved=readSavedAdminSession();
 if(!saved||saved.user_id!==session.user.id||saved.session_id!==session.session_id){
  endSession(false);throw Error('Вход изменён в другой вкладке. Обновите страницу.');
 }
}
function saveAdminSession(){
 if(!session||!rememberAdminSession||recovering||sessionClock.state().expired)return false;
 try{localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({user_id:session.user.id,session_id:session.session_id,absolute:sessionClock.snapshot().absolute}));persistedAdminSession=true;return true}catch{return false}
}


let adminPreferences={autoPhoto:true,reducedMotion:false};
try{const saved=JSON.parse(localStorage.getItem('jpAdminPreferences')||'{}');adminPreferences={autoPhoto:saved.autoPhoto!==false,reducedMotion:saved.reducedMotion===true}}catch{}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('status').textContent=s; if(s)$('status').scrollIntoView({block:'nearest'})}
const ADMIN_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,fulfillment_status,gender,description,photos,revision,creation_key,reserved,product_condition,stock_quantities,on_commission,original_price,wear_condition,archive_status,team_pick';
let sessionEpoch=0,refreshPromise=null,original=null,creationKey=null;
// A monotonic floor prevents a backwards device-clock change from extending a session.
const sessionWallStart=Date.now(),sessionMonoStart=typeof performance!=='undefined'?performance.now():0;
const sessionClock=window.AdminSessionClock.create(()=>Math.max(Date.now(),sessionWallStart+(typeof performance!=='undefined'?performance.now()-sessionMonoStart:0)));
let activityPromise=null;
function expireAdminSession(){
 endSession();
 status('Время входа истекло. Войди заново. Несохранённые изменения не отправлены.');

}
function checkAdminSession(){
 const state=sessionClock.state();
 if(session&&state.expired){expireAdminSession();return false}
 const banner=$('sessionWarning');if(banner){banner.classList.toggle('hidden',!session||!state.warning);if(session&&state.warning){$('sessionWarningText').textContent='Скоро закончится 30-дневный срок входа. Сохрани изменения и войди заново.';$('continueSession').classList.add('hidden')}}
 return true;
}
async function touchAdminSession(force=false){
 if(!session||!checkAdminSession())throw Error('Сессия завершена. Войди заново.');
 if(activityPromise)return activityPromise;
 if(!force&&!sessionClock.due())return;
 const epoch=sessionEpoch,sentAt=sessionClock.sent();
 const pending=(async()=>{
  try{const data=await request('/rest/v1/rpc/touch_store_admin_session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   if(epoch!==sessionEpoch)return;if(!sessionClock.accept(data,sentAt))expireAdminSession();else{checkAdminSession();saveAdminSession()}
  }catch(error){if(epoch===sessionEpoch){if([401,403].includes(error.httpStatus)){expireAdminSession();error.message='Сессия завершена или у аккаунта нет доступа. Войди заново.'}else sessionClock.retry()}throw error}
  finally{if(activityPromise===pending)activityPromise=null}
 })();activityPromise=pending;return pending;
}
function recordAdminActivity(event){
 if(!event.isTrusted||document.visibilityState==='hidden'||!session||!checkAdminSession())return;
 if(sessionClock.activity())touchAdminSession().catch(()=>{});
}
for(const type of ['pointerdown','keydown','input','wheel','touchstart'])document.addEventListener(type,recordAdminActivity,{capture:true,passive:true});
window.setInterval?.(()=>{if(session&&checkAdminSession())touchAdminSession().catch(()=>{})},15000);
document.addEventListener('visibilitychange',checkAdminSession);
window.addEventListener('focus',checkAdminSession);
$('continueSession').onclick=()=>{if(session&&checkAdminSession()){sessionClock.activity();touchAdminSession(true).catch(()=>{})}};
const stagedUploads=new Map();
let mfaFactorId=null,mfaMode=null,mfaEnrollment=null,recovering=false,emailFlowType=null,emailLinkState=null;
function showAuthStep(id){
 $('authArea').classList.remove('hidden');$('workspace').classList.add('hidden');
 for(const panel of ['sessionRestore','login','confirmEmail','newPassword','pendingAccess','mfaPanel','emailLink'])$(panel).classList.toggle('hidden',panel!==id);
}
function clearEmailLink(){emailLinkState=null;$('emailLinkIdentity').textContent='';$('renewEmailLink').reset();$('emailLink').classList.add('hidden')}
function showPasswordSetup(){
 clearMfa();showAuthStep('newPassword');
 $('newPasswordTitle').textContent=emailFlowType==='invite'?'Создайте пароль':'Новый пароль';
 $('newPasswordMessage').textContent=emailFlowType==='invite'?'Придумай пароль для следующих входов — минимум 12 символов. Затем настроим защиту аккаунта.':'Минимум 12 символов. Этот пароль понадобится для следующих входов.';
 status('');
}
function clearMfa(){
 mfaFactorId=null;mfaMode=null;mfaEnrollment=null;
 $('mfaPanel').classList.add('hidden');$('mfaSetup').classList.add('hidden');$('mfaChoice').classList.add('hidden');
 $('mfaVerify').reset();$('mfaQr').onload=null;$('mfaQr').onerror=null;$('mfaQr').removeAttribute?.('src');$('mfaQr').classList.add('hidden');$('mfaQrError').classList.add('hidden');$('mfaSecret').textContent='';$('mfaFactor').innerHTML='';
}
function endSession(clearSaved=true){
 if(clearSaved){window.AdminTransport?.request('/auth/v1/logout?scope=local',{method:'POST'}).catch(()=>{});window.AdminTransport?.clear()}
 window.AdminStepUp?.cancel();window.AdminImages?.clear();window.AdminHealth?.clear();window.AdminGoogleSearch?.clear();
 busy=false;sessionClock.clear();rememberAdminSession=false;restorePending=false;activityPromise=null;emailFlowType=null;clearEmailLink();$('sessionWarning').classList.add('hidden');$('photoStudio').close?.();
 if(clearSaved)clearSavedAdminSession();persistedAdminSession=false;persistedRefreshToken=null;window.ProductSharing?.close();window.AdminWorkspace?.clear();window.AdminManager?.clear();window.AdminSales?.clear();window.AdminSchedule?.clear();window.AdminFinance?.clear();window.AdminProductFinance?.clear();clearInternalFields();
 internalNoteState=null;if($('editor').elements?.internal_note)$('editor').elements.internal_note.value='';pendingCover=false;window.PhotoStudio?.cancel();adminSecurity={paused:false};session=null;sessionEpoch++;previewEpoch++;items=[];photos=[];editing=null;original=null;creationKey=null;recovering=false;
 for(const id of ['stockTotal','stockCount','stockValue'])$(id).textContent='—';$('stockValueNote').textContent='';stagedUploads.clear();$('editorProductActions').innerHTML='';clearMfa();$('authArea').classList.remove('hidden');pendingPreviews=[];editorDirty=false;activeView='all';$('settingsPanel').classList.add('hidden');clearOverview();$('adminHome').classList.add('hidden');$('homePanel').classList.add('hidden');$('cataloguePreview').close?.();$('cataloguePreviewCard').innerHTML='';productWishlistCounts=null;productWishlistLoadedAt=0;$('analyticsPanel').classList.add('hidden');$('analyticsCards').innerHTML='';$('analyticsProducts').innerHTML='';$('retentionStatus').textContent='';analyticsData=null;analyticsChartMetric='visitors';$('analyticsChart').innerHTML='';
 for(const id of ['editor','login','confirmEmail','newPassword'])$(id).reset();
 for(const id of ['workspace','editor','confirmEmail','newPassword','pendingAccess','sessionRestore'])$(id).classList.add('hidden');
 $('login').classList.remove('hidden');resetInventoryCache();$('inventory').innerHTML='';$('photos').innerHTML='';$('adminSearch').value='';$('photoUrl').value='';$('uploads').value='';
}
async function fetchJSON(path,options={},token){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),path==='/functions/v1/invite-store-admin'?45000:20000);
 try{return await window.AdminTransport.request(path,{...options,signal:controller.signal});
 }catch(err){if(err.name==='AbortError')throw Error('Сервер не ответил. Попробуй ещё раз.');throw err}finally{clearTimeout(timer)}
}
async function request(path,options={}){
 const publicAuth=/^\/auth\/v1\/(token|recover|verify)/.test(path);
 if(publicAuth)return fetchJSON(path,options);
 syncSavedAdminSession();
 const epoch=sessionEpoch;
 if(!session||!checkAdminSession())throw Error('Сессия завершена. Войди заново.');
 if(session.expires_at<Date.now()/1000+60){
  if(!refreshPromise){
   const refresh=async()=>{
    if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена.');
    // Another tab may have rotated the token while this tab waited for the lock.
    syncSavedAdminSession();if(session.expires_at>=Date.now()/1000+60)return;
    const data=await fetchJSON('/session');
    if(epoch!==sessionEpoch)throw Error('Сессия завершена.');keepSession(data);
   };
   refreshPromise=(typeof navigator!=='undefined'&&navigator.locks?.request?navigator.locks.request('jp-admin-auth-refresh',refresh):refresh()).catch(err=>{if(epoch===sessionEpoch&&[400,401,403].includes(err.httpStatus))endSession();throw err}).finally(()=>{refreshPromise=null});
  }
  await refreshPromise;
 }
 if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена. Войди заново.');
 let data;try{data=await fetchJSON(path,options)}catch(err){
  if(epoch===sessionEpoch&&err.code==='PT403'&&err.message==='MFA_STEP_UP_REQUIRED'&&window.AdminStepUp){
   await window.AdminStepUp.ensure();if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена.');
   data=await fetchJSON(path,options);
  }else{if(epoch===sessionEpoch&&err.httpStatus===401)endSession();throw err}
 }
 if(epoch!==sessionEpoch)throw Error('Сессия завершена.');
 return data;
}
function keepSession(data,fresh=false,saved=null){
 if(data?.cookie_session!==true||!data.user||!data.session_id)throw Error('Не удалось подтвердить вход.');
 const remaining=Math.min(window.AdminSessionClock.MAX,Date.parse(data.limits?.absolute)-Date.parse(data.server_now));
 if(!Number.isFinite(remaining)||remaining<=0)throw Error('Сессия завершена.');
 let deadline=Date.now()+remaining;
 // Reload must preserve the previous local deadline despite response latency.
 // Metadata may shorten UI lifetime only; server authorization remains authoritative.
 if(saved?.user_id===data.user.id&&saved?.session_id===data.session_id&&Number.isFinite(saved.absolute)&&saved.absolute>Date.now())deadline=Math.min(deadline,saved.absolute);
 if(fresh||!session){clearLegacyAdminSession();sessionClock.start({absolute:deadline,idle:deadline});rememberAdminSession=false}
 else{const limits=sessionClock.snapshot();sessionClock.start({absolute:Math.min(limits.absolute,deadline),idle:Math.min(limits.idle,deadline)})}
 session=data;if(data.setup_flow){recovering=true;emailFlowType=data.setup_flow}saveAdminSession();
}
// Public metadata controls UI only. Supabase still verifies JWTs on the server.
function sessionAal(){return session?.aal||'aal1'}
async function currentAuthUser(){
 const user=await request('/auth/v1/user');
 if(!user?.id||user.id!==session?.user.id){endSession();throw Error('Не удалось проверить аккаунт. Войди заново.')}
 session.user=user;return user;
}
function showMfaChallenge(factors){
 clearMfa();mfaMode='challenge';mfaFactorId=factors[0].id;
 $('mfaFactor').innerHTML=factors.map(f=>`<option value="${esc(f.id)}">${esc(f.friendly_name||'Приложение-аутентификатор')}</option>`).join('');
 $('mfaFactor').value=mfaFactorId;$('mfaChoice').classList.toggle('hidden',factors.length<2);
 showAuthStep('mfaPanel');
 $('mfaInfo').textContent='Введи шестизначный код из своего приложения-аутентификатора.';$('mfaPanel').classList.remove('hidden');status('');
}
async function enableMfaProtection(){
 if(adminSecurity.pending)return;
 if(!MFA_ENROLLMENT_ENABLED)return;
 await request('/rest/v1/rpc/enforce_store_mfa',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});adminSecurity={...adminSecurity,paused:false};
}
async function enterWorkspace(){
 await touchAdminSession(true);
 $('pendingAccess').classList.add('hidden');
 const security=await request('/rest/v1/rpc/store_admin_security_status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});adminSecurity={paused:security?.paused===true,pending:security?.pending===true,owner:security?.access_role==='owner'};
 if(!adminSecurity.pending){const admins=await request(`/rest/v1/store_admins?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`);if(!admins.length){endSession();throw Error('У этого аккаунта нет доступа к управлению магазином.')}}
 const user=await currentAuthUser(),verified=(user.factors||[]).filter(f=>f.status==='verified');
 if(recovering&&emailFlowType==='invite'&&!verified.length){showPasswordSetup();return}
 if(verified.length&&sessionAal()!=='aal2'&&!mfaPaused()){
  const totp=verified.filter(f=>f.factor_type==='totp');
  if(!totp.length){endSession();throw Error('Для этого аккаунта нужен поддерживаемый TOTP-фактор. Обратись к владельцу проекта.')}
  $('login').reset();showMfaChallenge(totp);return;
 }
 if(!verified.length&&!mfaPaused()&&sessionAal()!=='aal2'){if(!MFA_ENROLLMENT_ENABLED)throw Error('Подключение второго фактора недоступно. Обратись к владельцу проекта.');await prepareMfaEnrollment();return}
 if(sessionAal()==='aal2'&&verified.length)await enableMfaProtection();
 clearMfa();
 if(recovering){showPasswordSetup();return}
 if(adminSecurity.pending){$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('workspace').classList.add('hidden');$('authArea').classList.remove('hidden');$('pendingAccess').classList.remove('hidden');status('Почта и второй фактор подтверждены. Владелец должен отдельно подтвердить доступ.');return}
 $('securityState').textContent=verified.length?'Вход защищён кодом из приложения.':'Подключи код из приложения, чтобы защитить управление магазином.';
 $('securityBtn').textContent=verified.length?'Добавить запасной аутентификатор':'Настроить защиту входа';
 $('securityBtn').classList.toggle('hidden',!MFA_ENROLLMENT_ENABLED);
 if(mfaPaused()){$('securityState').textContent='Двухфакторная проверка временно отключена. Подтверди код из приложения, чтобы включить её.';$('securityBtn').textContent='Включить двухфакторную проверку';}
 if(!MFA_ENROLLMENT_ENABLED&&!verified.length)$('securityState').textContent='';
 await load();keepSession(await fetchJSON('/session/complete',{method:'POST'}));rememberAdminSession=true;saveAdminSession();$('login').reset();$('confirmEmail').reset();$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('workspace').classList.remove('hidden');$('authArea').classList.add('hidden');selectView('home',true);window.AdminWorkspace?.loadTeam();status('');refreshOverview();loadProductWishlistCounts();updateStockSummary('force');
}
$('login').onsubmit=async e=>{e.preventDefault();if(busy)return;const b=e.submitter,epoch=sessionEpoch;b.disabled=true;busy=true;try{
 status('');$('status').classList.add('admin-loading');$('status').innerHTML='<span class="admin-loading-content"><span class="loading-brand" aria-hidden="true"><span class="admin-logo">J.P</span><img class="loading-paw" src="images/brand-paw.webp" alt=""><span class="loading-signature">BY VASYA</span></span><span class="loading-caption">Загружаем управление магазином…</span><span class="loading-track" aria-hidden="true"></span></span>';
 const data=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.target.email.value.trim(),password:e.target.password.value})});
 if(epoch!==sessionEpoch)return;keepSession(data,true);await enterWorkspace();
}catch(err){if(epoch===sessionEpoch||!session)status(err.message)}finally{$('status').classList.remove('admin-loading');if($('status').querySelector?.('.loading-brand'))status('');busy=false;b.disabled=false;e.target.password.value=''}};
$('recover').onclick=async()=>{
 if(busy)return;
 const email=$('login').email.value.trim();if(!email){status('Введи Email для восстановления пароля.');return}
 const b=$('recover'),epoch=sessionEpoch;b.disabled=true;busy=true;try{await request('/auth/v1/recover?redirect_to='+encodeURIComponent('https://admin.juliproz.com/admin.html'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});if(epoch!==sessionEpoch)return;$('confirmEmail').classList.remove('hidden');status('Если аккаунт существует, письмо для восстановления отправлено.')}catch(err){if(epoch===sessionEpoch)status(err.message)}finally{busy=false;b.disabled=false}
};
$('newPassword').onsubmit=async e=>{e.preventDefault();if(busy)return;const b=e.submitter;b.disabled=true;busy=true;try{const password=e.target.password.value;if(password.length<12)throw Error('Пароль должен содержать минимум 12 символов.');await request('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});recovering=false;emailFlowType=null;await enterWorkspace();$('newPassword').reset();$('newPassword').classList.add('hidden')}catch(err){status(err.message)}finally{busy=false;b.disabled=false;e.target.password.value=''}};
$('confirmEmail').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const b=e.submitter,epoch=sessionEpoch;b.disabled=true;busy=true;
 try{
  const link=new URL(e.target.confirmation.value.trim());
  if(link.origin!==url||link.pathname!=='/auth/v1/verify'||!link.searchParams.get('token'))throw Error('Вставь ссылку подтверждения именно из письма Supabase.');
  const type=link.searchParams.get('type');if(!['invite','recovery'].includes(type))throw Error('Неподдерживаемая ссылка подтверждения.');
  const token=link.searchParams.get('token');e.target.confirmation.value='';
  const data=await request('/auth/v1/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash:token,type})});
  if(epoch!==sessionEpoch)return;
  if(!data?.cookie_session)throw Error('Не удалось подтвердить ссылку.');
  emailLinkState={type,publicSession:data};
  busy=false;await validateEmailLink();
 }catch(err){if(epoch===sessionEpoch||!session)status(err.message)}finally{busy=false;b.disabled=false}
};
async function load(){const rows=[];for(let offset=0;;offset+=500){const page=await request(`/rest/v1/products?select=${ADMIN_FIELDS}&order=created_at.desc,id.desc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break}items=rows;window.AdminSchedule?.invalidateHome();render()}
let pendingCover=false;
let activeView='all',editorDirty=false,pendingPreviews=[],previewEpoch=0;
const viewNames={needs_review:'Нужно заполнить',sale:'SALE',pre_owned:'PRE-OWNED',vintage:'VINTAGE',commission:'Комиссия',all:'Все товары',in_stock:'В наличии',on_order:'Под заказ',hidden:'Скрытые',sold:'Проданные',legacy:'Нужно разобрать',sales:'История продаж',reserved:'На брони',analytics:'Статистика',settings:'Настройки',home:'Главное',history:'История изменений',team:'Команда',profile:'Профиль',schedule:'Расписание',finance:'Финансовый отчёт'};
function matchesView(p,view){if(view==='needs_review')return p.available===true&&Boolean(window.ProductQuality?.issues(p).length);if(!p.available)return view==='all'||view===(p.archive_status||'legacy');return view==='all'||(view==='sale'&&Boolean(window.ProductPricing.discount(p)))||(view==='commission'&&p.on_commission===true)||(['pre_owned','vintage'].includes(view)?p.product_condition===view:false)||(view==='reserved'?p.available&&p.reserved===true:view==='hidden'?!p.available:p.available&&!p.reserved&&(view!=='in_stock'||ProductSizes.stockUnits(p)>0)&&(p.fulfillment_status==='on_order'?'on_order':'in_stock')===view)}
function adminPriceMarkup(p){return window.ProductPricing.markup(p,cataloguePrice,esc)||'Цена по запросу'}
function inventoryAvailability(p){return !p.available?({sold:'Продано',hidden:'Скрыто',legacy:'Нужно разобрать'}[p.archive_status]||'Нужно разобрать'):p.reserved?'На брони':p.fulfillment_status==='on_order'?'Под заказ':ProductSizes.stockUnits(p)===0?'Нет остатка':'В наличии'}
function formatPrice(p){return cataloguePrice(p)||'Цена по запросу'}
// Keep catalogue work bounded and retain the list while a product is open.
const INVENTORY_BATCH_SIZE=48;
let inventorySnapshot=null,inventoryRevision=0,inventoryKey=null,inventoryRows=[],inventoryRendered=0,inventoryRenderFrame=0,inventoryScrollY=0;
let productSearchCache=new WeakMap();
function productSearchText(p){
 let cached=productSearchCache.get(p);
 if(!cached||cached.revision!==p.revision){cached={revision:p.revision,text:adminSearchText([p.brand,p.name,p.id,p.size,p.category,categoryOf(p),p.description].filter(v=>v!=null).join(' '))};productSearchCache.set(p,cached)}
 return cached.text;
}
function resetInventoryCache(){
 window.cancelAnimationFrame?.(inventoryRenderFrame);inventoryRenderFrame=0;inventorySnapshot=null;inventoryRevision++;inventoryKey=null;inventoryRows=[];inventoryRendered=0;inventoryScrollY=0;productSearchCache=new WeakMap();$('moreInventory').classList.add('hidden');
}
function syncInventoryMetadata(){
 if(inventorySnapshot?.length===items.length&&inventorySnapshot.every((entry,i)=>entry.row===items[i]&&entry.revision===items[i].revision))return;
 inventorySnapshot=items.map(row=>({row,revision:row.revision}));inventoryRevision++;updateStockSummary();
 document.querySelectorAll('[data-count]').forEach(el=>el.textContent=items.filter(p=>matchesView(p,el.dataset.count)).length);
 const currentCategory=$('categoryFilter').value;
 const categories=taxonomy.unique(items.map(categoryOf).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'ru'));
 const categoryOptions='<option value="">Все категории</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 if($('categoryFilter').innerHTML!==categoryOptions){$('categoryFilter').innerHTML=categoryOptions;$('categoryFilter').value=adminCategory(currentCategory)}
 const categoryChoices=taxonomy.unique([...document.querySelectorAll('#categories option')].map(o=>adminCategory(o.value||o.textContent)).concat(categories));
 $('categories').innerHTML=categoryChoices.map(c=>`<option value="${esc(c)}"></option>`).join('');
 $('brands').innerHTML=taxonomy.unique(items.flatMap(brandsOf).filter(Boolean)).sort().map(b=>`<option value="${esc(b)}"></option>`).join('');
 window.AdminSelects?.sync();
}
function adminTeamPickBadge(p){return p?.team_pick===true?'<span class="team-pick-badge">Выбор команды</span>':''}
function inventoryCard(p){return `<article><button type="button" class="open-product-card" data-edit="${esc(p.id)}" aria-label="Открыть карточку ${esc(brandsOf(p).join(' × '))} ${esc(p.name)}"></button><div class="product-cell">${safeProductImage(p.image_url)?`<img class="product-thumb" ${AdminImages.attrs(p.image_url)} alt="${esc(p.name)}" loading="lazy" decoding="async">`:'<span class="product-thumb thumb-placeholder">J.P</span>'}<div class="product-title">${adminTeamPickBadge(p)}<strong>${esc(brandsOf(p).join(' × '))}</strong><p>${esc(catalogueDisplayName(p)||p.name)}</p>${p.product_condition&&p.product_condition!=='new'?`<small>${esc(conditionLabels[p.product_condition])}</small>`:''}${p.on_commission?'<small>Комиссия</small>':''}<small>№ ${esc(p.id)} · ${esc(categoryOf(p))} · ${{women:'Женское',men:'Мужское',unisex:'Унисекс'}[p.gender]||'Унисекс'}</small></div></div><div class="product-size">${esc(p.size||'Размер уточняйте')}<small class="inventory-quantity">${ProductSizes.stockUnits(p)+' шт.'}</small></div><div class="product-price">${adminPriceMarkup(p)}</div><div class="product-status"><span class="badge ${!p.available?'concealed':p.reserved?'reserved':p.fulfillment_status==='on_order'?'order':'stock'}">${inventoryAvailability(p)}</span></div><div class="product-wishlist"><span aria-hidden="true">♡</span> <span data-product-wishlist="${esc(p.id)}">${productWishlistLabel(p.id)}</span></div></article>`}
function renderInventoryBatch(reset=false){
 const start=reset?0:inventoryRendered;inventoryRendered=Math.min(inventoryRows.length,start+INVENTORY_BATCH_SIZE);
 const markup=inventoryRows.slice(start,inventoryRendered).map(inventoryCard).join('');
 if(reset)$('inventory').innerHTML=markup||'<div class="empty-state"><h2>Товары не найдены</h2><p>Измените поиск или фильтры.</p></div>';
 else $('inventory').insertAdjacentHTML('beforeend',markup);
 $('moreInventory').classList.toggle('hidden',inventoryRendered>=inventoryRows.length);
 $('resultCount').textContent=inventoryRendered===inventoryRows.length?`Показано ${inventoryRows.length} из ${items.length} товаров`:`Показано ${inventoryRendered} из ${inventoryRows.length} товаров`;
}
function render(){
 window.cancelAnimationFrame?.(inventoryRenderFrame);inventoryRenderFrame=0;
 if(editing!==null&&!$('editor').classList.contains('hidden')&&!editorDirty){const current=items.find(p=>String(p.id)===String(editing));if(current&&current.revision!==original?.revision)edit(current)}
 syncInventoryMetadata();
 $('adminHome').classList.toggle('hidden',!session);const inventoryView=!['analytics','settings','history','team','profile','sales','schedule','finance'].includes(activeView);$('adminHome').setAttribute('aria-current',inventoryView?'page':'false');$('adminHome').classList.toggle('active',inventoryView);
 document.querySelectorAll('[data-view]').forEach(el=>{const selected=el.dataset.view===activeView||(el.closest('.top-navigation')&&el.dataset.view==='analytics'&&activeView==='finance')||(el.closest('.top-navigation')&&el.dataset.view==='settings'&&['profile','team','history'].includes(activeView));el.classList.toggle('active',selected);if(el.classList.contains('nav-item')){if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')}});
 $('viewTitle').textContent=activeView==='all'?'Главное':viewNames[activeView];window.AdminManager?.sync();
 if(!inventoryView||!$('editor').classList.contains('hidden'))return;
 window.AdminSelects?.sync();window.AdminSales?.inventoryHint(activeView);
 const q=adminSearchText($('adminSearch').value),category=$('categoryFilter').value,gender=$('genderFilter').value;
 const sort=$('inventorySort').value;const nextKey=JSON.stringify([inventoryRevision,activeView,q,category,gender,sort]);if(inventoryKey===nextKey)return;
 inventoryKey=nextKey;const terms=q.split(' ').filter(Boolean);
 inventoryRows=items.filter(p=>matchesView(p,activeView)&&(!category||hasCategory(p,category))&&(!gender||p.gender===gender)&&(!terms.length||terms.every(term=>productSearchText(p).includes(term))));
 if(sort==='brand')inventoryRows.sort((a,b)=>String(a.brand||'').localeCompare(String(b.brand||''),'ru'));
 else if(sort==='price_asc'||sort==='price_desc')inventoryRows.sort((a,b)=>{const ap=window.ProductPricing.amount(a.price,a.currency),bp=window.ProductPricing.amount(b.price,b.currency);return ap==null?(bp==null?0:1):bp==null?-1:sort==='price_asc'?ap-bp:bp-ap});
 renderInventoryBatch(true);
}
$('moreInventory').onclick=()=>{const first=inventoryRendered;renderInventoryBatch();$('inventory').children[first]?.querySelector('button')?.focus({preventScroll:true})};
if(window.IntersectionObserver){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&session&&!$('inventoryPanel').classList.contains('hidden')&&inventoryRendered<inventoryRows.length)renderInventoryBatch()},{rootMargin:'600px'});observer.observe($('moreInventory'))}
function renderEditorActions(p){
 $('editorProductActions').innerHTML=p?`${p.archive_status==='sold'?`<button type="button" data-sales-history="${esc(p.id)}">Продажа и возврат</button>`:`<button type="button" data-sell="${esc(p.id)}">Отметить продано</button><button type="button" data-toggle="${esc(p.id)}">${p.available?'Скрыть с витрины':'Вернуть в продажу'}</button>${!p.available&&p.archive_status!=='hidden'?`<button type="button" data-hide="${esc(p.id)}">Это скрытая вещь</button>`:''}`}<button type="button" data-reserve="${esc(p.id)}" class="reserve-action" ${!p.available?'disabled':''}>${p.reserved?'Снять бронь':'Бронь'}</button>${adminSecurity.owner?`<button type="button" data-delete="${esc(p.id)}" class="delete-action" aria-label="Удалить ${esc(brandsOf(p).join(' × '))} ${esc(p.name)}">Удалить</button>`:''}`:'';
 $('editorProductActions').classList.toggle('hidden',!p);
}
function showInventory(){window.AdminProductFinance?.clear();$('editorProductActions').innerHTML='';$('settingsNavigation').classList.add('hidden');window.AdminWorkspace?.hidePanels();window.AdminSales?.hide();window.AdminSchedule?.hide();window.AdminFinance?.hide();clearInternalFields();internalNoteState=null;if($('editor').elements?.internal_note)$('editor').elements.internal_note.value='';editorDirty=false;pendingPreviews=[];previewEpoch++;$('editor').classList.add('hidden');$('homePanel').classList.remove('hidden');$('analyticsPanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');$('inventoryPanel').classList.remove('hidden');if(['analytics','settings','home','history','team','profile','sales','schedule','finance'].includes(activeView))activeView='all';render();window.AdminSchedule?.loadHome();window.scrollTo(0,inventoryScrollY);}
function leaveEditor(){if(busy)return false;if(editorDirty&&!confirm('Выйти без сохранения изменений?'))return false;if(!$('editor').classList.contains('hidden'))showInventory();return true}
function selectView(view,initial=false){if(view==='home')view='all';if(!Object.hasOwn(viewNames,view)||(!initial&&(busy||window.AdminSchedule?.mayLeave()===false||!leaveEditor())))return;if(initial)showInventory();if(view!==activeView&&!['analytics','settings','home','history','team','profile','sales','schedule','finance'].includes(view)){$('adminSearch').value='';$('categoryFilter').value='';$('genderFilter').value=''}activeView=view;$('settingsNavigation').classList.toggle('hidden',!['settings','profile','team','history'].includes(view));$('homePanel').classList.remove('hidden');$('analyticsPanel').classList.toggle('hidden',view!=='analytics');$('settingsPanel').classList.toggle('hidden',view!=='settings');$('inventoryPanel').classList.toggle('hidden',['analytics','settings','home','history','team','profile','sales','schedule','finance'].includes(view));render();animateAdminPage($(view==='home'?'homePanel':view==='analytics'?'analyticsPanel':view==='settings'?'settingsPanel':view==='profile'?'profilePanel':view==='team'?'teamPanel':view==='history'?'historyPanel':view==='sales'?'salesPanel':view==='schedule'?'schedulePanel':view==='finance'?'financePanel':'inventoryPanel'));window.AdminWorkspace?.onView(view);window.AdminSales?.onView(view);window.AdminSchedule?.onView(view);window.AdminFinance?.onView(view);if(view==='analytics')loadAnalytics();if(!['analytics','settings','home','history','team','profile','sales','schedule','finance'].includes(view))loadProductWishlistCounts()}
$('workspace').addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(button)selectView(button.dataset.view)});
$('adminSearch').oninput=()=>{if(!inventoryRenderFrame)inventoryRenderFrame=requestAnimationFrame(render)};$('categoryFilter').onchange=render;$('genderFilter').onchange=render;
$('resetFilters').onclick=()=>{$('adminSearch').value='';$('categoryFilter').value='';$('genderFilter').value='';render()};
function syncPriceMode(){const f=$('editor').elements,query=f.price_on_request?.checked===true;f.price.disabled=query;if(f.original_price)f.original_price.disabled=query;if(query){f.price.value='';if(f.original_price)f.original_price.value=''}}
const internalFields={note:'internal_note',location:'internal_location',custodian:'internal_custodian'};
const internalSelect='product_id,note,location,custodian,revision';
function clearInternalFields(){for(const name of Object.values(internalFields)){const f=$('editor').elements?.[name];if(f)f.value=''}}
function internalValues(row={}){return Object.fromEntries(Object.keys(internalFields).map(k=>[k,typeof row[k]==='string'?row[k]:'']))}
function readInternalFields(){return Object.fromEntries(Object.entries(internalFields).map(([k,name])=>[k,$('editor').elements?.[name]?.value.trim()||'']))}
function setInternalDisabled(disabled){for(const name of Object.values(internalFields)){const f=$('editor').elements?.[name];if(f)f.disabled=disabled}}
function validateInternalFields(){const v=readInternalFields();if(v.note.length>5000)throw Error('Внутренняя заметка — не больше 5000 символов.');if(v.location.length>500||v.custodian.length>500)throw Error('Местонахождение и хранитель — не больше 500 символов.');return v}
let internalNoteState=null;
function resetInternalNote(p){
 if(!$('editor').elements?.internal_note)return;
 internalNoteState={id:p?.id??null,saved:'',details:internalValues(),revision:null,loaded:p==null,promise:null,error:null};
 clearInternalFields();setInternalDisabled(false);$('internalNoteStatus').textContent='';$('retryInternalNote').classList.add('hidden');
 if($('productHistoryBtn'))$('productHistoryBtn').disabled=p==null;
 syncInternalNote();
}
function syncInternalNote(){
 if(!$('editor').elements?.internal_note||!internalNoteState)return;
 $('internalNoteCard').classList.remove('hidden');
 if(!internalNoteState.loaded&&!internalNoteState.promise&&!internalNoteState.error)loadInternalNote();
}
function loadInternalNote(){
 const state=internalNoteState,epoch=sessionEpoch;if(!$('editor').elements?.internal_note||!state)return Promise.resolve();
 setInternalDisabled(true);$('internalNoteStatus').textContent='Загружаем внутреннюю информацию…';$('retryInternalNote').classList.add('hidden');state.error=null;
 state.promise=(async()=>{
  try{
   const rows=await request(`/rest/v1/product_admin_notes?product_id=eq.${encodeURIComponent(state.id)}&select=${internalSelect}&limit=1`);
   if(!Array.isArray(rows)||rows.length>1||(rows[0]&&(String(rows[0].product_id)!==String(state.id)||typeof rows[0].note!=='string'||!Number.isSafeInteger(rows[0].revision))))throw Error('Некорректный ответ загрузки заметки');
   if(internalNoteState!==state||epoch!==sessionEpoch)return;
   state.details=internalValues(rows[0]);state.saved=state.details.note;state.revision=rows[0]?.revision??null;state.loaded=true;
   for(const [k,name] of Object.entries(internalFields)){const f=$('editor').elements?.[name];if(f)f.value=state.details[k]}
   setInternalDisabled(false);$('internalNoteStatus').textContent='Сохраняется вместе с карточкой. Только для команды.';
  }catch(error){
   if(internalNoteState!==state||epoch!==sessionEpoch)return;
   state.error=error;$('internalNoteStatus').textContent='Не удалось загрузить внутреннюю информацию. Повторите загрузку перед сохранением.';$('retryInternalNote').classList.remove('hidden');
  }finally{state.promise=null}
 })();return state.promise;
}
$('retryInternalNote').onclick=()=>loadInternalNote();
async function saveInternalNote(id){
 const state=internalNoteState;if(!$('editor').elements?.internal_note||!state)return;
 if(state.promise)await state.promise;
 if(state.error||!state.loaded)throw Error('Внутренняя заметка не загружена. Повторите загрузку.');
 const values=validateInternalFields();if(JSON.stringify(values)===JSON.stringify(state.details))return;
 const path=state.revision==null?`/rest/v1/product_admin_notes?select=${internalSelect}`:`/rest/v1/product_admin_notes?product_id=eq.${encodeURIComponent(id)}&revision=eq.${state.revision}&select=${internalSelect}`;
 let rows;try{rows=await request(path,{method:state.revision==null?'POST':'PATCH',headers:writeHeaders,body:JSON.stringify(state.revision==null?{product_id:id,...values}:values)})}catch(error){
  try{const current=await request(`/rest/v1/product_admin_notes?product_id=eq.${encodeURIComponent(id)}&select=${internalSelect}&limit=1`);if(Array.isArray(current)&&current.length===1&&String(current[0].product_id)===String(id)&&JSON.stringify(internalValues(current[0]))===JSON.stringify(values))rows=current;else throw error}catch{throw error}
 }
 if(!Array.isArray(rows)||rows.length!==1||String(rows[0].product_id)!==String(id)||JSON.stringify(internalValues(rows[0]))!==JSON.stringify(values)||!Number.isSafeInteger(rows[0].revision))throw Error('Заметка изменилась на другом устройстве. Откройте карточку заново и сравните пометки.');
 state.id=id;state.saved=values.note;state.details=values;state.revision=rows[0].revision;state.loaded=true;
}
function updatePreview(){syncInternalNote();const wf=$('editor').elements;if($('wearConditionField'))$('wearConditionField').classList.toggle('hidden',wf.product_condition?.value!=='pre_owned');if(wf.wear_condition){wf.wear_condition.disabled=wf.product_condition?.value!=='pre_owned';if(wf.wear_condition.disabled)wf.wear_condition.value=''}
 syncPriceMode();
 const f=$('editor').elements;
 const quality=window.ProductQuality?.issues({name:f.name.value,description:f.description.value,product_condition:f.product_condition.value,wear_condition:f.wear_condition.value,photos:[...photos,...pendingPreviews.map(p=>p.src)]})||[{target:'productBasics',message:'Подсказки недоступны. Проверьте данные по правилам добавления вещи.'}];
 $('productQualityList').innerHTML=quality.length?quality.map(q=>`<li><a href="#${esc(q.target)}">${esc(q.message)}</a></li>`).join(''):'<li class="quality-complete">Основные сведения заполнены. Проверьте точную модель и фотографии.</li>';

 $('previewTeamPick').classList.toggle('hidden',!f.team_pick?.checked);
 $('previewCondition').textContent=[conditionLabels[f.product_condition?.value||'new'],f.on_commission?.checked?'Комиссия':''].filter(Boolean).join(' · ');$('previewBrand').textContent=editorBrand(f)||'БРЕНД';$('previewName').textContent=f.name.value.trim()||'Название товара';
 $('previewSize').textContent=f.size.value.trim()?ProductSizes.variantLabel({size:f.size.value})+': '+ProductSizes.parse(f.size.value).join(' / '):'Размер уточняйте';
 $('previewPrice').innerHTML=adminPriceMarkup({price:f.price.value,currency:'EUR',original_price:f.original_price?.value});
 const onOrder=f.fulfillment_status.value==='on_order',visible=f.available.checked,reserved=f.reserved?.checked;
 $('previewAvailability').textContent=!visible?(original?.archive_status==='sold'?'Продано':original?.archive_status==='legacy'?'Нужно разобрать':'Скрыто'):reserved?'На брони':onOrder?'Под заказ':'В наличии';$('previewAvailability').className='badge '+(!visible?'concealed':reserved?'reserved':onOrder?'order':'stock');
 const delivery=onOrder?'10–14':'7–10';$('previewDelivery').textContent=`Доставка ${delivery} рабочих дней`;$('deliveryHint').textContent=`Доставка: ${delivery} рабочих дней.`;
 $('saveHint').textContent=visible?'После сохранения карточка будет видна покупателям.':original?.archive_status==='sold'?'Продажа сохранена в истории. Для возврата отмените её там.':original?.archive_status==='legacy'?'Уточните статус через «Отметить продано» или «Это скрытая вещь».':'Карточка будет в «Скрытых». Для записи продажи используйте «Отметить продано».';
 const image=pendingCover?pendingPreviews[0]?.src:photos[0]||pendingPreviews[0]?.src;
 if(($('previewImage').querySelector('img')?.getAttribute('data-private-photo')||$('previewImage').querySelector('img')?.getAttribute('src')||'')!==(image||''))$('previewImage').innerHTML=image?`<img ${AdminImages.attrs(image)} alt="Предпросмотр товара" decoding="async">`:'<span>Добавьте фотографию</span>';
}
$('editor').addEventListener('input',()=>{editorDirty=true;updatePreview()});$('editor').addEventListener('change',()=>{editorDirty=true;updatePreview()});
window.addEventListener('beforeunload',e=>{if(editorDirty||busy||window.AdminSchedule?.hasUnsavedChanges()){e.preventDefault();e.returnValue=''}});
let quantityDraft=Object.create(null),quantityDirty=false;
function renderQuantities(){const sizes=ProductSizes.parse($('editor').elements.size.value),keys=sizes.length?sizes:[''];$('sizeQuantities').innerHTML=keys.map(size=>`<label>${esc(size?ProductSizes.variantLabel({size:$('editor').elements.size.value})+': '+size:'Количество товара')}<input type="number" min="0" max="9999" step="1" data-quantity-size="${esc(size)}" value="${esc(quantityDraft[size]??1)}" aria-label="Количество: ${esc(size?ProductSizes.variantLabel({size:$('editor').elements.size.value})+': '+size:'Количество товара')}"></label>`).join('')}
$('sizeQuantities').addEventListener('input',e=>{const size=e.target.dataset?.quantitySize;if(size===undefined)return;quantityDraft[size]=e.target.value;quantityDirty=true;editorDirty=true});
$('editor').addEventListener('input',e=>{if(e.target.name==='size')renderQuantities()});
function editorQuantities(){if(original?.stock_quantities==null&&!quantityDirty&&editing!==null)return null;const sizes=ProductSizes.parse($('editor').elements.size.value),out={};for(const size of sizes.length?sizes:['']){const raw=quantityDraft[size]??1,n=Number(raw);if(raw===''||!Number.isInteger(n)||n<0||n>9999)throw Error('Количество должно быть целым числом от 0 до 9999.');Object.defineProperty(out,size,{value:n,enumerable:true})}return out}
function edit(p){if(window.AdminSchedule?.mayLeave()===false)return;if(editorDirty&&!confirm('Открыть другую карточку без сохранения изменений?'))return;if($('editor').classList.contains('hidden'))inventoryScrollY=window.scrollY;pendingCover=false;$('settingsNavigation').classList.add('hidden');window.AdminWorkspace?.hidePanels();window.AdminSales?.hide();window.AdminSchedule?.hide();window.AdminFinance?.hide();window.PhotoStudio?.close();editorDirty=false;pendingPreviews=[];previewEpoch++;$('uploads').value='';$('photoUrl').value='';status('');original=p?structuredClone(p):null;creationKey=crypto.randomUUID();stagedUploads.clear();editing=p?.id??null;quantityDraft=Object.create(null);for(const [raw,n] of Object.entries(p?.stock_quantities||{})){const k=ProductSizes.normalize?ProductSizes.normalize(raw.trim()):raw;quantityDraft[k]=Object.hasOwn(quantityDraft,k)?'':n}quantityDirty=false;photos=[...new Set([p?.image_url,...(Array.isArray(p?.photos)?p.photos:[])].filter(safeProductImage))];$('editor').reset();$('uploadGuide').open=editing===null;$('autoPhotoStyle').checked=adminPreferences.autoPhoto;for(const field of ['brand','name','category','size','price','description'])$('editor').elements[field].value=(field==='price'?window.ProductPricing.amount(p?.price,p?.currency):p?.[field])??'';if($('editor').elements.collaboration_brand){const brands=brandsOf(p);$('editor').elements.brand.value=brands[0]||'';$('editor').elements.collaboration_brand.value=brands.slice(1).join(' × ')}if($('editor').elements.product_condition)$('editor').elements.product_condition.value=p?.product_condition||'new';if($('editor').elements.wear_condition)$('editor').elements.wear_condition.value=p?.wear_condition||'';if($('editor').elements.price_on_request)$('editor').elements.price_on_request.checked=p!=null&&p.price==null;$('editor').elements.category.value=categoryOf(p);$('editor').elements.size.value=ProductSizes.parse(p?.size).join('\n');const currency='EUR';$('editor').elements.currency.value=currency;if($('editor').elements.original_price)$('editor').elements.original_price.value=window.ProductPricing.amount(p?.original_price,p?.currency)??'';$('editor').elements.available.checked=p?.available??true;$('editor').elements.available.disabled=p?.archive_status==='sold';$('editor').elements.reserved.checked=p?.reserved??false;if($('editor').elements.on_commission){$('editor').elements.on_commission.checked=p?.on_commission===true;$('editor').elements.on_commission.disabled=!adminSecurity.owner}if($('editor').elements.team_pick)$('editor').elements.team_pick.checked=p?.team_pick===true;$('editor').elements.fulfillment_status.value=p?.fulfillment_status==='on_order'?'on_order':'in_stock';$('editor').elements.gender.value=['women','men','unisex'].includes(p?.gender)?p.gender:'unisex';$('editorTitle').textContent=editing===null?'Новый товар':`Товар № ${editing}`;$('editorRef').textContent=editing===null?'СОЗДАНИЕ КАРТОЧКИ':`АРТИКУЛ ${editing}`;$('shareEditorProduct').disabled=!p?.available;$('shareEditorProduct').title=p?.id==null?'Сначала сохраните товар':!p.available?'Товар снят с продажи':'';$('homePanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');$('analyticsPanel').classList.add('hidden');$('inventoryPanel').classList.add('hidden');$('editor').classList.remove('hidden');animateAdminPage($('editor'));renderEditorActions(p);resetInternalNote(p);window.AdminProductFinance?.show(p);renderQuantities();renderPhotos();$('editor').scrollIntoView({behavior:'auto',block:'start'});$('editor').elements.brand.focus({preventScroll:true})}
function renderPhotos(){
 $('styleExistingPhotos').disabled=busy||!photos.length;
 $('photos').innerHTML=photos.map((x,i)=>`<div class="photo-tile"><img ${AdminImages.attrs(x)} alt="Фото ${i+1}" loading="lazy" decoding="async"><button type="button" class="${i===0&&!pendingCover?'cover-selected':''}" data-cover="${i}">${i===0&&!pendingCover?'Обложка ✓':'Сделать обложкой'}</button><button type="button" data-remove="${i}" aria-label="Убрать фото ${i+1}">Убрать</button></div>`).join('')+pendingPreviews.map((p,i)=>`<div class="photo-tile"><img src="${esc(p.src)}" alt="${esc(p.name)}"><span class="pending-label">${i===0&&(pendingCover||!photos.length)?'Обложка · ':''}${p.state?(p.reviewed?'Проверено ✓':'Проверьте обработку'):'Оригинал'}</span><button type="button" class="${i===0&&(pendingCover||!photos.length)?'cover-selected':''}" data-pending-cover="${i}">${i===0&&(pendingCover||!photos.length)?'Обложка ✓':'Сделать обложкой'}</button><button type="button" data-studio="${i}">${p.state?'Редактировать фото':'Оформить фото'}</button><button type="button" class="pending-photo-remove" data-pending-remove="${i}" aria-label="Убрать новое фото ${i+1}">Убрать</button></div>`).join('');updatePreview();
}
function syncPendingFiles(){try{const dt=new DataTransfer();pendingPreviews.forEach(p=>dt.items.add(p.file));$('uploads').files=dt.files}catch{$('uploads').value=''}}
function selectedPhotoFiles(){return pendingPreviews.length?pendingPreviews.map(p=>p.file):[...$('uploads').files]}
function readPhotoFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({src:reader.result,originalSrc:reader.result,name:file.name,file,originalFile:file});reader.onerror=()=>reject(Error('Не удалось прочитать фото.'));reader.readAsDataURL(file)})}
async function stylePending(index){
 if(busy)return;const entry=pendingPreviews[index];if(!entry)return;
 if(entry.state){openPhotoStudio(index);return}
 const epoch=previewEpoch;busy=true;$('editorFields').disabled=true;$('save').disabled=true;
 try{$('photoProcessingStatus').textContent='Удаляем фон и оформляем фото… При первом запуске обработка может занять больше времени.';const result=await PhotoStudio.process(entry.originalFile);if(epoch!==previewEpoch)return;pendingPreviews[index]=result;syncPendingFiles();renderPhotos();openPhotoStudio(index)}catch(err){status(err.message)}finally{busy=false;$('editorFields').disabled=false;$('save').disabled=false;$('photoProcessingStatus').textContent=''}
}
function openPhotoStudio(index){const entry=pendingPreviews[index],epoch=previewEpoch;if(!entry?.state)return;
 PhotoStudio.open(entry,result=>{if(epoch!==previewEpoch||busy)return;stagedUploads.delete(entry.file);pendingPreviews[index]={...result,reviewed:true};syncPendingFiles();editorDirty=true;renderPhotos()},()=>{if(epoch!==previewEpoch||busy)return;stagedUploads.delete(entry.file);pendingPreviews[index]={src:entry.originalSrc,originalSrc:entry.originalSrc,name:entry.name,file:entry.originalFile,originalFile:entry.originalFile};syncPendingFiles();editorDirty=true;renderPhotos()});
}
$('uploads').onchange=async()=>{
 if(busy)return;const epoch=++previewEpoch,files=[...$('uploads').files],previous=[...pendingPreviews];editorDirty=true;
 busy=true;$('editorFields').disabled=true;$('save').disabled=true;
 try{
  if(photos.length+previous.length+files.length>20)throw Error('Максимум 20 фотографий.');
  for(const file of files)if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, не больше 6 МБ.');
  const previews=[];let failures=0;
  for(let i=0;i<files.length;i++){
   if(epoch!==previewEpoch)return;
   $('photoProcessingStatus').textContent=$('autoPhotoStyle').checked?`Оформляем фото ${i+1} из ${files.length}… При первом запуске подождите загрузку редактора.`:`Подготавливаем фото ${i+1} из ${files.length}…`;
   let entry=await readPhotoFile(files[i]);
   if($('autoPhotoStyle').checked)try{entry=await PhotoStudio.process(files[i])}catch{failures++}
   previews.push(entry);
  }
  if(epoch!==previewEpoch)return;pendingPreviews=[...previous,...previews];syncPendingFiles();renderPhotos();status(failures?`Для ${failures} фото не удалось удалить фон — оставлены оригиналы. Нажмите «Оформить фото», чтобы повторить.`:'Фотографии подготовлены. Проверьте результат перед сохранением карточки.');
 }catch(err){if(epoch!==previewEpoch)return;pendingPreviews=previous;syncPendingFiles();renderPhotos();status(err.message)}
 finally{busy=false;$('editorFields').disabled=false;$('save').disabled=false;$('photoProcessingStatus').textContent=''}
};
$('photos').onclick=e=>{if(busy)return;const b=e.target.closest('button');if(!b)return;
 if(b.dataset.studio!==undefined){stylePending(Number(b.dataset.studio));return}
 if(b.dataset.pendingCover!==undefined){const index=Number(b.dataset.pendingCover);if(!pendingPreviews[index])return;const [entry]=pendingPreviews.splice(index,1);pendingPreviews.unshift(entry);pendingCover=true;syncPendingFiles();previewEpoch++}
 if(b.dataset.remove!==undefined)photos.splice(Number(b.dataset.remove),1);
 if(b.dataset.cover!==undefined){const [photo]=photos.splice(Number(b.dataset.cover),1);photos.unshift(photo);pendingCover=false}
 if(b.dataset.pendingRemove!==undefined){const index=Number(b.dataset.pendingRemove);pendingPreviews.splice(index,1);syncPendingFiles();if(index===0)pendingCover=false;previewEpoch++}
 editorDirty=true;renderPhotos();
};
$('newProduct').onclick=()=>{if(!busy)edit(null)};$('topNewProduct').onclick=$('newProduct').onclick;
$('cancel').onclick=leaveEditor;$('backToCatalog').onclick=leaveEditor;
$('addUrl').onclick=()=>{if(busy)return;try{const u=new URL($('photoUrl').value);if(!safeProductImage(u.href))throw Error();if(photos.length+$('uploads').files.length>=20){status('Максимум 20 фотографий.');return}if(!photos.includes(u.href))photos.push(u.href);$('photoUrl').value='';editorDirty=true;renderPhotos()}catch{status('Разрешены фото магазина и его хранилища. Для других фото используй загрузку файла.')}};
const writeHeaders={'Content-Type':'application/json',Prefer:'return=representation'};
function verifiedRow(rows,id){if(!Array.isArray(rows)||rows.length!==1||(id!=null&&String(rows[0].id)!==String(id)))throw Error('Карточка изменилась или доступ закрыт. Обнови список и открой товар заново.');return rows[0]}
$('inventory').onclick=async e=>{if(busy)return;const button=e.target.closest?.('button')||e.target;
 const id=button.dataset.sell??button.dataset.hide??button.dataset.salesHistory??button.dataset.shareProduct??button.dataset.preview??button.dataset.edit??button.dataset.toggle??button.dataset.reserve??button.dataset.delete;if(id===undefined)return;const p=items.find(x=>String(x.id)===id);if(!p)return;
 if(button.dataset.edit===undefined&&button.dataset.preview===undefined&&button.dataset.shareProduct===undefined&&editing!==null&&String(editing)===id&&editorDirty){status('Сначала сохраните изменения карточки или отмените их.');return}
 if(button.dataset.sell!==undefined){window.AdminSales?.open(p);return}
 if(button.dataset.salesHistory!==undefined){window.AdminSales?.forProduct(p.id);return}
 if(button.dataset.shareProduct!==undefined){shareAdminProduct(p);return}
 if(button.dataset.preview!==undefined){openCataloguePreview(p);return}
 if(button.dataset.edit!==undefined){edit(p);return}
 const deleting=button.dataset.delete!==undefined,reserving=button.dataset.reserve!==undefined;
 if(reserving&&!p.available){status('Сначала верните товар в продажу.');return}
 if(deleting&&!adminSecurity.owner){status('Постоянно удалять товары может только владелец. Используйте «Скрыть с витрины».');return}
 if(deleting&&!confirm(`Удалить «${p.brand} ${p.name}» (№ ${p.id})? Карточка будет удалена из магазина. Это действие нельзя отменить.`))return;
 const editingProduct=!$('editor').classList.contains('hidden')&&String(editing)===id;
 busy=true;button.disabled=true;if(editingProduct)$('editorFields').disabled=true;
 try{
  const change=reserving?{reserved:!p.reserved}:{available:button.dataset.hide!==undefined?false:!p.available,archive_status:button.dataset.hide!==undefined||p.available?'hidden':null,reserved:false};
  const row=verifiedRow(await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&revision=eq.${p.revision}&select=${ADMIN_FIELDS}`,{method:deleting?'DELETE':'PATCH',headers:writeHeaders,...(deleting?{}:{body:JSON.stringify(change)})}),id);
  if(!deleting&&Object.entries(change).some(([k,v])=>row[k]!==v))throw Error('Не удалось подтвердить изменение. Обновите список.');
  const index=items.findIndex(item=>String(item.id)===String(id));
  if(deleting){if(index>=0)items.splice(index,1)}else if(index>=0)items[index]=row;
  if(deleting&&String(editing)===id)showInventory();else render();
  const message=deleting?'Товар удалён':reserving?(change.reserved?'Товар на брони — покупка заблокирована':p.available?'Бронь снята — товар снова можно купить':'Бронь снята. Товар остаётся в архиве'):(change.available?'Товар возвращён в каталог':'Товар скрыт с витрины. Продажа не записана');
  status(message);try{await load()}catch{if(session)status(message+'. Не удалось обновить список с сервера — обновите его позже.')}
 }catch(err){status(err.message)}finally{busy=false;button.disabled=false;if(editingProduct)$('editorFields').disabled=false}
};
$('editorProductActions').onclick=$('inventory').onclick;
async function preparePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, не больше 6 МБ.');
 let bitmap;try{bitmap=await PhotoCodec.decode(file)}catch{throw Error('Не удалось прочитать фото.')}
 let canvas;
 try{
  if(bitmap.width*bitmap.height>40000000)throw Error('Фото слишком большое.');
  const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
  for(let attempt=0;attempt<4;attempt++){
   let blob;try{blob=await PhotoCodec.encode(canvas,.92)}catch(error){if(attempt===3)throw error}
   if(blob&&blob.size<=6*1024*1024)return blob;
   if(attempt===3)throw Error('Не удалось подготовить фото до 6 МБ. Выберите фото меньшего размера.');
   const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width*.8));smaller.height=Math.max(1,Math.round(canvas.height*.8));smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas.width=canvas.height=1;canvas=smaller;
  }
 }finally{bitmap?.close();if(canvas)canvas.width=canvas.height=1}
}

async function uploadPhoto(file){
 const epoch=sessionEpoch,owner=session?.user.id;
 if(!owner)throw Error('Сессия завершена. Войди заново.');
 let staged=stagedUploads.get(file);
 if(!staged){const blob=await preparePhoto(file);if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена.');staged={path:`${owner}/${crypto.randomUUID()}.${blob.type==='image/png'?'png':'webp'}`,blob,done:false,attempted:false};stagedUploads.set(file,staged)}
 const photo=`${url}/storage/v1/object/public/product-photos/${staged.path}`;
 if(!staged.done){
  if(staged.attempted){const objects=await request('/storage/v1/object/list/product-photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:session.user.id,search:staged.path.split('/')[1],limit:100})});staged.done=objects.some(o=>o.name===staged.path.split('/')[1]);}
  if(!staged.done){staged.attempted=true;await request(`/storage/v1/object/product-photos/${staged.path}`,{method:'POST',headers:{'Content-Type':staged.blob.type},body:staged.blob});staged.done=true}
 }
 return photo;
}
$('editor').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=$('save');b.disabled=true;$('editorFields').disabled=true;try{
 const f=e.target.elements,files=selectedPhotoFiles();if(internalNoteState?.promise)await internalNoteState.promise;if(internalNoteState?.error)throw Error('Не удалось загрузить внутреннюю заметку. Повторите загрузку перед сохранением.');validateInternalFields();await window.AdminProductFinance?.validate();
 const payload={team_pick:f.team_pick?.checked===true,original_price:f.price_on_request?.checked||!f.original_price||f.original_price.value===''?null:Number(f.original_price.value),on_commission:f.on_commission?.checked===true,stock_quantities:editorQuantities(),product_condition:f.product_condition?.value||'new',wear_condition:f.product_condition?.value==='pre_owned'?(f.wear_condition?.value||null):null,brand:editorBrand(f),name:f.name.value.trim(),category:adminCategory(f.category.value),size:ProductSizes.serialize(f.size.value),price:f.price_on_request?.checked||f.price.value===''?null:Number(f.price.value),currency:'EUR',description:f.description.value.trim()||null,available:f.available.checked,archive_status:f.available.checked?null:original?.available===false?(original.archive_status||'legacy'):'hidden',fulfillment_status:f.fulfillment_status.value,gender:f.gender.value,reserved:f.available.checked&&f.reserved?.checked===true};
 if(!['new','pre_owned','vintage'].includes(payload.product_condition))throw Error('Выберите состояние вещи.');
 if(!['women','men','unisex'].includes(payload.gender))throw Error('Выбери раздел товара.');
 if(!['in_stock','on_order'].includes(payload.fulfillment_status))throw Error('Выбери статус товара.');
 if(payload.brand.length>150)throw Error('Общая длина названий брендов — не больше 150 символов.');
 if(!payload.brand||!payload.name||!payload.category)throw Error('Заполни бренд, название и категорию.');
 if(payload.price!==null&&(!Number.isFinite(payload.price)||payload.price<0))throw Error('Проверь цену.');
 window.ProductPricing.validate(payload.original_price,payload.price);
 payload.price=window.ProductPricing.amount(payload.price,payload.currency);payload.original_price=window.ProductPricing.amount(payload.original_price,payload.currency);
 if(payload.wear_condition&&!Object.hasOwn(wearLabels,payload.wear_condition))throw Error('Проверь состояние вещи.');
 if(payload.currency!=='EUR')throw Error('Проверь валюту.');
 if(photos.length+files.length>20)throw Error('Максимум 20 фотографий.');
 if(!photos.length&&!files.length)throw Error('Добавь хотя бы одну фотографию.');
 if(pendingPreviews.some(p=>p.state&&!p.reviewed))throw Error('Проверьте каждое обработанное фото: нажмите «Редактировать фото», затем «Применить фото» или «Оставить оригинал».');
 if(!photos.every(safeProductImage))throw Error('Фото должно быть в магазине или его хранилище.');
 // Check identity before uploads; a lost insert response must never create a second card.
 if(editing===null){const previous=await request(`/rest/v1/products?creation_key=eq.${creationKey}&select=${ADMIN_FIELDS}`);if(previous.length){const row=verifiedRow(previous);editing=row.id;original=row}}
 const uploadedPhotos=[];
 for(let i=0;i<files.length;i++){status(`Загружаем фото ${i+1} из ${files.length}…`);uploadedPhotos.push(await uploadPhoto(files[i]))}
 photos=[...new Set(pendingCover&&uploadedPhotos.length?[uploadedPhotos[0],...photos,...uploadedPhotos.slice(1)]:[...photos,...uploadedPhotos])];pendingCover=false;
 $('uploads').value='';pendingPreviews=[];previewEpoch++;renderPhotos();payload.image_url=photos[0];payload.photos=[...photos];
 const changed=original?Object.fromEntries(Object.entries(payload).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(k==='archive_status'?(original[k]??(original.available?null:'legacy')):original[k]))):{...payload,creation_key:creationKey};
 if(!Object.keys(changed).length){await saveInternalNote(editing);await window.AdminProductFinance?.save(editing);showInventory();status('Товар сохранён');return}
 const path=editing===null?`/rest/v1/products?select=${ADMIN_FIELDS}`:`/rest/v1/products?id=eq.${encodeURIComponent(editing)}&revision=eq.${original.revision}&select=${ADMIN_FIELDS}`;
 const row=verifiedRow(await request(path,{method:editing===null?'POST':'PATCH',headers:writeHeaders,body:JSON.stringify(changed)}),editing);
 editing=row.id;original=row;stagedUploads.clear();const savedIndex=items.findIndex(p=>String(p.id)===String(row.id));if(savedIndex<0)items.unshift(row);else items[savedIndex]=row;try{await saveInternalNote(row.id)}catch(error){editorDirty=true;throw Error('Товар сохранён, но внутренняя заметка не сохранена. '+error.message+' Ваш текст остался в редакторе — повторите сохранение.')}try{await window.AdminProductFinance?.save(row.id)}catch(error){editorDirty=true;throw Error('Товар сохранён, но закупка не сохранена. '+error.message+' Суммы остались в редакторе — повторите сохранение.')} const index=items.findIndex(p=>String(p.id)===String(row.id));if(index<0)items.unshift(row);else items[index]=row;showInventory();status('Товар сохранён');try{await load()}catch{status('Товар сохранён. Не удалось обновить список с сервера — обновите его позже.')}
}catch(err){status(err.message)}finally{busy=false;b.disabled=false;$('editorFields').disabled=false}};
async function signOut(scope='local'){
 if(!['local','global'].includes(scope))scope='local';
 if(scope==='global'&&!confirm('Выйти на всех устройствах? Потребуется войти заново.'))return;
 if(busy||window.AdminSchedule?.mayLeave()===false)return;if(editorDirty&&!confirm('Выйти из аккаунта без сохранения карточки?'))return;busy=true;let revoked=false;
 try{await request(`/auth/v1/logout?scope=${scope}`,{method:'POST'});revoked=true}catch{}finally{endSession();busy=false}
 status(revoked?(scope==='global'?'Вы вышли на всех устройствах. Доступ к управлению магазином для этих сессий закрыт.':'Вы вышли'):(scope==='global'?'Вы вышли на этом устройстве. Сервер не подтвердил выход на остальных устройствах — войдите и повторите попытку.':'Вы вышли на этом устройстве. Сервер не подтвердил завершение сессии.'));
}
$('logout').onclick=()=>signOut();
$('logoutAll').onclick=()=>signOut('global');
$('mfaCancel').onclick=async()=>{
 if(busy)return;
 busy=true;
 const pending=mfaEnrollment?.id;
 if(pending){try{await request(`/auth/v1/factors/${encodeURIComponent(pending)}`,{method:'DELETE'})}catch{}}
 busy=false;await signOut();
};
function mfaQrImageSource(value){
 if(typeof value!=='string'||value.length>100000)return null;
 // Supabase REST uses SVGo: an XML declaration and generator comment precede <svg>.
 // Keep SVG in an inert image; never insert server markup into the document.
 const svg=value.trim().replace(/^<\?xml\b[^?]*\?>\s*/,'').replace(/^(?:<!--[\s\S]*?-->\s*)*/,'');
 return /^<svg(?:\s|>)/.test(svg)?`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`:null;
}
async function prepareMfaEnrollment(){
  const factor=await request('/auth/v1/factors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({factor_type:'totp',friendly_name:`JULI.PROZ ${crypto.randomUUID().slice(0,8)}`,issuer:'JULI.PROZ'})});
  if(!factor?.id||typeof factor.totp?.secret!=='string'||!factor.totp.secret)throw Error('Не удалось подготовить защиту входа.');
  clearMfa();mfaFactorId=factor.id;mfaEnrollment={id:factor.id};mfaMode='enroll';
  const qr=$('mfaQr'),source=mfaQrImageSource(factor.totp.qr_code);
  qr.onload=()=>{qr.classList.remove('hidden');$('mfaQrError').classList.add('hidden')};
  qr.onerror=()=>{qr.classList.add('hidden');$('mfaQrError').classList.remove('hidden')};
  if(source)qr.src=source;else qr.onerror();
  $('mfaSecret').textContent=factor.totp.secret;
  $('mfaInfo').textContent='Добавь этот QR-код в Google Authenticator, 1Password или другое приложение-аутентификатор. Если открываешь админку на этом же телефоне, добавь ключ ниже вручную и выбери код по времени. Затем введи шестизначный код из приложения — код из письма сюда не подходит. Сохрани доступ к аутентификатору.';
  showAuthStep('mfaPanel');$('mfaSetup').classList.remove('hidden');status('');
}
$('securityBtn').onclick=async()=>{
 if(!MFA_ENROLLMENT_ENABLED)return;
 if(busy||window.AdminSchedule?.mayLeave()===false)return;if(editorDirty&&!confirm('Перейти к защите входа без сохранения карточки?'))return;editorDirty=false;busy=true;const b=$('securityBtn');b.disabled=true;
 try{
  const user=await currentAuthUser();
  if((user.factors||[]).some(f=>f.status==='verified')&&sessionAal()!=='aal2'){const factors=user.factors.filter(f=>f.status==='verified'&&f.factor_type==='totp');if(!factors.length)throw Error('Нужен поддерживаемый TOTP-фактор.');showMfaChallenge(factors);return}
  await prepareMfaEnrollment();
 }catch(err){status(err.message)}finally{busy=false;b.disabled=false}
};
$('mfaFactor').onchange=e=>{if(!busy&&mfaMode==='challenge')mfaFactorId=e.target.value};
$('mfaVerify').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const b=e.submitter;busy=true;b.disabled=true;
 try{
  const code=e.target.code.value.trim();
  if(!mfaFactorId||!/^\d{6}$/.test(code))throw Error('Введи шестизначный код из приложения.');
  const path=`/auth/v1/factors/${encodeURIComponent(mfaFactorId)}`;
  const challenge=await request(`${path}/challenge`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!challenge?.id)throw Error('Не удалось проверить код.');
  const data=await request(`${path}/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge_id:challenge.id,code})});
  keepSession(data);
  if(sessionAal()!=='aal2')throw Error('Второй фактор не подтверждён.');
  // A failed activation stays on this screen; retrying cannot expose the workspace.
  await enableMfaProtection();clearMfa();await enterWorkspace();
 }catch(err){status(err.message)}finally{e.target.code.value='';busy=false;b.disabled=false}
};


if(new URLSearchParams(location.search).get('confirm')==='1')$('confirmEmail').classList.remove('hidden');

// Existing images are converted as a batch so cover and gallery order stay intact.
$('styleExistingPhotos').onclick=async()=>{
 if(busy||!photos.length)return;const epoch=previewEpoch,source=[...photos];busy=true;$('editorFields').disabled=true;$('save').disabled=true;
 try{
  const prepared=[];
  for(let i=0;i<source.length;i++){
   $('photoProcessingStatus').textContent=`Оформляем фото ${i+1} из ${source.length}…`;
   if(!safeProductImage(source[i]))throw Error('Недопустимая ссылка на фото.');
   const blob=await AdminImages.read(source[i]);if(blob.size>6*1024*1024)throw Error('Фото больше 6 МБ.');
   const file=new File([blob],`product-${editing??'new'}-${i+1}.${blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'}`,{type:blob.type});
   prepared.push(await PhotoStudio.process(file));if(epoch!==previewEpoch)return;
  }
  photos=[];pendingPreviews=[...prepared,...pendingPreviews];syncPendingFiles();editorDirty=true;renderPhotos();status('Фото оформлены. Проверьте каждое в редакторе перед сохранением.');
 }catch(e){if(epoch===previewEpoch)status(`${e.message} Исходные фото сохранены — попробуйте ещё раз.`)}
 finally{busy=false;$('editorFields').disabled=false;$('save').disabled=false;$('photoProcessingStatus').textContent='';renderPhotos()}
};
let analyticsBusy=false,analyticsData=null,analyticsChartMetric='visitors',analyticsChannel='website';
const analyticsChannelNotes={google:'Google: показы и переходы из поиска.',website:'Сайт: посещения и действия на juliproz.com.',telegram:'Бот: посещения и действия в магазине Telegram. Команды и переписка в чате сюда не входят.',legacy:'Архив: общие события до разделения каналов. Их источник не был сохранён, поэтому они не включаются в отчёты сайта и бота.'};
async function loadAnalytics(){
 const google=analyticsChannel==='google';$('storeAnalyticsReport').classList.toggle('hidden',google);$('googleSearchPanel').classList.toggle('hidden',!google);$('analyticsPanel').querySelector('.analytics-toolbar').classList.toggle('hidden',google);if(google){window.AdminGoogleSearch?.load();return}
 if(analyticsBusy||!session)return;analyticsBusy=true;const epoch=sessionEpoch;const channel=analyticsChannel;document.querySelectorAll('[data-analytics-channel]').forEach(b=>b.disabled=true);$('analyticsChannelNote').textContent=analyticsChannelNotes[channel];analyticsData=null;$('analyticsCards').innerHTML='';$('analyticsProducts').innerHTML='';$('analyticsChart').innerHTML='';$('analyticsDays').disabled=true;$('refreshAnalytics').disabled=true;$('analyticsStatus').textContent='Загружаем статистику…';
 try{const data=await request('/rest/v1/rpc/store_analytics_summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:Number($('analyticsDays').value),p_channel:channel})});if(epoch!==sessionEpoch)return;
  const report=window.AnalyticsReport.render(data);
  analyticsData=data;$('analyticsCards').innerHTML=report.cards;renderAnalyticsChart();
  $('analyticsProducts').innerHTML=report.details;
  $('analyticsStatus').textContent=`Обновлено ${new Date().toLocaleTimeString('ru-RU')}. Добавления и удаления — количество действий за период.`;
  try{const limited=await request('/rest/v1/rpc/store_analytics_health',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(epoch!==sessionEpoch)return;if(limited===true)$('analyticsStatus').textContent+=' Сбор приближается к защитным лимитам или достиг их: данные могут быть неполными.'}catch{if(epoch===sessionEpoch&&session)$('analyticsStatus').textContent+=' Статус лимитов недоступен.'}
  try{const botLimited=await request('/rest/v1/rpc/store_bot_health',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(epoch!==sessionEpoch)return;if(botLimited===true)$('analyticsStatus').textContent+=' Бот приближается к защитным лимитам или достиг их.'}catch{if(epoch===sessionEpoch&&session)$('analyticsStatus').textContent+=' Статус лимитов бота недоступен.'}
  try{const retention=await request('/rest/v1/rpc/store_analytics_retention_health',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(epoch!==sessionEpoch)return;$('retentionStatus').textContent=retention?.healthy===true?'Данные старше 90 дней удаляются ежедневно. Очистка работает.':'Нужно проверить автоматическую очистку старой статистики.'}catch{if(epoch===sessionEpoch&&session)$('retentionStatus').textContent='Статус автоматической очистки недоступен.'}
 }catch(e){if(epoch===sessionEpoch)$('analyticsStatus').textContent='Не удалось получить статистику. Попробуйте обновить.'}
 finally{analyticsBusy=false;document.querySelectorAll('[data-analytics-channel]').forEach(b=>b.disabled=false);$('analyticsDays').disabled=false;$('refreshAnalytics').disabled=false}
}
function renderAnalyticsChart(){if(!analyticsData)return;$('analyticsChart').innerHTML=window.AnalyticsReport.chart(analyticsData,analyticsChartMetric);document.querySelectorAll('[data-chart-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chartMetric===analyticsChartMetric)))}
$('analyticsChartControls').addEventListener('click',e=>{const b=e.target.closest('[data-chart-metric]');if(!b)return;analyticsChartMetric=b.dataset.chartMetric;renderAnalyticsChart()});
$('refreshAnalytics').onclick=loadAnalytics;$('analyticsDays').onchange=loadAnalytics;
$('analyticsChannels').addEventListener('click',e=>{const b=e.target.closest('[data-analytics-channel]');if(!b||analyticsBusy||!session||!Object.hasOwn(analyticsChannelNotes,b.dataset.analyticsChannel)||b.dataset.analyticsChannel===analyticsChannel)return;analyticsChannel=b.dataset.analyticsChannel;document.querySelectorAll('[data-analytics-channel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.analyticsChannel===analyticsChannel)));loadAnalytics()});

// Preferences affect this admin device only; they never change public store settings.
function applyAdminPreferences(){
 $('settingsAutoPhoto').checked=adminPreferences.autoPhoto;$('settingsMotion').checked=adminPreferences.reducedMotion;
 document.body?.classList.toggle('reduce-motion',adminPreferences.reducedMotion);$('autoPhotoStyle').checked=adminPreferences.autoPhoto;
}
function saveAdminPreferences(){
 adminPreferences={autoPhoto:$('settingsAutoPhoto').checked,reducedMotion:$('settingsMotion').checked};applyAdminPreferences();
 try{localStorage.setItem('jpAdminPreferences',JSON.stringify(adminPreferences));$('settingsStatus').textContent='Настройки сохранены на этом устройстве.'}catch{$('settingsStatus').textContent='Настройки применены на этот сеанс. Браузер не разрешил сохранить их.'}
}
$('settingsAutoPhoto').onchange=saveAdminPreferences;$('settingsMotion').onchange=saveAdminPreferences;applyAdminPreferences();
$('adminMenuToggle').onclick=()=>{
 const collapsed=$('adminSidebar').classList.toggle('is-mobile-collapsed');$('adminMenuToggle').setAttribute('aria-expanded',String(!collapsed));$('adminSidebar').inert=collapsed;
};
window.matchMedia?.('(min-width:701px)').addEventListener?.('change',event=>{if(event.matches){$('adminSidebar').classList.remove('is-mobile-collapsed');$('adminSidebar').inert=false;$('adminMenuToggle').setAttribute('aria-expanded','true')}});
function animateAdminPage(panel){if(adminPreferences.reducedMotion||window.matchMedia?.('(prefers-reduced-motion:reduce)').matches)return;panel.classList.remove('page-arrive');void panel.offsetWidth;panel.classList.add('page-arrive')}
function clearOverview(){for(const id of ['overviewActive','overviewVisitors','overviewWishlist','overviewCart'])$(id).textContent='—';$('overviewStatus').textContent=''}
function updateOverview(data,full=true){
 const number=value=>new Intl.NumberFormat('ru-RU').format(Math.max(0,Number(value)||0));$('overviewActive').textContent=number(data.active);
 if(full){$('overviewVisitors').textContent=number(data.visitors);$('overviewWishlist').textContent=number(data.wishlist_add);$('overviewCart').textContent=number(data.cart_add)}
 $('overviewStatus').textContent=`Статистика обновлена в ${new Date().toLocaleTimeString('ru-RU')}.`;
}
let overviewBusy=false;
async function refreshOverview(){
 if(overviewBusy||!session||document.visibilityState==='hidden'||$('workspace').classList.contains?.('hidden'))return;overviewBusy=true;const epoch=sessionEpoch;
 try{const data=await request('/rest/v1/rpc/store_analytics_summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:1})});if(epoch===sessionEpoch){updateOverview(data);loadProductWishlistCounts()}}
 catch{if(epoch===sessionEpoch){clearOverview();$('overviewStatus').textContent='Статистика временно недоступна.'}}
 finally{overviewBusy=false}
}
window.setInterval?.(refreshOverview,60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshOverview()});

$('adminHome').onclick=()=>{if(session)selectView('home')};
// Counts are additions during the stated period, not a current wishlist inventory.
let productWishlistCounts=null,productWishlistBusy=false,productWishlistLoadedAt=0;
function productWishlistLabel(id){const value=productWishlistCounts===null?'—':String(Math.max(0,Number(productWishlistCounts[String(id)])||0));return `${value} в вишлист`}
function updateProductWishlistLabels(){document.querySelectorAll('[data-product-wishlist]').forEach(el=>el.textContent=productWishlistLabel(el.dataset.productWishlist))}
async function loadProductWishlistCounts(){
 if(!session||productWishlistBusy||Date.now()-productWishlistLoadedAt<60000)return;productWishlistBusy=true;const epoch=sessionEpoch;
 try{const result=await request('/rest/v1/rpc/store_product_wishlist_counts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:30})});if(epoch!==sessionEpoch)return;
  if(!result?.counts||typeof result.counts!=='object'||Array.isArray(result.counts))throw Error();productWishlistCounts=result.counts;productWishlistLoadedAt=Date.now();updateProductWishlistLabels();$('productWishlistStatus').textContent='♡ Добавления в вишлист за 30 дней.';
 }catch{if(epoch===sessionEpoch){productWishlistCounts=null;updateProductWishlistLabels();$('productWishlistStatus').textContent='Статистика вишлиста временно недоступна. Откройте список ещё раз, чтобы повторить.'}}
 finally{productWishlistBusy=false}
}
function catalogueDisplayName(p){
  const name=String(p?.name||'').trim();
  const brand=String(p?.brand||'').trim();
  const aliases={hermes:['Hermès','Hermes','Эрмес','Гермес'],loropiana:['Loro Piana','Лоро Пиана'],chanel:['Chanel','Шанель'],gucci:['Gucci','Гуччи']};
  const key=brand.normalize('NFD').replace(/[\u0300-\u036f\s]/g,'').toLowerCase();
  let result=name;
  for(const label of [brand,...(aliases[key]||[])].filter(Boolean)){
    const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    result=result.replace(new RegExp('(^|[\\s,–—-])'+escaped+'(?=$|[\\s,–—-])','gi'),(match,prefix,offset,full)=>{
      // Keep brand names that belong to a model or a collaboration.
      if(/\bde\s*$/i.test(full.slice(0,offset))||/^\s*[×x]\s+/i.test(full.slice(offset+match.length)))return match;
      return prefix;
    }).trim();
  }
  return result.replace(/^[,–—-]+|[,–—-]+$/g,'').trim()||p.category||name;
}
function cataloguePrice(p){
  if(p.price==null||p.price===''||!['EUR','€'].includes(p.currency||'EUR'))return '';
  const n=window.ProductPricing.amount(p.price,p.currency);return n==null?'':'€ '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);
}
function openCataloguePreview(p,source){
 const image=source|| (safeProductImage(p.image_url)?p.image_url:null),sizes=ProductSizes.parse(p.size),order=p.fulfillment_status==='on_order',label=p.reserved?'На брони':order?'Под заказ':'В наличии';
 const name=catalogueDisplayName(p)||'Название товара';
 $('cataloguePreviewCard').innerHTML=`<article class="catalogue-preview-card"><div class="catalogue-preview-photo">${image?`<img ${AdminImages.attrs(image)} alt="${esc(p.name)}">`:'J.P'}<span class="catalogue-preview-heart" aria-hidden="true">♡</span>${adminTeamPickBadge(p)}</div><h3>${esc(p.brand||'Бренд')}</h3>${p.product_condition&&p.product_condition!=='new'?`<p>${esc(conditionLabels[p.product_condition])}</p>`:''}${p.on_commission?'<p>Комиссия</p>':''}<p>${esc(name)}</p><div class="catalogue-preview-size">${sizes.length?`${ProductSizes.variantLabel(p,sizes.length>1)}: ${esc(sizes.join(' · '))}`:'Размер уточняйте'}</div><div class="catalogue-preview-price">${adminPriceMarkup(p)}</div><div class="catalogue-preview-status">${label}</div></article>`;
 $('cataloguePreviewNote').textContent=p.available===false?'Карточка в архиве. Покупатели её не видят.':'Предпросмотр оформления. Здесь нельзя добавить товар в корзину или вишлист.';$('cataloguePreview').showModal();$('closeCataloguePreview').focus();
}
$('closeCataloguePreview').onclick=()=> $('cataloguePreview').close();
function shareAdminProduct(p){
 if(!session||busy||!p?.available)return;
 window.ProductSharing.open(p,{title:[brandsOf(p).join(' × '),catalogueDisplayName(p)||p.name].filter(Boolean).join(' — '),size:p.size,note:editorDirty?'Ссылка ведёт на сохранённую карточку. Изменения в редакторе появятся после сохранения.':''});
}
$('shareEditorProduct').onclick=()=>shareAdminProduct(original);
$('previewCatalogue').onclick=()=>{const f=$('editor').elements;openCataloguePreview({team_pick:f.team_pick?.checked===true,original_price:f.original_price?.value||null,on_commission:f.on_commission?.checked===true,product_condition:f.product_condition?.value||'new',wear_condition:f.product_condition?.value==='pre_owned'?(f.wear_condition?.value||null):null,brand:editorBrand(f),name:f.name.value,size:f.size.value,price:f.price.value||null,currency:'EUR',available:f.available.checked,reserved:f.reserved.checked,fulfillment_status:f.fulfillment_status.value},photos[0]||pendingPreviews[0]?.src)};

// Email-link credentials stay in memory until the verified identity is accepted.
// Never persist an unfinished invitation or replace another account implicitly.
function showEmailLinkProblem(message,renew=false){
 showAuthStep('emailLink');$('emailLinkTitle').textContent='Не удалось открыть ссылку';
 $('emailLinkMessage').textContent=message;$('emailLinkIdentity').textContent='';
 $('acceptEmailLink').classList.add('hidden');$('retryEmailLink').classList.toggle('hidden',renew||!emailLinkState);
 $('renewEmailLink').classList.toggle('hidden',!renew);status(message);
}
async function validateEmailLink(){
 const link=emailLinkState;if(!link||busy)return;busy=true;
 showAuthStep('emailLink');$('emailLinkTitle').textContent=link.type==='invite'?'Проверяем приглашение…':'Проверяем ссылку…';
 $('emailLinkMessage').textContent='Подтверждаем аккаунт из письма.';$('emailLinkIdentity').textContent='';
 for(const id of ['acceptEmailLink','retryEmailLink','renewEmailLink'])$(id).classList.add('hidden');status('');
 try{
  const user=link.publicSession?.user||await fetchJSON('/session/link-preview',{method:'POST',body:JSON.stringify({access_token:link.access_token})});if(emailLinkState!==link)return;
  if(!user?.id||!user.email)throw Error('Не удалось проверить аккаунт ссылки.');
  const previous=session;
  if(previous&&previous.user.id!==user.id){clearEmailLink();showEmailLinkProblem('Ссылка относится к другому аккаунту. Сначала выйдите из текущего аккаунта.');return}
  link.user=user;$('emailLinkTitle').textContent=link.type==='invite'?'Приглашение в магазин':'Восстановление доступа';
  $('emailLinkIdentity').textContent=user.email;
  $('emailLinkMessage').textContent=link.type==='invite'?'Продолжи, если это твоя почта. Создадим пароль и настроим защиту входа.':'Продолжи, если это твоя почта, чтобы установить новый пароль.';
  $('acceptEmailLink').textContent=link.type==='invite'?'Принять приглашение':'Продолжить';$('acceptEmailLink').classList.remove('hidden');
 }catch(error){if(emailLinkState===link){const expired=[400,401,403].includes(error.httpStatus);if(expired)clearEmailLink();showEmailLinkProblem(expired?'Ссылка уже использована или срок действия истёк. Получи новую ссылку на почту.':'Не удалось проверить ссылку. Проверь соединение и повтори попытку.',expired)}}
 finally{busy=false}
}
async function acceptEmailLink(){
 const link=emailLinkState;if(!link?.user||busy)return;busy=true;$('acceptEmailLink').disabled=true;status('');
 try{
  const previous=session;
  if(!link.adopted&&previous&&previous.user.id!==link.user.id)throw Error('Ссылка относится к другому аккаунту. Сначала выйдите из текущего аккаунта.');
  if(!link.adopted){recovering=true;emailFlowType=link.type;const imported=link.publicSession||await fetchJSON('/session/import',{method:'POST',body:JSON.stringify({access_token:link.access_token,refresh_token:link.refresh_token,type:link.type})});keepSession(imported,true);delete link.access_token;delete link.refresh_token;link.adopted=true}
  await enterWorkspace();clearEmailLink();
 }catch(error){if(emailLinkState===link)showEmailLinkProblem('Не удалось продолжить: '+error.message);else status(error.message)}
 finally{busy=false;$('acceptEmailLink').disabled=false}
}
$('acceptEmailLink').onclick=acceptEmailLink;
$('retryEmailLink').onclick=()=>emailLinkState?.adopted?acceptEmailLink():validateEmailLink();
$('cancelEmailLink').onclick=async()=>{if(busy)return;const adopted=emailLinkState?.adopted;clearEmailLink();if(adopted)endSession();else await restoreAdminSession();status('')};
$('renewEmailLink').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const b=e.submitter,epoch=sessionEpoch;busy=true;b.disabled=true;
 try{
  await fetchJSON('/auth/v1/recover?redirect_to='+encodeURIComponent('https://admin.juliproz.com/admin.html'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.target.email.value.trim()})});
  if(epoch!==sessionEpoch)return;$('emailLinkTitle').textContent='Проверь почту';$('emailLinkMessage').textContent='Если аккаунт существует, новая ссылка отправлена. Открой последнее письмо, чтобы завершить настройку входа.';status('');
 }catch(error){if(epoch===sessionEpoch)status(error.message)}finally{busy=false;b.disabled=false}
};
async function restoreAdminSession(){
 if(busy)return;
 clearLegacyAdminSession();
 const callback=new URLSearchParams(location.hash?.slice(1)||'');
 if(callback.has('access_token')||callback.has('refresh_token')||callback.has('error')||callback.has('error_code')||['invite','recovery'].includes(callback.get('type'))){
  if(typeof history!=='undefined')history.replaceState(null,'',location.pathname+location.search);
  clearEmailLink();
  if(callback.has('error')||callback.has('error_code')||!['invite','recovery'].includes(callback.get('type'))||!callback.get('access_token')||!callback.get('refresh_token')){
   showEmailLinkProblem('Ссылка уже использована, неполная или срок её действия истёк. Получи новую ссылку на почту.',true);return;
  }
  emailLinkState={type:callback.get('type'),access_token:callback.get('access_token'),refresh_token:callback.get('refresh_token'),expires_at:Date.now()/1000+(Number(callback.get('expires_in'))||3600)};
  await validateEmailLink();return;
 }
  // One-time upgrade: remove old plaintext credentials before contacting the server.
  try{const old=localStorage.getItem('jpAdminSession30dV1');if(old&&!legacyMigration)legacyMigration=JSON.parse(old)?.session;localStorage.removeItem('jpAdminSession30dV1')}catch{}
  busy=true;restorePending=true;status('');
  $('authArea').classList.remove('hidden');$('workspace').classList.add('hidden');$('login').classList.add('hidden');$('sessionRestore').classList.remove('hidden');
  $('sessionRestoreMessage').textContent='Проверяем сохранённую сессию.';
  $('retrySessionRestore').classList.add('hidden');$('cancelSessionRestore').classList.add('hidden');
  try{
   let restored;
   try{restored=await fetchJSON('/session')}
   catch(error){if(error.httpStatus!==401||!legacyMigration)throw error;restored=await fetchJSON('/session/import',{method:'POST',body:JSON.stringify({access_token:legacyMigration.access_token,refresh_token:legacyMigration.refresh_token})})}
   legacyMigration=null;keepSession(restored,true,readSavedAdminSession());rememberAdminSession=true;
   await enterWorkspace();restorePending=false;$('sessionRestore').classList.add('hidden');
  }catch(error){
   if([400,401,403].includes(error.httpStatus)){legacyMigration=null;endSession();status(error.httpStatus===401?'':'Не удалось восстановить вход: '+error.message)}
   else{$('sessionRestoreMessage').textContent='Не удалось загрузить админку. Вход сохранён — проверь соединение и повтори попытку.';$('retrySessionRestore').classList.remove('hidden');$('cancelSessionRestore').classList.remove('hidden');status('Не удалось восстановить вход: '+error.message)}
  }finally{busy=false}
}
$('retrySessionRestore').onclick=()=>restoreAdminSession();
$('cancelSessionRestore').onclick=()=>{if(!busy){endSession();status('')}};
window.addEventListener('online',()=>{if(restorePending&&!busy)restoreAdminSession()});
const adminSessionReady=restoreAdminSession();
$('checkPendingAccess').onclick=async()=>{if(busy||!session)return;busy=true;try{await enterWorkspace()}catch(e){status(e.message)}finally{busy=false}};

window.addEventListener('storage',e=>{if((e.key===ADMIN_SESSION_KEY||e.key===null)&&session&&rememberAdminSession){if(e.newValue===null){endSession(false);status('Вход завершён в другой вкладке.')}else{try{syncSavedAdminSession()}catch(error){status(error.message)}}}});
