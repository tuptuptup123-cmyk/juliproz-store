const SUPABASE_URL=window.STORE_CONFIG.url;
const SUPABASE_KEY=window.STORE_CONFIG.key;

let products=[];
let selectedProduct=null;
let selectedSize=null;
const sizesOf=p=>ProductSizes.parse(p?.size);
const onOrder=p=>p?.fulfillment_status==='on_order';
const availabilityLabel=p=>onOrder(p)?'Под заказ':'В наличии';
const deliveryLabel=p=>onOrder(p)?'10–14 рабочих дней':'7–10 рабочих дней';
const statusLabels={in_stock:'В наличии',on_order:'Под заказ'};
function productLink(p){return `https://t.me/JuliProzBot/shop?startapp=p_${encodeURIComponent(String(p.id))}`}
const CATALOG_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,fulfillment_status,gender,description,photos';
function photosOf(p){return [...new Set([p.image_url,p.image,...(Array.isArray(p.photos)?p.photos:[])].filter(safeProductImage))]}
function telegramLink(url){if(window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);else window.open(url,"_blank","noopener")}

let state={gender:null,fulfillment_status:null,category:null,brand:null,size:null,search:"",favorites:new Set((()=>{try{return JSON.parse(localStorage.getItem("jpFav")||"[]").map(String)}catch{return []}})()),tab:"catalog"};
const grid=document.getElementById("grid"),count=document.getElementById("count"),sheet=document.getElementById("sheet"),options=document.getElementById("sheetOptions");
let currentFilter=null,tempValue=null;

function money(p){
  if(p.price===null||p.price===undefined||p.price==="") return "";
  const symbols={EUR:"€",USD:"$",GBP:"£",AED:"AED"};
  const cur=({"€":"EUR","$":"USD","£":"GBP"}[p.currency]||p.currency||"").toUpperCase();
  const n=Number(p.price);
  const amount=Number.isFinite(n)?new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n):p.price;
  return symbols[cur]?`${symbols[cur]} ${amount}`:`${amount}${cur?` ${cur}`:""}`;
}
function imageOf(p){return photosOf(p)[0]||""}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function matchesGender(p){return !state.gender||p.gender===state.gender||p.gender==='unisex'||!p.gender}
function matchesContext(p,except){
  return matchesGender(p)&&(!state.fulfillment_status||p.fulfillment_status===state.fulfillment_status)&&(except==='category'||!state.category||p.category===state.category)&&(except==='brand'||!state.brand||p.brand===state.brand)&&(except==='size'||!state.size||sizesOf(p).includes(state.size));
}
function valuesFor(type){
  if(type==='fulfillment_status')return ['Все','in_stock','on_order'];
  // Offer categories within the audience, then brands and sizes within the category.
  const scope=products.filter(p=>matchesGender(p)&&(!state.fulfillment_status||p.fulfillment_status===state.fulfillment_status)&&(type==='category'||!state.category||p.category===state.category)&&(type!=='size'||!state.brand||p.brand===state.brand));
  return ["Все",...Array.from(new Set(scope.flatMap(p=>type==='size'?sizesOf(p):[p[type]]).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),"ru"))];
}
function reconcileFilters(){
  if(state.category&&!valuesFor('category').includes(state.category))state.category=null;
  if(state.brand&&!valuesFor('brand').includes(state.brand))state.brand=null;
  if(state.size&&!valuesFor('size').includes(state.size))state.size=null;
}
function filtered(){
  return products.filter(p=>(state.tab!=="favorites"||state.favorites.has(String(p.id)))&&matchesContext(p)&&(`${p.brand||""} ${p.name||""} ${p.id} ${p.size||""}`.toLowerCase().includes(state.search.toLowerCase())))
}
function render(){
  reconcileFilters();
  renderCatalogMenu();
  document.querySelectorAll("[data-gender]").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.gender||null)===state.gender)));
  document.querySelectorAll("[data-filter]").forEach(b=>{const type=b.dataset.filter;b.textContent=(type==='fulfillment_status'?statusLabels[state[type]]:state[type])||{fulfillment_status:"Наличие",category:"Категория",brand:"Бренд",size:"Размер"}[type];b.classList.toggle("selected",!!state[type])});
  const list=filtered();
  count.textContent=state.tab==="favorites"?`Избранное · ${list.length}`:`В каталоге ${list.length} ${list.length===1?"товар":list.length>=2&&list.length<=4?"товара":"товаров"}`;
  grid.innerHTML=list.length?list.map(p=>`<article class="product" tabindex="0" role="button" data-id="${esc(p.id)}"><div class="photo">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}" loading="lazy">`:"JP"}<button class="heart ${state.favorites.has(String(p.id))?"is-favorite":""}" aria-label="Избранное" aria-pressed="${state.favorites.has(String(p.id))}" data-heart="${esc(p.id)}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button></div><h3>${esc(p.brand)}</h3><p>${esc(p.name)}${sizesOf(p).length>1?` · ${sizesOf(p).length} размера`:""}</p><div class="price">${esc(money(p))}</div><div class="catalog-status ${onOrder(p)?"on-order":""}">${availabilityLabel(p)}</div></article>`).join(""):`<div class="empty">Здесь пока ничего нет</div>`;
}
let menuOpenGroup='category';
const menuLabels={category:'Категория',size:'Размер',brand:'Бренд',fulfillment_status:'Наличие'};
function renderCatalogMenu(){
  const labels=[state.gender?({men:'Мужское',women:'Женское'}[state.gender]):null,state.category,state.brand,state.size,state.fulfillment_status?statusLabels[state.fulfillment_status]:null].filter(Boolean);
  const badge=document.getElementById('menuBadge');badge.textContent=String(labels.length);badge.classList.toggle('hidden',!labels.length);
  const summary=document.getElementById('filterSummary');summary.textContent=labels.join(' · ');summary.classList.toggle('hidden',!labels.length);
  document.getElementById('showMenuProducts').textContent=`Показать товары · ${filtered().length}`;
  document.getElementById('menuGroups').innerHTML=Object.entries(menuLabels).map(([type,label])=>{
    const expanded=menuOpenGroup===type;
    const chosen=type==='fulfillment_status'?statusLabels[state[type]]:state[type];
    const choices=type==='size'&&!state.category?'<p class="menu-hint">Сначала выберите категорию — покажем только подходящие размеры.</p>':valuesFor(type).map(v=>`<button type="button" class="menu-choice" data-menu-type="${type}" data-menu-value="${esc(v)}" aria-pressed="${(state[type]===v||(!state[type]&&v==='Все'))}">${esc(type==='fulfillment_status'?(statusLabels[v]||v):v)}</button>`).join('');
    return `<section class="menu-group"><button type="button" class="menu-group-toggle" data-menu-group="${type}" aria-expanded="${expanded}" aria-controls="menuChoices-${type}"><span>${label}<small>${esc(chosen||'Все')}</small></span><span class="menu-chevron" aria-hidden="true">${expanded?'−':'+'}</span></button><div id="menuChoices-${type}" class="menu-choices ${expanded?'':'hidden'}">${choices}</div></section>`;
  }).join('');
}
function setCatalogMenu(open){
  document.getElementById('catalogMenu').classList.toggle('hidden',!open);
  document.getElementById('openCatalogMenu').setAttribute('aria-expanded',String(open));
  if(document.body?.style)document.body.style.overflow=open?'hidden':'';
  document.querySelector('main')?.toggleAttribute?.('inert',open);
  document.querySelector('.bottom-nav')?.toggleAttribute?.('inert',open);
  if(open){renderCatalogMenu();document.getElementById('closeCatalogMenu').focus?.()}
  else document.getElementById('openCatalogMenu').focus?.();
}
document.getElementById('openCatalogMenu').onclick=()=>setCatalogMenu(true);
['closeCatalogMenu','menuBackdrop','showMenuProducts'].forEach(id=>document.getElementById(id).onclick=()=>setCatalogMenu(false));
document.getElementById('resetMenu').onclick=()=>{document.getElementById('reset').onclick();menuOpenGroup='category';renderCatalogMenu()};
document.getElementById('menuGroups').onclick=e=>{
  const group=e.target.closest('[data-menu-group]');
  if(group){menuOpenGroup=menuOpenGroup===group.dataset.menuGroup?null:group.dataset.menuGroup;renderCatalogMenu();document.querySelector(`[data-menu-group="${group.dataset.menuGroup}"]`)?.focus?.();return}
  const option=e.target.closest('[data-menu-type]');if(!option)return;
  const type=option.dataset.menuType,value=option.dataset.menuValue;
  state[type]=value==='Все'?null:value;
  if(type==='category'){state.brand=null;state.size=null;menuOpenGroup=state.category?'size':'category'}
  render();
  document.querySelector(`[data-menu-group="${menuOpenGroup}"]`)?.focus?.();
};
document.addEventListener('keydown',e=>{
  const menu=document.getElementById('catalogMenu');if(menu.classList.contains('hidden'))return;
  if(e.key==='Escape'){e.preventDefault();setCatalogMenu(false);return}
  if(e.key==='Tab'){
    const focusable=[...menu.querySelectorAll('button:not([tabindex="-1"])')].filter(b=>!b.closest('.hidden'));
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
});
let catalogLoading=false,firstLoad=true;
async function loadProducts(quiet=false){
  if(catalogLoading)return;catalogLoading=true;
  if(!quiet){
  count.textContent="Загружаем наличие…";
  grid.innerHTML='<div class="empty">Загружаем товары…</div>';
  }
  try{
    const rows=[];
    for(let offset=0;;offset+=500){
      const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&available=eq.true&order=created_at.desc,id.desc&limit=500&offset=${offset}`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});
      if(!r.ok) throw new Error(`Supabase ${r.status}`);
      const page=await r.json();
      if(!Array.isArray(page))throw new Error("Invalid catalog response");
      rows.push(...page);
      if(page.length<500)break;
    }
    products=rows;
    render();
    const params=new URLSearchParams(location.search);
    const start=window.Telegram?.WebApp?.initDataUnsafe?.start_param||params.get("tgWebAppStartParam")||params.get("startapp");
    const id=params.get("product")||(start?.startsWith("p_")?start.slice(2):null);
    if(id&&firstLoad) await openLinkedProduct(id);firstLoad=false;
  }catch(e){
    if(quiet)return;
    count.textContent="Не удалось загрузить наличие";
    grid.innerHTML='<div class="empty">Не удалось загрузить товары. <button id="retryProducts" type="button">Повторить</button></div>';
  }finally{catalogLoading=false}
}
document.querySelectorAll('[data-gender]').forEach(b=>b.onclick=()=>{state.gender=b.dataset.gender||null;reconcileFilters();render()});
document.getElementById("search").oninput=e=>{state.search=e.target.value;render()};
document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>openFilter(b.dataset.filter));
function openFilter(type){
  currentFilter=type;tempValue=state[type];
  document.getElementById("sheetTitle").textContent={fulfillment_status:"Наличие",category:"Категория",brand:"Бренд",size:"Размер"}[type];
  options.innerHTML=valuesFor(type).map(v=>`<button class="${(tempValue===v||(!tempValue&&v==="Все"))?"selected":""}" data-v="${esc(v)}">${esc(type==='fulfillment_status'?(statusLabels[v]||v):v)}</button>`).join("");
  sheet.classList.remove("hidden");
}
options.onclick=e=>{if(!e.target.dataset.v)return;tempValue=e.target.dataset.v==="Все"?null:e.target.dataset.v;[...options.children].forEach(x=>x.classList.toggle("selected",(tempValue===x.dataset.v)||(!tempValue&&x.dataset.v==="Все")))};
document.getElementById("applyFilter").onclick=()=>{state[currentFilter]=tempValue;sheet.classList.add("hidden");render()};
document.getElementById("closeSheet").onclick=()=>sheet.classList.add("hidden");
document.getElementById("reset").onclick=()=>{state.gender=state.fulfillment_status=state.category=state.brand=state.size=null;state.search="";document.getElementById("search").value="";render()};
grid.onclick=e=>{
  if(e.target.id==="retryProducts"){loadProducts();return}
  const h=e.target.closest("[data-heart]");
  if(h){e.stopPropagation();const id=String(h.dataset.heart);state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);try{localStorage.setItem("jpFav",JSON.stringify([...state.favorites]))}catch{}render();return}
  const card=e.target.closest("[data-id]");if(card)openProduct(String(card.dataset.id));
};
grid.onkeydown=e=>{if(e.target.matches("[data-id]")&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openProduct(e.target.dataset.id)}};
function openProduct(id){
  const p=products.find(x=>String(x.id)===String(id));if(!p)return;
  selectedProduct=p;
  const sizes=sizesOf(p);
  selectedSize=sizes.length===1?sizes[0]:(sizes.includes(state.size)?state.size:null);
  document.getElementById("productContent").innerHTML=`<div class="product-layout"><div class="product-gallery"><div class="hero">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}">`:"JP"}</div>${photosOf(p).length>1?`<div class="photo-picker" aria-label="Фотографии товара">${photosOf(p).map((url,i)=>`<button type="button" data-photo="${esc(url)}" aria-label="Фото ${i+1}"><img src="${esc(url)}" alt=""></button>`).join("")}</div>`:""}</div><div class="detail"><div class="product-eyebrow">${esc(p.category||"")} <span class="${onOrder(p)?"on-order":""}">${availabilityLabel(p)}</span></div><div class="brandname">${esc(p.brand)}</div><h1>${esc(p.name)}</h1><div class="detail-price">${esc(money(p))}</div>${sizes.length>1?`<fieldset class="size-selector"><legend>Выберите размер</legend><div class="size-options">${sizes.map(size=>`<button type="button" data-size="${esc(size)}" aria-pressed="${selectedSize===size}">${esc(size)}</button>`).join("")}</div><p class="size-hint" id="sizeHint" role="status">${selectedSize?`Выбран размер ${esc(selectedSize)}`:"Выберите размер перед покупкой"}</p></fieldset>`:""}<button class="primary buy" data-action="contact">${onOrder(p)?"Заказать":"Купить"}</button><p class="purchase-note">Срок доставки: ${deliveryLabel(p)}</p><p id="shareStatus" role="status"></p>${p.description?`<section class="product-description"><h2>Описание</h2><p>${esc(p.description)}</p></section>`:""}</div></div>`;
  document.getElementById("productModal").classList.remove("hidden");
  document.getElementById("productModal").scrollTop=0;
}
document.getElementById("backProduct").onclick=()=>{selectedProduct=null;selectedSize=null;document.getElementById("productModal").classList.add("hidden")};
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");render()});
async function openLinkedProduct(id){
  id=String(id);if(/^\d+$/.test(id))id=id.replace(/^0+(?=\d)/,"");
  if(products.some(p=>String(p.id)===String(id))){openProduct(id);return}
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error();
    const rows=await r.json();
    if(rows.length){products.push(rows[0]);openProduct(id);return}
  }catch{
    document.getElementById("productContent").innerHTML='<div class="empty">Не удалось загрузить товар. Попробуйте обновить страницу.</div>';
    document.getElementById("productModal").classList.remove("hidden");return;
  }
  selectedProduct=null;
  document.getElementById("productContent").innerHTML='<div class="empty">Товар скрыт из каталога или ссылка недействительна.</div>';
  document.getElementById("productModal").classList.remove("hidden");
}
async function contact(p){
  const requestedSize=p?selectedSize:null;
  if(p&&sizesOf(p).length>1&&!requestedSize){document.getElementById("sizeHint").textContent="Пожалуйста, выберите размер.";document.querySelector('[data-size]')?.focus();return}

  if(p?.id!=null){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(p.id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const rows=await r.json();if(!rows.length){document.getElementById("shareStatus").textContent="Товар больше не доступен в каталоге.";return}p=rows[0]}catch{document.getElementById("shareStatus").textContent="Не удалось проверить наличие. Попробуйте ещё раз.";return}}
  const currentSizes=sizesOf(p);
  if(requestedSize&&!currentSizes.includes(requestedSize)){document.getElementById("shareStatus").textContent="Этот размер больше недоступен. Откройте карточку заново.";loadProducts(true);return}
  if(p&&currentSizes.length>1&&!requestedSize){document.getElementById("shareStatus").textContent="Размеры изменились. Откройте карточку заново и выберите размер.";loadProducts(true);return}
  const size=requestedSize||(currentSizes.length===1?currentSizes[0]:null);
  const text=p?.id!=null?`Здравствуйте! Меня интересует ${p.brand||""} ${p.name||""}${size?`, размер ${size}`:""}.\nСтатус: ${availabilityLabel(p)}\nАртикул: ${p.id}\n${productLink(p)}`:"";
  telegramLink(`https://t.me/juliproz${text?`?text=${encodeURIComponent(text)}`:""}`);
}
document.getElementById("productContent").addEventListener("click",e=>{const sizeButton=e.target.closest('[data-size]');if(sizeButton&&selectedProduct&&sizesOf(selectedProduct).includes(sizeButton.dataset.size)){selectedSize=sizeButton.dataset.size;document.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.size===selectedSize)));document.getElementById('sizeHint').textContent=`Выбран размер ${selectedSize}`;}const action=e.target.closest("[data-action]")?.dataset.action;if(action==="contact")contact(selectedProduct);const b=e.target.closest("[data-photo]");if(b){const img=document.querySelector(".hero img");if(img){img.hidden=false;img.src=b.dataset.photo;img.parentElement.querySelector(".image-fallback")?.remove()}}});
document.getElementById("chatBtn").onclick=()=>contact();
if(window.Telegram?.WebApp){
  const tg=window.Telegram.WebApp;
  tg.ready();tg.expand();
  // Desktop clients can open the catalog across the screen.
  if(['macos','tdesktop'].includes(tg.platform)&&tg.isVersionAtLeast?.('8.0')){
    const syncFullscreen=()=>document.documentElement.classList.toggle('telegram-fullscreen',!!tg.isFullscreen);
    tg.onEvent?.('fullscreenChanged',syncFullscreen);
    syncFullscreen();
    if(!tg.isFullscreen&&typeof tg.requestFullscreen==='function'){
      try{tg.requestFullscreen()}catch{/* Older clients keep their regular window. */}
    }
  }
}
loadProducts();

// Broken or unsupported images keep the existing J.P placeholder.
document.addEventListener("error",e=>{if(e.target.tagName==="IMG"&&e.target.closest(".photo,.hero")){const parent=e.target.parentElement;e.target.hidden=true;if(!parent.querySelector('.image-fallback')){const placeholder=document.createElement('span');placeholder.className='image-fallback';placeholder.textContent='J.P';parent.appendChild(placeholder)}}},true);
document.addEventListener('load',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.photo,.hero')){e.target.hidden=false;e.target.parentElement.querySelector('.image-fallback')?.remove()}},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadProducts(true)});
window.addEventListener?.('focus',()=>loadProducts(true));

// Horizontal photo swipes leave vertical page scrolling to the browser.
function enablePhotoSwipes(root, selector, productFor){
  let gesture=null;
  root.addEventListener('touchstart',e=>{
    const area=e.target.closest(selector);
    if(!area||e.target.closest('button')||e.touches.length!==1){gesture=null;return}
    const p=productFor(area), photos=p?photosOf(p):[];
    if(photos.length<2)return;
    const t=e.touches[0];gesture={area,photos,x:t.clientX,y:t.clientY,dx:0,dy:0};
  },{passive:true});
  root.addEventListener('touchmove',e=>{
    if(!gesture)return;
    if(e.touches.length!==1){gesture=null;return}
    gesture.dx=e.touches[0].clientX-gesture.x;gesture.dy=e.touches[0].clientY-gesture.y;
    if(Math.abs(gesture.dy)>Math.abs(gesture.dx)&&Math.abs(gesture.dy)>10){gesture=null;return}
    if(Math.abs(gesture.dx)>10&&e.cancelable)e.preventDefault();
  },{passive:false});
  root.addEventListener('touchend',()=>{
    const g=gesture;gesture=null;
    if(!g||Math.abs(g.dx)<35||Math.abs(g.dx)<=Math.abs(g.dy))return;
    const img=g.area.querySelector('img');if(!img)return;
    const index=Math.max(0,g.photos.indexOf(img.getAttribute('src')));
    img.hidden=false;
    img.src=g.photos[(index+(g.dx<0?1:-1)+g.photos.length)%g.photos.length];
    g.area.dataset.swipedAt=String(Date.now());
  },{passive:true});
  root.addEventListener('touchcancel',()=>{gesture=null},{passive:true});
  root.addEventListener('click',e=>{
    const area=e.target.closest(selector);
    if(area&&!e.target.closest('button')&&Date.now()-Number(area.dataset.swipedAt||0)<500){e.preventDefault();e.stopImmediatePropagation()}
  },true);
}
enablePhotoSwipes(grid,'.photo',area=>products.find(p=>String(p.id)===area.closest('[data-id]').dataset.id));
enablePhotoSwipes(document.getElementById('productContent'),'.hero',()=>selectedProduct);
