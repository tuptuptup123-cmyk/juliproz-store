const {url,key}=window.STORE_CONFIG;
const $=id=>document.getElementById(id);
let session=null,items=[],editing=null,photos=[],busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('status').textContent=s}
const ADMIN_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,description,photos,revision,creation_key';
let sessionEpoch=0,refreshPromise=null,original=null,creationKey=null;
const stagedUploads=new Map();
function endSession(){session=null;sessionEpoch++;items=[];photos=[];$('workspace').classList.add('hidden');$('editor').classList.add('hidden');$('login').classList.remove('hidden');$('inventory').innerHTML='';}
async function fetchJSON(path,options={},token){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch(`${url}${path}`,{...options,signal:controller.signal,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:{ }),...options.headers}});
 const body=r.status===204?null:await r.json().catch(()=>null);
 if(!r.ok)throw Error(body?.message||body?.msg||body?.error_description||`Ошибка ${r.status}`);
 return body;
 }catch(err){if(err.name==='AbortError')throw Error('Сервер не ответил. Попробуй ещё раз.');throw err}finally{clearTimeout(timer)}
}
async function request(path,options={}){
 const publicAuth=/^\/auth\/v1\/(token|recover|verify)/.test(path);
 if(publicAuth)return fetchJSON(path,options);
 const epoch=sessionEpoch;
 if(!session)throw Error('Сессия завершена. Войди заново.');
 if(session.expires_at<Date.now()/1000+60){
  if(!refreshPromise){const current=session;refreshPromise=fetchJSON('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refresh_token})}).then(data=>{if(epoch!==sessionEpoch)throw Error('Сессия завершена.');keepSession(data)}).catch(err=>{if(epoch===sessionEpoch)endSession();throw err}).finally(()=>{refreshPromise=null});}
  await refreshPromise;
 }
 if(epoch!==sessionEpoch||!session)throw Error('Сессия завершена. Войди заново.');
 const data=await fetchJSON(path,options,session.access_token);
 if(epoch!==sessionEpoch)throw Error('Сессия завершена.');
 return data;
}
function keepSession(data){if(!data?.access_token||!data.user)throw Error('Не удалось подтвердить вход.');session={...data,expires_at:data.expires_at||Date.now()/1000+(data.expires_in||3600)}}
async function enterWorkspace(){
 const admins=await request(`/rest/v1/store_admins?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`);
 if(!admins.length){endSession();throw Error('У этого аккаунта нет доступа к управлению магазином.')}
 await load();$('login').reset();$('confirmEmail').reset();$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('workspace').classList.remove('hidden');status('');
}
$('login').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
 keepSession(await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.target.email.value.trim(),password:e.target.password.value})}));await enterWorkspace();
}catch(err){status(err.message)}finally{b.disabled=false}};
$('recover').onclick=async()=>{
 const email=$('login').email.value.trim();if(!email){status('Введи Email для восстановления пароля.');return}
 const b=$('recover');b.disabled=true;try{await request('/auth/v1/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});$('confirmEmail').classList.remove('hidden');status('Если аккаунт существует, письмо для восстановления отправлено.')}catch(err){status(err.message)}finally{b.disabled=false}
};
$('newPassword').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const password=e.target.password.value;if(password.length<12)throw Error('Пароль должен содержать минимум 12 символов.');await request('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});$('newPassword').reset();$('newPassword').classList.add('hidden');await enterWorkspace()}catch(err){status(err.message)}finally{b.disabled=false}};
$('confirmEmail').onsubmit=async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{
  const link=new URL(e.target.confirmation.value.trim());
  if(link.origin!==url||link.pathname!=='/auth/v1/verify'||!link.searchParams.get('token'))throw Error('Вставь ссылку подтверждения именно из письма Supabase.');
  const type=link.searchParams.get('type');if(!['signup','email','magiclink','recovery'].includes(type))throw Error('Неподдерживаемая ссылка подтверждения.');
  const token=link.searchParams.get('token');e.target.confirmation.value='';
  keepSession(await request('/auth/v1/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash:token,type})}));
  if(type==='recovery'){$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('newPassword').classList.remove('hidden');status('Установи новый пароль.')}else await enterWorkspace();
 }catch(err){status(err.message)}finally{b.disabled=false}
};
async function load(){const rows=[];for(let offset=0;;offset+=500){const page=await request(`/rest/v1/products?select=${ADMIN_FIELDS}&order=created_at.desc,id.desc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break}items=rows;render()}
function render(){const q=$('adminSearch').value.toLowerCase();$('inventory').innerHTML=items.filter(p=>`${p.brand} ${p.name} ${p.id}`.toLowerCase().includes(q)).map(p=>`<article>${safeProductImage(p.image_url)?`<img src="${esc(p.image_url)}" alt="">`:''}<div>${esc(p.brand)} · ${esc(p.name)}<br><small>№ ${esc(p.id)} · ${p.available?'В наличии':'Снят с наличия'}</small></div><button data-edit="${esc(p.id)}">Изменить</button><button data-toggle="${esc(p.id)}">${p.available?'Снять':'Вернуть'}</button></article>`).join('')||'<p>Товары не найдены</p>'}
$('adminSearch').oninput=render;
function edit(p){original=p?structuredClone(p):null;creationKey=crypto.randomUUID();stagedUploads.clear();editing=p?.id??null;photos=[...new Set([p?.image_url,...(Array.isArray(p?.photos)?p.photos:[])].filter(safeProductImage))];$('editor').reset();for(const field of ['brand','name','category','size','price','description'])$('editor').elements[field].value=p?.[field]??'';const currency={'€':'EUR','$':'USD','₽':'RUB','£':'GBP'}[p?.currency]||p?.currency||'EUR';$('editor').elements.currency.value=currency;$('editor').elements.available.checked=p?.available??true;$('editorTitle').textContent=editing===null?'Новый товар':`Товар № ${editing}`;$('editor').classList.remove('hidden');renderPhotos();$('editor').scrollIntoView({behavior:'smooth'})}
function renderPhotos(){$('photos').innerHTML=photos.map((x,i)=>`<div><img src="${esc(x)}" alt="Фото ${i+1}"><button type="button" data-cover="${i}">${i===0?'Обложка ✓':'Обложка'}</button><button type="button" data-remove="${i}">Убрать</button></div>`).join('')}
$('photos').onclick=e=>{if(busy)return;if(e.target.dataset.remove!==undefined)photos.splice(Number(e.target.dataset.remove),1);if(e.target.dataset.cover!==undefined){const [photo]=photos.splice(Number(e.target.dataset.cover),1);photos.unshift(photo)}renderPhotos()};
$('newProduct').onclick=()=>{if(!busy)edit(null)};
$('cancel').onclick=()=>{if(!busy)$('editor').classList.add('hidden')};
$('addUrl').onclick=()=>{if(busy)return;try{const u=new URL($('photoUrl').value);if(!safeProductImage(u.href))throw Error();photos.push(u.href);$('photoUrl').value='';renderPhotos()}catch{status('Разрешены фото магазина и его хранилища. Для других фото используй загрузку файла.')}};
const writeHeaders={'Content-Type':'application/json',Prefer:'return=representation'};
function verifiedRow(rows,id){if(!Array.isArray(rows)||rows.length!==1||(id!=null&&String(rows[0].id)!==String(id)))throw Error('Карточка изменилась или доступ закрыт. Обнови список и открой товар заново.');return rows[0]}
$('inventory').onclick=async e=>{if(busy)return;const id=e.target.dataset.edit??e.target.dataset.toggle;if(id===undefined)return;const p=items.find(x=>String(x.id)===id);if(!p)return;if(e.target.dataset.edit!==undefined){edit(p);return}busy=true;e.target.disabled=true;try{
 const row=verifiedRow(await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&revision=eq.${p.revision}&select=${ADMIN_FIELDS}`,{method:'PATCH',headers:writeHeaders,body:JSON.stringify({available:!p.available})}),id);
 if(row.available!==!p.available)throw Error('Не удалось подтвердить изменение наличия.');await load();status(p.available?'Товар снят с наличия':'Товар возвращён в каталог')
}catch(err){status(err.message)}finally{busy=false;e.target.disabled=false}};
async function preparePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, не больше 6 МБ.');
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error('Не удалось прочитать фото.')}
 try{if(bitmap.width*bitmap.height>40000000)throw Error('Фото слишком большое.');const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));if(!blob||blob.type!=='image/webp'||blob.size>6*1024*1024)throw Error('Не удалось подготовить фото.');return blob}finally{bitmap.close()}
}
async function uploadPhoto(file){
 let staged=stagedUploads.get(file);
 if(!staged){staged={path:`${session.user.id}/${crypto.randomUUID()}.webp`,blob:await preparePhoto(file),done:false,attempted:false};stagedUploads.set(file,staged)}
 const photo=`${url}/storage/v1/object/public/product-photos/${staged.path}`;
 if(!staged.done){
  if(staged.attempted){const objects=await request('/storage/v1/object/list/product-photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:session.user.id,search:staged.path.split('/')[1],limit:100})});staged.done=objects.some(o=>o.name===staged.path.split('/')[1]);}
  if(!staged.done){staged.attempted=true;await request(`/storage/v1/object/product-photos/${staged.path}`,{method:'POST',headers:{'Content-Type':'image/webp'},body:staged.blob});staged.done=true}
 }
 if(!photos.includes(photo))photos.push(photo);
}
$('editor').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=$('save');b.disabled=true;try{
 const f=e.target.elements,files=[...$('uploads').files];
 const payload={brand:f.brand.value.trim(),name:f.name.value.trim(),category:f.category.value.trim(),size:f.size.value.trim()||null,price:f.price.value===''?null:Number(f.price.value),currency:f.currency.value,description:f.description.value.trim()||null,available:f.available.checked};
 if(!payload.brand||!payload.name||!payload.category)throw Error('Заполни бренд, название и категорию.');
 if(payload.price!==null&&(!Number.isFinite(payload.price)||payload.price<0))throw Error('Проверь цену.');
 if(!['EUR','USD','AED','RUB','GBP'].includes(payload.currency))throw Error('Проверь валюту.');
 if(photos.length+files.length>20)throw Error('Максимум 20 фотографий.');
 if(!photos.length&&!files.length)throw Error('Добавь хотя бы одну фотографию.');
 if(!photos.every(safeProductImage))throw Error('Фото должно быть в магазине или его хранилище.');
 // Check identity before uploads; a lost insert response must never create a second card.
 if(editing===null){const previous=await request(`/rest/v1/products?creation_key=eq.${creationKey}&select=${ADMIN_FIELDS}`);if(previous.length){const row=verifiedRow(previous);editing=row.id;original=row}}
 for(const file of files)await uploadPhoto(file);
 $('uploads').value='';renderPhotos();payload.image_url=photos[0];payload.photos=[...photos];
 const changed=original?Object.fromEntries(Object.entries(payload).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(original[k]))):{...payload,creation_key:creationKey};
 if(!Object.keys(changed).length){$('editor').classList.add('hidden');status('Изменений нет');return}
 const path=editing===null?`/rest/v1/products?select=${ADMIN_FIELDS}`:`/rest/v1/products?id=eq.${encodeURIComponent(editing)}&revision=eq.${original.revision}&select=${ADMIN_FIELDS}`;
 const row=verifiedRow(await request(path,{method:editing===null?'POST':'PATCH',headers:writeHeaders,body:JSON.stringify(changed)}),editing);
 editing=row.id;original=row;stagedUploads.clear();$('editor').classList.add('hidden');status('Товар сохранён');await load();
}catch(err){status(err.message)}finally{busy=false;b.disabled=false}};
$('logout').onclick=async()=>{if(busy)return;try{await request('/auth/v1/logout',{method:'POST'})}catch{}endSession();$('newPassword').classList.add('hidden');$('editor').reset();$('editor').classList.add('hidden');$('workspace').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('login').classList.remove('hidden');status('Вы вышли')};


if(new URLSearchParams(location.search).get('confirm')==='1')$('confirmEmail').classList.remove('hidden');
