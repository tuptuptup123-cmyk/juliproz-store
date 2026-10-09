const {url,key}=window.STORE_CONFIG;
let adminSecurity={paused:false};
const mfaPaused=()=>adminSecurity.paused===true;
const MFA_ENROLLMENT_ENABLED=window.STORE_CONFIG.mfaEnrollmentEnabled===true;
const $=id=>document.getElementById(id);
let session=null,items=[],editing=null,photos=[],busy=false;
let adminPreferences={autoPhoto:true,reducedMotion:false};
try{const saved=JSON.parse(localStorage.getItem('jpAdminPreferences')||'{}');adminPreferences={autoPhoto:saved.autoPhoto!==false,reducedMotion:saved.reducedMotion===true}}catch{}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('status').textContent=s; if(s)$('status').scrollIntoView({block:'nearest'})}
const ADMIN_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,fulfillment_status,gender,description,photos,revision,creation_key,reserved';
let sessionEpoch=0,refreshPromise=null,original=null,creationKey=null;
const stagedUploads=new Map();
let mfaFactorId=null,mfaMode=null,mfaEnrollment=null,recovering=false;
function clearMfa(){
 mfaFactorId=null;mfaMode=null;mfaEnrollment=null;
 $('mfaPanel').classList.add('hidden');$('mfaSetup').classList.add('hidden');$('mfaChoice').classList.add('hidden');
 $('mfaVerify').reset();$('mfaQr').removeAttribute?.('src');$('mfaSecret').textContent='';$('mfaFactor').innerHTML='';
}
function endSession(){
 window.PhotoStudio?.cancel();adminSecurity={paused:false};session=null;sessionEpoch++;previewEpoch++;items=[];photos=[];editing=null;original=null;creationKey=null;recovering=false;
 stagedUploads.clear();clearMfa();$('authArea').classList.remove('hidden');pendingPreviews=[];editorDirty=false;activeView='all';$('settingsPanel').classList.add('hidden');clearOverview();$('adminHome').classList.add('hidden');$('homePanel').classList.add('hidden');$('cataloguePreview').close?.();$('cataloguePreviewCard').innerHTML='';productWishlistCounts=null;productWishlistLoadedAt=0;$('analyticsPanel').classList.add('hidden');$('analyticsCards').innerHTML='';$('analyticsProducts').innerHTML='';
 for(const id of ['editor','login','confirmEmail','newPassword'])$(id).reset();
 for(const id of ['workspace','editor','confirmEmail','newPassword'])$(id).classList.add('hidden');
 $('login').classList.remove('hidden');$('inventory').innerHTML='';$('photos').innerHTML='';$('adminSearch').value='';$('photoUrl').value='';$('uploads').value='';
}
async function fetchJSON(path,options={},token){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch(`${url}${path}`,{...options,signal:controller.signal,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:{ }),...options.headers}});
 const body=r.status===204?null:await r.json().catch(()=>null);
 if(!r.ok){const error=Error(body?.message||body?.msg||body?.error_description||`Ошибка ${r.status}`);error.httpStatus=r.status;throw error}
 return body;
 }catch(err){if(err.name==='AbortError')throw Error('Сервер не ответил. Попробуй ещё раз.');throw err}finally{clearTimeout(timer)}
}
async function request(path,options={}){
 const publicAuth=/^\/auth\/v1\/(token|recover|verify)/.test(path);
 if(publicAuth)return fetchJSON(path,options);
 const epoch=sessionEpoch;
 if(!session)throw Error('Сессия завершена. Войди заново.');
 if(session.expires_at<Date.now()/1000+60){
  if(!refreshPromise){const current=session;refreshPromise=fetchJSON('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refresh_token})}).then(data=>{if(epoch!==sessionEpoch)throw Error('Сессия завершена.');keepSession(data)}).catch(err=>{if(epoch===sessionEpoch&&[400,401,403].includes(err.httpStatus))endSession();throw err}).finally(()=>{refreshPromise=null});}
  await refreshPromise;
 }
 if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена. Войди заново.');
 let data;try{data=await fetchJSON(path,options,session.access_token)}catch(err){if(epoch===sessionEpoch&&err.httpStatus===401)endSession();throw err}
 if(epoch!==sessionEpoch)throw Error('Сессия завершена.');
 return data;
}
function keepSession(data){if(!data?.access_token||!data.user)throw Error('Не удалось подтвердить вход.');session={...data,expires_at:data.expires_at||Date.now()/1000+(data.expires_in||3600)}}
// This decoded claim controls UI only. Supabase verifies signatures and enforces RLS.
function sessionAal(){try{return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).aal||'aal1'}catch{return 'aal1'}}
async function currentAuthUser(){
 const user=await request('/auth/v1/user');
 if(!user?.id||user.id!==session?.user.id){endSession();throw Error('Не удалось проверить аккаунт. Войди заново.')}
 session.user=user;return user;
}
function showMfaChallenge(factors){
 clearMfa();mfaMode='challenge';mfaFactorId=factors[0].id;
 $('mfaFactor').innerHTML=factors.map(f=>`<option value="${esc(f.id)}">${esc(f.friendly_name||'Приложение-аутентификатор')}</option>`).join('');
 $('mfaFactor').value=mfaFactorId;$('mfaChoice').classList.toggle('hidden',factors.length<2);
 $('authArea').classList.remove('hidden');$('workspace').classList.add('hidden');$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('newPassword').classList.add('hidden');
 $('mfaInfo').textContent='Введи шестизначный код из своего приложения-аутентификатора.';$('mfaPanel').classList.remove('hidden');status('');
}
async function enableMfaProtection(){
 if(!MFA_ENROLLMENT_ENABLED)return;
 await request('/rest/v1/rpc/enforce_store_mfa',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});adminSecurity={paused:false};
}
async function enterWorkspace(){
 const admins=await request(`/rest/v1/store_admins?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`);
 if(!admins.length){endSession();throw Error('У этого аккаунта нет доступа к управлению магазином.')}
 const security=await request('/rest/v1/rpc/store_admin_security_status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});adminSecurity={paused:security?.paused===true};
 const user=await currentAuthUser(),verified=(user.factors||[]).filter(f=>f.status==='verified');
 if(verified.length&&sessionAal()!=='aal2'&&!mfaPaused()){
  const totp=verified.filter(f=>f.factor_type==='totp');
  if(!totp.length){endSession();throw Error('Для этого аккаунта нужен поддерживаемый TOTP-фактор. Обратись к владельцу проекта.')}
  $('login').reset();showMfaChallenge(totp);return;
 }
 if(!verified.length&&!mfaPaused()&&sessionAal()!=='aal2'){if(!MFA_ENROLLMENT_ENABLED)throw Error('Подключение второго фактора недоступно. Обратись к владельцу проекта.');await prepareMfaEnrollment();return}
 if(sessionAal()==='aal2'&&verified.length)await enableMfaProtection();
 clearMfa();
 if(recovering){$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('workspace').classList.add('hidden');$('newPassword').classList.remove('hidden');status('Установи новый пароль.');return}
 $('securityState').textContent=verified.length?'Вход защищён кодом из приложения.':'Подключи код из приложения, чтобы защитить управление магазином.';
 $('securityBtn').textContent=verified.length?'Добавить запасной аутентификатор':'Настроить защиту входа';
 $('securityBtn').classList.toggle('hidden',!MFA_ENROLLMENT_ENABLED);
 if(mfaPaused()){$('securityState').textContent='Двухфакторная проверка временно отключена. Подтверди код из приложения, чтобы включить её.';$('securityBtn').textContent='Включить двухфакторную проверку';}
 if(!MFA_ENROLLMENT_ENABLED&&!verified.length)$('securityState').textContent='';
 await load();$('login').reset();$('confirmEmail').reset();$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('workspace').classList.remove('hidden');$('authArea').classList.add('hidden');showInventory();selectView('home');status('');refreshOverview();loadProductWishlistCounts();
}
$('login').onsubmit=async e=>{e.preventDefault();if(busy)return;const b=e.submitter,epoch=sessionEpoch;b.disabled=true;busy=true;try{
 const data=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.target.email.value.trim(),password:e.target.password.value})});
 if(epoch!==sessionEpoch)return;keepSession(data);await enterWorkspace();
}catch(err){if(epoch===sessionEpoch||!session)status(err.message)}finally{busy=false;b.disabled=false;e.target.password.value=''}};
$('recover').onclick=async()=>{
 if(busy)return;
 const email=$('login').email.value.trim();if(!email){status('Введи Email для восстановления пароля.');return}
 const b=$('recover'),epoch=sessionEpoch;b.disabled=true;busy=true;try{await request('/auth/v1/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});if(epoch!==sessionEpoch)return;$('confirmEmail').classList.remove('hidden');status('Если аккаунт существует, письмо для восстановления отправлено.')}catch(err){if(epoch===sessionEpoch)status(err.message)}finally{busy=false;b.disabled=false}
};
$('newPassword').onsubmit=async e=>{e.preventDefault();if(busy)return;const b=e.submitter;b.disabled=true;busy=true;try{const password=e.target.password.value;if(password.length<12)throw Error('Пароль должен содержать минимум 12 символов.');await request('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});recovering=false;$('newPassword').reset();$('newPassword').classList.add('hidden');await enterWorkspace()}catch(err){status(err.message)}finally{busy=false;b.disabled=false;e.target.password.value=''}};
$('confirmEmail').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const b=e.submitter,epoch=sessionEpoch;b.disabled=true;busy=true;
 try{
  const link=new URL(e.target.confirmation.value.trim());
  if(link.origin!==url||link.pathname!=='/auth/v1/verify'||!link.searchParams.get('token'))throw Error('Вставь ссылку подтверждения именно из письма Supabase.');
  const type=link.searchParams.get('type');if(!['recovery'].includes(type))throw Error('Неподдерживаемая ссылка подтверждения.');
  const token=link.searchParams.get('token');e.target.confirmation.value='';
  const data=await request('/auth/v1/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash:token,type})});
  if(epoch!==sessionEpoch)return;keepSession(data);
  recovering=type==='recovery';await enterWorkspace();
 }catch(err){if(epoch===sessionEpoch||!session)status(err.message)}finally{busy=false;b.disabled=false}
};
async function load(){const rows=[];for(let offset=0;;offset+=500){const page=await request(`/rest/v1/products?select=${ADMIN_FIELDS}&order=created_at.desc,id.desc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break}items=rows;render()}
let activeView='all',editorDirty=false,pendingPreviews=[],previewEpoch=0;
const viewNames={all:'Все товары',in_stock:'В наличии',on_order:'Под заказ',hidden:'Скрытые товары',reserved:'На брони',analytics:'Статистика',settings:'Настройки',home:'Главная'};
function matchesView(p,view){return view==='all'||(view==='reserved'?p.reserved===true:view==='hidden'?!p.available:p.available&&!p.reserved&&(p.fulfillment_status==='on_order'?'on_order':'in_stock')===view)}
function formatPrice(p){if(p.price===null||p.price===undefined||p.price==='')return 'Цена по запросу';const c={'€':'EUR','$':'USD','£':'GBP'}[p.currency]||p.currency||'EUR';try{return new Intl.NumberFormat('ru-RU',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(p.price))}catch{return String(p.price)+' '+c}}
function render(){
 $('adminHome').classList.toggle('hidden',!session);$('adminHome').setAttribute('aria-current',activeView==='home'?'page':'false');
 $('productsMenuToggle').classList.toggle('active',!['analytics','settings','home'].includes(activeView));
 const q=$('adminSearch').value.trim().toLowerCase(),category=$('categoryFilter').value,gender=$('genderFilter').value;
 const filtered=items.filter(p=>matchesView(p,activeView)&&(!category||p.category===category)&&(!gender||p.gender===gender)&&`${p.brand} ${p.name} ${p.id} ${p.size||''}`.toLowerCase().includes(q));
 document.querySelectorAll('[data-count]').forEach(el=>el.textContent=items.filter(p=>matchesView(p,el.dataset.count)).length);
 document.querySelectorAll('[data-view]').forEach(el=>{const selected=el.dataset.view===activeView;el.classList.toggle('active',selected);if(el.classList.contains('nav-item')){if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')}});
 $('viewTitle').textContent=viewNames[activeView];$('resultCount').textContent=`Показано ${filtered.length} из ${items.length} товаров`;
 const currentCategory=$('categoryFilter').value;
 const categories=[...new Set(items.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 $('categoryFilter').innerHTML='<option value="">Все категории</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('categoryFilter').value=currentCategory;
 $('brands').innerHTML=[...new Set(items.map(p=>p.brand).filter(Boolean))].sort().map(b=>`<option value="${esc(b)}"></option>`).join('');
 $('inventory').innerHTML=filtered.map(p=>`<article><div class="product-cell">${safeProductImage(p.image_url)?`<img class="product-thumb" src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`:'<span class="product-thumb thumb-placeholder">J.P</span>'}<div class="product-title"><strong>${esc(p.brand)}</strong><p>${esc(p.name)}</p><small>№ ${esc(p.id)} · ${esc(p.category)} · ${{women:'Женское',men:'Мужское',unisex:'Унисекс'}[p.gender]||'Унисекс'}</small></div></div><div class="product-size">${esc(p.size||'Размер уточняйте')}</div><div class="product-price">${esc(formatPrice(p))}</div><div class="product-status"><span class="badge ${!p.available?'concealed':p.reserved?'reserved':p.fulfillment_status==='on_order'?'order':'stock'}">${!p.available?'Скрыт':p.reserved?'На брони':p.fulfillment_status==='on_order'?'Под заказ':'В наличии'}</span></div><div class="product-wishlist"><span aria-hidden="true">♡</span> <span data-product-wishlist="${esc(p.id)}">${productWishlistLabel(p.id)}</span></div><details class="card-actions"><summary>Управление товаром <span aria-hidden="true">⌄</span></summary><div class="row-actions"><button type="button" data-edit="${esc(p.id)}" aria-label="Изменить ${esc(p.brand)} ${esc(p.name)}">Изменить</button><button type="button" data-toggle="${esc(p.id)}" aria-label="${p.available?'Скрыть':'Показать'} ${esc(p.brand)} ${esc(p.name)}">${p.available?'Скрыть':'Показать'}</button><button type="button" data-reserve="${esc(p.id)}" class="reserve-action">${p.reserved?'Снять бронь':'Бронь'}</button><button type="button" data-delete="${esc(p.id)}" class="delete-action" aria-label="Удалить ${esc(p.brand)} ${esc(p.name)}">Удалить</button><button type="button" data-preview="${esc(p.id)}" class="preview-action">Предпросмотр в каталоге ↗</button></div></details></article>`).join('')||'<div class="empty-state"><h2>Товары не найдены</h2><p>Измените поиск или фильтры.</p></div>';
}
function showInventory(){editorDirty=false;pendingPreviews=[];previewEpoch++;$('editor').classList.add('hidden');$('homePanel').classList.add('hidden');$('analyticsPanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');$('inventoryPanel').classList.remove('hidden');if(['analytics','settings','home'].includes(activeView))activeView='all';render();}
function leaveEditor(){if(busy)return false;if(editorDirty&&!confirm('Выйти без сохранения изменений?'))return false;showInventory();return true}
function selectView(view){if(!Object.hasOwn(viewNames,view)||busy||!leaveEditor())return;activeView=view;$('homePanel').classList.toggle('hidden',view!=='home');$('analyticsPanel').classList.toggle('hidden',view!=='analytics');$('settingsPanel').classList.toggle('hidden',view!=='settings');$('inventoryPanel').classList.toggle('hidden',['analytics','settings','home'].includes(view));render();if(!['analytics','settings','home'].includes(view))setProductsExpanded(true);animateAdminPage($(view==='home'?'homePanel':view==='analytics'?'analyticsPanel':view==='settings'?'settingsPanel':'inventoryPanel'));if(view==='analytics')loadAnalytics();if(!['analytics','settings','home'].includes(view))loadProductWishlistCounts()}
$('workspace').addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(button)selectView(button.dataset.view)});
$('adminSearch').oninput=render;$('categoryFilter').onchange=render;$('genderFilter').onchange=render;
$('resetFilters').onclick=()=>{$('adminSearch').value='';$('categoryFilter').value='';$('genderFilter').value='';render()};
function updatePreview(){
 const f=$('editor').elements;
 $('previewBrand').textContent=f.brand.value.trim()||'БРЕНД';$('previewName').textContent=f.name.value.trim()||'Название товара';
 $('previewSize').textContent=f.size.value.trim()?'Размер: '+ProductSizes.parse(f.size.value).join(' / '):'Размер уточняйте';
 $('previewPrice').textContent=formatPrice({price:f.price.value,currency:f.currency.value});
 const onOrder=f.fulfillment_status.value==='on_order',visible=f.available.checked,reserved=f.reserved?.checked;
 $('previewAvailability').textContent=!visible?'Скрыт из каталога':reserved?'На брони':onOrder?'Под заказ':'В наличии';$('previewAvailability').className='badge '+(!visible?'concealed':reserved?'reserved':onOrder?'order':'stock');
 const delivery=onOrder?'10–14':'7–10';$('previewDelivery').textContent=`Доставка ${delivery} рабочих дней`;$('deliveryHint').textContent=`Доставка: ${delivery} рабочих дней.`;
 $('saveHint').textContent=visible?'После сохранения карточка будет видна покупателям.':'После сохранения карточка останется скрытой.';
 const image=photos[0]||pendingPreviews[0]?.src;
 $('previewImage').innerHTML=image?`<img src="${esc(image)}" alt="Предпросмотр товара">`:'<span>Добавьте фотографию</span>';
}
$('editor').addEventListener('input',()=>{editorDirty=true;updatePreview()});$('editor').addEventListener('change',()=>{editorDirty=true;updatePreview()});
window.addEventListener('beforeunload',e=>{if(editorDirty||busy){e.preventDefault();e.returnValue=''}});
function edit(p){window.PhotoStudio?.close();if(editorDirty&&!confirm('Открыть другую карточку без сохранения изменений?'))return;editorDirty=false;pendingPreviews=[];previewEpoch++;$('uploads').value='';$('photoUrl').value='';status('');original=p?structuredClone(p):null;creationKey=crypto.randomUUID();stagedUploads.clear();editing=p?.id??null;photos=[...new Set([p?.image_url,...(Array.isArray(p?.photos)?p.photos:[])].filter(safeProductImage))];$('editor').reset();$('autoPhotoStyle').checked=adminPreferences.autoPhoto;for(const field of ['brand','name','category','size','price','description'])$('editor').elements[field].value=p?.[field]??'';$('editor').elements.size.value=ProductSizes.parse(p?.size).join('\n');const currency={'€':'EUR','$':'USD','£':'GBP'}[p?.currency]||p?.currency||'EUR';$('editor').elements.currency.value=currency;$('editor').elements.available.checked=p?.available??true;$('editor').elements.reserved.checked=p?.reserved??false;$('editor').elements.fulfillment_status.value=p?.fulfillment_status==='on_order'?'on_order':'in_stock';$('editor').elements.gender.value=['women','men','unisex'].includes(p?.gender)?p.gender:'unisex';$('editorTitle').textContent=editing===null?'Новый товар':`Товар № ${editing}`;$('editorRef').textContent=editing===null?'СОЗДАНИЕ КАРТОЧКИ':`АРТИКУЛ ${editing}`;$('homePanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');$('analyticsPanel').classList.add('hidden');$('inventoryPanel').classList.add('hidden');$('editor').classList.remove('hidden');animateAdminPage($('editor'));renderPhotos();updatePreview();$('editor').scrollIntoView({behavior:'smooth',block:'start'});$('editor').elements.brand.focus({preventScroll:true})}
function renderPhotos(){
 $('styleExistingPhotos').disabled=busy||!photos.length;
 $('photos').innerHTML=photos.map((x,i)=>`<div class="photo-tile"><img src="${esc(x)}" alt="Фото ${i+1}"><button type="button" class="${i===0?'cover-selected':''}" data-cover="${i}">${i===0?'Обложка ✓':'Сделать обложкой'}</button><button type="button" data-remove="${i}" aria-label="Убрать фото ${i+1}">Убрать</button></div>`).join('')+pendingPreviews.map((p,i)=>`<div class="photo-tile"><img src="${esc(p.src)}" alt="${esc(p.name)}"><span class="pending-label">${photos.length===0&&i===0?'Обложка · ':''}${p.state?(p.reviewed?'Проверено ✓':'Проверьте обработку'):'Оригинал'}</span><button type="button" data-studio="${i}">${p.state?'Редактировать фото':'Оформить фото'}</button><button type="button" class="pending-photo-remove" data-pending-remove="${i}" aria-label="Убрать новое фото ${i+1}">Убрать</button></div>`).join('');updatePreview();
}
function syncPendingFiles(){const dt=new DataTransfer();pendingPreviews.forEach(p=>dt.items.add(p.file));$('uploads').files=dt.files;}
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
 if(busy)return;const epoch=++previewEpoch,files=[...$('uploads').files];editorDirty=true;
 busy=true;$('editorFields').disabled=true;$('save').disabled=true;
 try{
  if(photos.length+files.length>20)throw Error('Максимум 20 фотографий.');
  for(const file of files)if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, не больше 6 МБ.');
  const previews=[];let failures=0;
  for(let i=0;i<files.length;i++){
   if(epoch!==previewEpoch)return;
   $('photoProcessingStatus').textContent=$('autoPhotoStyle').checked?`Оформляем фото ${i+1} из ${files.length}… При первом запуске подождите загрузку редактора.`:`Подготавливаем фото ${i+1} из ${files.length}…`;
   let entry=await readPhotoFile(files[i]);
   if($('autoPhotoStyle').checked)try{entry=await PhotoStudio.process(files[i])}catch{failures++}
   previews.push(entry);
  }
  if(epoch!==previewEpoch)return;pendingPreviews=previews;syncPendingFiles();renderPhotos();status(failures?`Для ${failures} фото не удалось удалить фон — оставлены оригиналы. Нажмите «Оформить фото», чтобы повторить.`:'Фотографии подготовлены. Проверьте результат перед сохранением карточки.');
 }catch(err){if(epoch!==previewEpoch)return;$('uploads').value='';pendingPreviews=[];renderPhotos();status(err.message)}
 finally{busy=false;$('editorFields').disabled=false;$('save').disabled=false;$('photoProcessingStatus').textContent=''}
};
$('photos').onclick=e=>{if(busy)return;const b=e.target.closest('button');if(!b)return;
 if(b.dataset.studio!==undefined){stylePending(Number(b.dataset.studio));return}
 if(b.dataset.remove!==undefined)photos.splice(Number(b.dataset.remove),1);
 if(b.dataset.cover!==undefined){const [photo]=photos.splice(Number(b.dataset.cover),1);photos.unshift(photo)}
 if(b.dataset.pendingRemove!==undefined){const index=Number(b.dataset.pendingRemove),dt=new DataTransfer();[...$('uploads').files].forEach((f,i)=>{if(i!==index)dt.items.add(f)});$('uploads').files=dt.files;pendingPreviews.splice(index,1);previewEpoch++}
 editorDirty=true;renderPhotos();
};
$('newProduct').onclick=()=>{if(!busy)edit(null)};$('topNewProduct').onclick=$('newProduct').onclick;
$('cancel').onclick=leaveEditor;$('backToCatalog').onclick=leaveEditor;
$('addUrl').onclick=()=>{if(busy)return;try{const u=new URL($('photoUrl').value);if(!safeProductImage(u.href))throw Error();if(photos.length+$('uploads').files.length>=20){status('Максимум 20 фотографий.');return}if(!photos.includes(u.href))photos.push(u.href);$('photoUrl').value='';editorDirty=true;renderPhotos()}catch{status('Разрешены фото магазина и его хранилища. Для других фото используй загрузку файла.')}};
const writeHeaders={'Content-Type':'application/json',Prefer:'return=representation'};
function verifiedRow(rows,id){if(!Array.isArray(rows)||rows.length!==1||(id!=null&&String(rows[0].id)!==String(id)))throw Error('Карточка изменилась или доступ закрыт. Обнови список и открой товар заново.');return rows[0]}
$('inventory').onclick=async e=>{if(busy)return;const button=e.target.closest?.('button')||e.target;
 const id=button.dataset.preview??button.dataset.edit??button.dataset.toggle??button.dataset.reserve??button.dataset.delete;if(id===undefined)return;const p=items.find(x=>String(x.id)===id);if(!p)return;
 if(button.dataset.preview!==undefined){openCataloguePreview(p);return}
 if(button.dataset.edit!==undefined){edit(p);return}
 const deleting=button.dataset.delete!==undefined,reserving=button.dataset.reserve!==undefined;
 if(deleting&&!confirm(`Удалить «${p.brand} ${p.name}» (№ ${p.id})? Карточка будет удалена из магазина. Это действие нельзя отменить.`))return;
 busy=true;button.disabled=true;
 try{
  const change=reserving?{reserved:!p.reserved}:{available:!p.available};
  const row=verifiedRow(await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&revision=eq.${p.revision}&select=${ADMIN_FIELDS}`,{method:deleting?'DELETE':'PATCH',headers:writeHeaders,...(deleting?{}:{body:JSON.stringify(change)})}),id);
  if(!deleting&&Object.entries(change).some(([k,v])=>row[k]!==v))throw Error('Не удалось подтвердить изменение. Обновите список.');
  await load();status(deleting?'Товар удалён':reserving?(change.reserved?'Товар на брони — покупка заблокирована':p.available?'Бронь снята — товар снова можно купить':'Бронь снята. Товар остаётся скрытым'):(change.available?'Товар возвращён в каталог':'Товар скрыт из каталога'));
 }catch(err){status(err.message)}finally{busy=false;button.disabled=false}
};
async function preparePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, не больше 6 МБ.');
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error('Не удалось прочитать фото.')}
 try{if(bitmap.width*bitmap.height>40000000)throw Error('Фото слишком большое.');const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));if(!blob||blob.type!=='image/webp'||blob.size>6*1024*1024)throw Error('Не удалось подготовить фото.');return blob}finally{bitmap.close()}
}
async function uploadPhoto(file){
 const epoch=sessionEpoch,owner=session?.user.id;
 if(!owner)throw Error('Сессия завершена. Войди заново.');
 let staged=stagedUploads.get(file);
 if(!staged){const blob=await preparePhoto(file);if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена.');staged={path:`${owner}/${crypto.randomUUID()}.webp`,blob,done:false,attempted:false};stagedUploads.set(file,staged)}
 const photo=`${url}/storage/v1/object/public/product-photos/${staged.path}`;
 if(!staged.done){
  if(staged.attempted){const objects=await request('/storage/v1/object/list/product-photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:session.user.id,search:staged.path.split('/')[1],limit:100})});staged.done=objects.some(o=>o.name===staged.path.split('/')[1]);}
  if(!staged.done){staged.attempted=true;await request(`/storage/v1/object/product-photos/${staged.path}`,{method:'POST',headers:{'Content-Type':'image/webp'},body:staged.blob});staged.done=true}
 }
 return photo;
}
$('editor').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=$('save');b.disabled=true;$('editorFields').disabled=true;try{
 const f=e.target.elements,files=[...$('uploads').files];
 const payload={brand:f.brand.value.trim(),name:f.name.value.trim(),category:f.category.value.trim(),size:ProductSizes.serialize(f.size.value),price:f.price.value===''?null:Number(f.price.value),currency:f.currency.value,description:f.description.value.trim()||null,available:f.available.checked,fulfillment_status:f.fulfillment_status.value,gender:f.gender.value,reserved:f.reserved?.checked===true};
 if(!['women','men','unisex'].includes(payload.gender))throw Error('Выбери раздел товара.');
 if(!['in_stock','on_order'].includes(payload.fulfillment_status))throw Error('Выбери статус товара.');
 if(!payload.brand||!payload.name||!payload.category)throw Error('Заполни бренд, название и категорию.');
 if(payload.price!==null&&(!Number.isFinite(payload.price)||payload.price<0))throw Error('Проверь цену.');
 if(!['EUR','USD','RUB','AED','GBP'].includes(payload.currency))throw Error('Проверь валюту.');
 if(photos.length+files.length>20)throw Error('Максимум 20 фотографий.');
 if(!photos.length&&!files.length)throw Error('Добавь хотя бы одну фотографию.');
 if(pendingPreviews.some(p=>p.state&&!p.reviewed))throw Error('Проверьте каждое обработанное фото: нажмите «Редактировать фото», затем «Применить фото» или «Оставить оригинал».');
 if(!photos.every(safeProductImage))throw Error('Фото должно быть в магазине или его хранилище.');
 // Check identity before uploads; a lost insert response must never create a second card.
 if(editing===null){const previous=await request(`/rest/v1/products?creation_key=eq.${creationKey}&select=${ADMIN_FIELDS}`);if(previous.length){const row=verifiedRow(previous);editing=row.id;original=row}}
 const uploadedPhotos=[];
 for(let i=0;i<files.length;i++){status(`Загружаем фото ${i+1} из ${files.length}…`);uploadedPhotos.push(await uploadPhoto(files[i]))}
 photos=[...new Set([...photos,...uploadedPhotos])];
 $('uploads').value='';pendingPreviews=[];previewEpoch++;renderPhotos();payload.image_url=photos[0];payload.photos=[...photos];
 const changed=original?Object.fromEntries(Object.entries(payload).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(original[k]))):{...payload,creation_key:creationKey};
 if(!Object.keys(changed).length){showInventory();status('Изменений нет');return}
 const path=editing===null?`/rest/v1/products?select=${ADMIN_FIELDS}`:`/rest/v1/products?id=eq.${encodeURIComponent(editing)}&revision=eq.${original.revision}&select=${ADMIN_FIELDS}`;
 const row=verifiedRow(await request(path,{method:editing===null?'POST':'PATCH',headers:writeHeaders,body:JSON.stringify(changed)}),editing);
 editing=row.id;original=row;stagedUploads.clear();showInventory();status('Товар сохранён');await load();
}catch(err){status(err.message)}finally{busy=false;b.disabled=false;$('editorFields').disabled=false}};
async function signOut(){
 if(busy)return;if(editorDirty&&!confirm('Выйти из аккаунта без сохранения карточки?'))return;busy=true;let revoked=false;
 try{await request('/auth/v1/logout?scope=local',{method:'POST'});revoked=true}catch{}finally{endSession();busy=false}
 status(revoked?'Вы вышли':'Вы вышли на этом устройстве. Сервер не подтвердил завершение сессии.');
}
$('logout').onclick=signOut;
$('mfaCancel').onclick=async()=>{
 if(busy)return;
 busy=true;
 const pending=mfaEnrollment?.id;
 if(pending){try{await request(`/auth/v1/factors/${encodeURIComponent(pending)}`,{method:'DELETE'})}catch{}}
 busy=false;await signOut();
};
async function prepareMfaEnrollment(){
  const factor=await request('/auth/v1/factors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({factor_type:'totp',friendly_name:`JULI.PROZ ${crypto.randomUUID().slice(0,8)}`,issuer:'JULI.PROZ'})});
  if(!factor?.id||!factor.totp?.secret||!factor.totp?.qr_code)throw Error('Не удалось подготовить защиту входа.');
  clearMfa();mfaFactorId=factor.id;mfaEnrollment={id:factor.id};mfaMode='enroll';
  // SVG is rendered as an image, never inserted into the page as markup.
  const svg=factor.totp.qr_code;
  if(typeof svg==='string'&&svg.length<100000&&svg.trim().startsWith('<svg'))$('mfaQr').src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  $('mfaSecret').textContent=factor.totp.secret;
  $('mfaInfo').textContent='Добавь этот QR-код в Google Authenticator, 1Password или другое приложение-аутентификатор. Затем введи код из приложения. Сохрани доступ к нему: для отключения защиты понадобится владелец проекта.';
  $('authArea').classList.remove('hidden');$('mfaSetup').classList.remove('hidden');$('mfaPanel').classList.remove('hidden');$('workspace').classList.add('hidden');status('');
}
$('securityBtn').onclick=async()=>{
 if(!MFA_ENROLLMENT_ENABLED)return;
 if(busy)return;if(editorDirty&&!confirm('Перейти к защите входа без сохранения карточки?'))return;editorDirty=false;busy=true;const b=$('securityBtn');b.disabled=true;
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
   const response=await fetch(source[i],{signal:AbortSignal.timeout(20000),credentials:'omit',redirect:'error'});if(!response.ok)throw Error('Не удалось загрузить исходное фото.');
   const blob=await response.blob();if(blob.size>6*1024*1024)throw Error('Фото больше 6 МБ.');
   const file=new File([blob],`product-${editing??'new'}-${i+1}.${blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'}`,{type:blob.type});
   prepared.push(await PhotoStudio.process(file));if(epoch!==previewEpoch)return;
  }
  photos=[];pendingPreviews=[...prepared,...pendingPreviews];syncPendingFiles();editorDirty=true;renderPhotos();status('Фото оформлены. Проверьте каждое в редакторе перед сохранением.');
 }catch(e){if(epoch===previewEpoch)status(`${e.message} Исходные фото сохранены — попробуйте ещё раз.`)}
 finally{busy=false;$('editorFields').disabled=false;$('save').disabled=false;$('photoProcessingStatus').textContent='';renderPhotos()}
};
let analyticsBusy=false;
async function loadAnalytics(){
 if(analyticsBusy||!session)return;analyticsBusy=true;const epoch=sessionEpoch;$('analyticsDays').disabled=true;$('refreshAnalytics').disabled=true;$('analyticsStatus').textContent='Загружаем статистику…';
 try{const data=await request('/rest/v1/rpc/store_analytics_summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:Number($('analyticsDays').value)})});if(epoch!==sessionEpoch)return;
  updateOverview(data,Number($('analyticsDays').value)===7);
  const labels={active:'Сейчас в магазине',visitors:'Посетители',sessions:'Посещения',product_view:'Просмотры товаров',wishlist_add:'Добавили в вишлист',wishlist_remove:'Убрали из вишлиста',cart_add:'Добавили в корзину',cart_remove:'Убрали из корзины',checkout_open:'Оформить через менеджера',manager_open:'Написать менеджеру'};
  $('analyticsCards').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="stat"><span>${label}</span><strong>${Number(data[key])||0}</strong></div>`).join('');
  $('analyticsProducts').innerHTML=(data.products||[]).map(p=>`<div class="analytics-product"><span>${esc(p.brand)} ${esc(p.name)} <small>№ ${esc(p.id)}</small></span><span>${Number(p.views)||0} просмотров · ${Number(p.wishlist)||0} вишлист · ${Number(p.cart)||0} корзина</span></div>`).join('')||'<p class="muted">Пока нет событий за этот период.</p>';
  $('analyticsStatus').textContent=`Обновлено ${new Date().toLocaleTimeString('ru-RU')}. Добавления и удаления — количество действий за период.`;
 }catch(e){if(epoch===sessionEpoch)$('analyticsStatus').textContent='Не удалось получить статистику. Попробуйте обновить.'}
 finally{analyticsBusy=false;$('analyticsDays').disabled=false;$('refreshAnalytics').disabled=false}
}
$('refreshAnalytics').onclick=loadAnalytics;$('analyticsDays').onchange=loadAnalytics;

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
function setProductsExpanded(expanded){
 $('productsMenuToggle').setAttribute('aria-expanded',String(expanded));$('productNavigation').classList.toggle('is-collapsed',!expanded);$('productNavigation').inert=!expanded;
}
$('productsMenuToggle').onclick=()=>setProductsExpanded($('productsMenuToggle').getAttribute('aria-expanded')!=='true');
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
 try{const data=await request('/rest/v1/rpc/store_analytics_summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:7})});if(epoch===sessionEpoch){updateOverview(data);loadProductWishlistCounts()}}
 catch{if(epoch===sessionEpoch){clearOverview();$('overviewStatus').textContent='Статистика временно недоступна.'}}
 finally{overviewBusy=false}
}
window.setInterval?.(refreshOverview,60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshOverview()});

$('adminHome').onclick=()=>{if(session)selectView('home')};
// Counts are additions during the stated period, not a current wishlist inventory.
let productWishlistCounts=null,productWishlistBusy=false,productWishlistLoadedAt=0;
function productWishlistLabel(id){const value=productWishlistCounts===null?'—':String(Math.max(0,Number(productWishlistCounts[String(id)])||0));return `${value} добавлений в вишлист · 30 дней`}
function updateProductWishlistLabels(){document.querySelectorAll('[data-product-wishlist]').forEach(el=>el.textContent=productWishlistLabel(el.dataset.productWishlist))}
async function loadProductWishlistCounts(){
 if(!session||productWishlistBusy||Date.now()-productWishlistLoadedAt<60000)return;productWishlistBusy=true;const epoch=sessionEpoch;
 try{const result=await request('/rest/v1/rpc/store_product_wishlist_counts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:30})});if(epoch!==sessionEpoch)return;
  if(!result?.counts||typeof result.counts!=='object'||Array.isArray(result.counts))throw Error();productWishlistCounts=result.counts;productWishlistLoadedAt=Date.now();updateProductWishlistLabels();$('productWishlistStatus').textContent='Добавления в вишлист по товарам — за последние 30 дней. Сбор начался после подключения статистики.';
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
    result=result.replace(new RegExp('(^|[\\s,–—-])'+escaped+'(?=$|[\\s,–—-])','gi'),'$1').trim();
  }
  return result.replace(/^[,–—-]+|[,–—-]+$/g,'').trim()||p.category||name;
}
function cataloguePrice(p){
  if(p.price===null||p.price===undefined||p.price==="") return "";
  const symbols={EUR:"€",USD:"$",GBP:"£",AED:"AED"};
  const cur=({"€":"EUR","$":"USD","£":"GBP"}[p.currency]||p.currency||"").toUpperCase();
  const n=Number(p.price);
  const amount=Number.isFinite(n)?new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n):p.price;
  return symbols[cur]?`${symbols[cur]} ${amount}`:`${amount}${cur?` ${cur}`:""}`;
}
function openCataloguePreview(p,source){
 const image=source|| (safeProductImage(p.image_url)?p.image_url:null),sizes=ProductSizes.parse(p.size),order=p.fulfillment_status==='on_order',label=p.reserved?'На брони':order?'Под заказ':'В наличии';
 const name=catalogueDisplayName(p)||'Название товара';
 $('cataloguePreviewCard').innerHTML=`<article class="catalogue-preview-card"><div class="catalogue-preview-photo">${image?`<img src="${esc(image)}" alt="${esc(p.name)}">`:'J.P'}<span class="catalogue-preview-heart" aria-hidden="true">♡</span></div><h3>${esc(p.brand||'Бренд')}</h3><p>${esc(name)}</p><div class="catalogue-preview-size">${sizes.length?`${sizes.length>1?'Размеры':'Размер'}: ${esc(sizes.join(' · '))}`:'Размер уточняйте'}</div><div class="catalogue-preview-price">${esc(cataloguePrice(p))}</div><div class="catalogue-preview-status">${label}</div></article>`;
 $('cataloguePreviewNote').textContent=p.available===false?'Карточка скрыта. Так она будет выглядеть после публикации.':'Предпросмотр оформления. Здесь нельзя добавить товар в корзину или вишлист.';$('cataloguePreview').showModal();$('closeCataloguePreview').focus();
}
$('closeCataloguePreview').onclick=()=> $('cataloguePreview').close();
$('previewCatalogue').onclick=()=>{const f=$('editor').elements;openCataloguePreview({brand:f.brand.value,name:f.name.value,size:f.size.value,price:f.price.value||null,currency:f.currency.value,available:f.available.checked,reserved:f.reserved.checked,fulfillment_status:f.fulfillment_status.value},photos[0]||pendingPreviews[0]?.src)};
