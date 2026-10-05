const {url,key}=window.STORE_CONFIG;
const $=id=>document.getElementById(id);
let session=null,items=[],editing=null,photos=[],busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('status').textContent=s}
async function request(path,options={}){
  if(session&&session.expires_at<Date.now()/1000+60){
    const r=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
    if(!r.ok){session=null;throw Error('Сессия завершена. Войди заново.')}
    keepSession(await r.json());
  }
  const r=await fetch(`${url}${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${session?.access_token||key}`,...options.headers}});
  if(!r.ok){const body=await r.json().catch(()=>({}));throw Error(body.message||body.msg||body.error_description||`Ошибка ${r.status}`)}
  return r.status===204?null:r.json();
}
function keepSession(data){session={...data,expires_at:data.expires_at||Date.now()/1000+(data.expires_in||3600)}}
async function enterWorkspace(){
 const admins=await request(`/rest/v1/store_admins?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`);
 if(!admins.length){session=null;throw Error('У этого аккаунта нет доступа к управлению магазином.')}
 await load();$('login').reset();$('confirmEmail').reset();$('login').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('workspace').classList.remove('hidden');status('');
}
$('login').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
 keepSession(await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.target.email.value.trim(),password:e.target.password.value})}));await enterWorkspace();
}catch(err){status(err.message)}finally{b.disabled=false}};
$('signup').onclick=async()=>{
 const f=$('login');if(!f.reportValidity())return;
 if(f.password.value.length<8){status('Придумай пароль минимум из 8 символов.');return}
 const b=$('signup');b.disabled=true;
 try{
  const data=await request('/auth/v1/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value.trim(),password:f.password.value})});
  f.password.value='';
  if(data.access_token){keepSession(data);await enterWorkspace();return}
  $('confirmEmail').classList.remove('hidden');status('Письмо отправлено. Подтверди почту, чтобы открыть админку.');
 }catch(err){status(err.message)}finally{b.disabled=false}
};
$('confirmEmail').onsubmit=async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{
  const link=new URL(e.target.confirmation.value.trim());
  if(link.origin!==url||link.pathname!=='/auth/v1/verify'||!link.searchParams.get('token'))throw Error('Вставь ссылку подтверждения именно из письма Supabase.');
  const type=link.searchParams.get('type');if(!['signup','email','magiclink','recovery'].includes(type))throw Error('Неподдерживаемая ссылка подтверждения.');
  const token=link.searchParams.get('token');e.target.confirmation.value='';
  keepSession(await request('/auth/v1/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash:token,type})}));
  await enterWorkspace();
 }catch(err){status(err.message)}finally{b.disabled=false}
};
async function load(){const rows=[];for(let offset=0;;offset+=500){const page=await request(`/rest/v1/products?select=*&order=created_at.desc,id.desc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break}items=rows;render()}
function render(){const q=$('adminSearch').value.toLowerCase();$('inventory').innerHTML=items.filter(p=>`${p.brand} ${p.name} ${p.id}`.toLowerCase().includes(q)).map(p=>`<article>${/^https?:\/\//.test(p.image_url||'')?`<img src="${esc(p.image_url)}" alt="">`:''}<div>${esc(p.brand)} · ${esc(p.name)}<br><small>№ ${esc(p.id)} · ${p.available?'В наличии':'Снят с наличия'}</small></div><button data-edit="${esc(p.id)}">Изменить</button><button data-toggle="${esc(p.id)}">${p.available?'Снять':'Вернуть'}</button></article>`).join('')||'<p>Товары не найдены</p>'}
$('adminSearch').oninput=render;
function edit(p){editing=p?.id??null;photos=[...new Set([p?.image_url,...(Array.isArray(p?.photos)?p.photos:[])].filter(x=>/^https?:\/\//.test(x||'')))];$('editor').reset();for(const field of ['brand','name','category','size','price','description'])$('editor').elements[field].value=p?.[field]??'';const currency={'€':'EUR','$':'USD','₽':'RUB','£':'GBP'}[p?.currency]||p?.currency||'EUR';$('editor').elements.currency.value=currency;$('editor').elements.available.checked=p?.available??true;$('editorTitle').textContent=editing===null?'Новый товар':`Товар № ${editing}`;$('editor').classList.remove('hidden');renderPhotos();$('editor').scrollIntoView({behavior:'smooth'})}
function renderPhotos(){$('photos').innerHTML=photos.map((x,i)=>`<div><img src="${esc(x)}" alt="Фото ${i+1}"><button type="button" data-cover="${i}">${i===0?'Обложка ✓':'Обложка'}</button><button type="button" data-remove="${i}">Убрать</button></div>`).join('')}
$('photos').onclick=e=>{if(busy)return;if(e.target.dataset.remove!==undefined)photos.splice(Number(e.target.dataset.remove),1);if(e.target.dataset.cover!==undefined){const [photo]=photos.splice(Number(e.target.dataset.cover),1);photos.unshift(photo)}renderPhotos()};
$('newProduct').onclick=()=>{if(!busy)edit(null)};
$('cancel').onclick=()=>{if(!busy)$('editor').classList.add('hidden')};
$('addUrl').onclick=()=>{if(busy)return;try{const u=new URL($('photoUrl').value);if(!['https:','http:'].includes(u.protocol))throw Error();photos.push(u.href);$('photoUrl').value='';renderPhotos()}catch{status('Укажи полную ссылку на изображение: https://...')}};
$('inventory').onclick=async e=>{if(busy)return;const id=e.target.dataset.edit??e.target.dataset.toggle;if(id===undefined)return;const p=items.find(x=>String(x.id)===id);if(e.target.dataset.edit!==undefined){edit(p);return}busy=true;e.target.disabled=true;try{await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({available:!p.available})});await load();status(p.available?'Товар снят с наличия':'Товар возвращён в каталог')}catch(err){status(err.message)}finally{busy=false;e.target.disabled=false}};
$('editor').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=$('save');b.disabled=true;try{
  const files=[...$('uploads').files];for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, не больше 6 МБ.')}
  for(const file of files){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=`${session.user.id}/${crypto.randomUUID()}.${ext}`;await request(`/storage/v1/object/product-photos/${path}`,{method:'POST',headers:{'Content-Type':file.type},body:file});photos.push(`${url}/storage/v1/object/public/product-photos/${path}`)}
  $('uploads').value='';renderPhotos();if(!photos.length)throw Error('Добавь хотя бы одну фотографию.');const f=e.target.elements;const payload={brand:f.brand.value.trim(),name:f.name.value.trim(),category:f.category.value.trim(),size:f.size.value.trim()||null,price:f.price.value===''?null:Number(f.price.value),currency:f.currency.value,description:f.description.value.trim()||null,available:f.available.checked,image_url:photos[0],photos};if(!payload.brand||!payload.name||!payload.category)throw Error('Заполни бренд, название и категорию.');const saved=await request(`/rest/v1/products${editing===null?'':`?id=eq.${encodeURIComponent(editing)}`}`,{method:editing===null?'POST':'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});if(saved?.length!==1)throw Error('Не удалось подтвердить сохранение. Обнови список товаров.');editing=saved[0].id;$('editor').classList.add('hidden');status('Товар сохранён');await load();
}catch(err){status(err.message)}finally{busy=false;b.disabled=false}};
$('logout').onclick=async()=>{if(busy)return;try{await request('/auth/v1/logout',{method:'POST'})}catch{}session=null;items=[];photos=[];$('inventory').innerHTML='';$('editor').reset();$('editor').classList.add('hidden');$('workspace').classList.add('hidden');$('confirmEmail').classList.add('hidden');$('login').classList.remove('hidden');status('Вы вышли')};
