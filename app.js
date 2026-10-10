const conditionLabels={new:'Новые вещи',pre_owned:'PRE-OWNED',vintage:'VINTAGE',commission:'Комиссия'};
const conditionOf=p=>p?.product_condition||'new';
const conditionBadge=p=>(conditionOf(p)==='new'?'':`<span class="condition-badge">${conditionLabels[conditionOf(p)]||''}</span>`)+(p.on_commission?'<span class="condition-badge commission-badge">Комиссия</span>':'');
const matchesCondition=p=>!state.product_condition||(state.product_condition==='commission'?p.on_commission===true:conditionOf(p)===state.product_condition);
function brandsOf(p){return [...new Set(String(p?.brand||'').split(/\s*×\s*/).map(v=>v.trim()).filter(Boolean))]}
const SUPABASE_URL=window.STORE_CONFIG.url;
const SUPABASE_KEY=window.STORE_CONFIG.key;

let products=[];
let selectedProduct=null;
let selectedSize=null;
let navigationRevision=0;
const sizesOf=p=>ProductSizes.parse(p?.size).filter(size=>onOrder(p)||ProductSizes.stockFor(p,size)>0);
function displayName(p){
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
const onOrder=p=>p?.fulfillment_status==='on_order';
const availabilityLabel=p=>p?.reserved?'На брони':onOrder(p)?'Под заказ':'В наличии';
const deliveryLabel=p=>onOrder(p)?'10–14 рабочих дней':'7–10 рабочих дней';
const statusLabels={in_stock:'В наличии',on_order:'Под заказ'};
function productLink(p){return `https://t.me/JuliProzBot/shop?startapp=p_${encodeURIComponent(String(p.id))}`}
const CATALOG_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,fulfillment_status,gender,description,photos,reserved,product_condition,stock_quantities,on_commission';
function photosOf(p){return [...new Set([p.image_url,p.image,...(Array.isArray(p.photos)?p.photos:[])].filter(safeProductImage))]}
const telegramOpenTimes=new Map();
function telegramLink(url){
  if(Date.now()-(telegramOpenTimes.get(url)??-Infinity)<5000)return false;
  if(window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);else window.open(url,"_blank","noopener");telegramOpenTimes.set(url,Date.now());if(telegramOpenTimes.size>50)telegramOpenTimes.delete(telegramOpenTimes.keys().next().value);return true;}

function pluralRu(n,one,few,many){const k=Math.abs(n)%100;return k>=11&&k<=14?many:k%10===1?one:k%10>=2&&k%10<=4?few:many}
let state={product_condition:null,gender:null,fulfillment_status:null,category:null,brand:null,size:null,search:"",favorites:new Set((()=>{try{return JSON.parse(localStorage.getItem("jpFav")||"[]").map(String)}catch{return []}})()),tab:"catalog"};
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
  return matchesGender(p)&&matchesCondition(p)&&(!state.fulfillment_status||p.fulfillment_status===state.fulfillment_status)&&(except==='category'||!state.category||p.category===state.category)&&(except==='brand'||!state.brand||brandsOf(p).includes(state.brand))&&(except==='size'||!state.size||sizesOf(p).includes(state.size));
}
function valuesFor(type){
  if(type==='product_condition')return ['Все','new','pre_owned','vintage','commission'];
  if(type==='fulfillment_status')return ['Все','in_stock','on_order'];
  // Offer categories within the audience, then brands and sizes within the category.
  const scope=products.filter(p=>matchesGender(p)&&matchesCondition(p)&&(!state.fulfillment_status||p.fulfillment_status===state.fulfillment_status)&&(type==='category'||!state.category||p.category===state.category)&&(type!=='size'||!state.brand||brandsOf(p).includes(state.brand)));
  return ["Все",...Array.from(new Set(scope.flatMap(p=>type==='size'?sizesOf(p):type==='brand'?brandsOf(p):[p[type]]).filter(Boolean))).sort((a,b)=>type==='size'?ProductSizes.compare(a,b):String(a).localeCompare(String(b),"ru"))];
}
function menuSizeLabel(value){
  if(value==='Все'||state.category!=='Аксессуары')return value;
  const rows=products.filter(p=>matchesGender(p)&&matchesCondition(p)&&p.category===state.category&&(!state.brand||brandsOf(p).includes(state.brand))&&(!state.fulfillment_status||p.fulfillment_status===state.fulfillment_status)&&sizesOf(p).includes(value));
  const labels=[...new Set(rows.map(p=>{
    const name=String(p.name||'').toLowerCase();
    if(/ремень/.test(name))return `Ремни: ${value} см`;
    if(/мяч/.test(name))return `Мячи: ${value}`;
    if(/кепк|шапк|панам/.test(name))return `Головные уборы: ${value}`;
    if(/косметичк/.test(name))return `Косметички: ${value}`;
    return value;
  }))];
  return labels.join(' / ')||value;
}
function reconcileFilters(){
  if(state.category&&!valuesFor('category').includes(state.category))state.category=null;
  if(state.brand&&!valuesFor('brand').includes(state.brand))state.brand=null;
  if(state.size&&!valuesFor('size').includes(state.size))state.size=null;
}
function filtered(){
  if(state.tab==="favorites")return products.filter(p=>state.favorites.has(String(p.id)));
  return products.filter(p=>matchesContext(p)&&(`${p.brand||""} ${p.name||""} ${p.id} ${p.size||""}`.toLowerCase().includes(state.search.toLowerCase())))
}
function emptyCollection(kind){
  const cartEmpty=kind==='cart';
  const symbol=cartEmpty?'<path d="M3 4h5l5 25h24l6-18H10"/><circle cx="16" cy="38" r="2.5"/><circle cx="35" cy="38" r="2.5"/>':'<path d="M40 8a11 11 0 0 0-16 0A11 11 0 0 0 8 24l16 16 16-16a11 11 0 0 0 0-16Z"/>';
  return `<div class="collection-empty ${cartEmpty?'cart-empty':'wishlist-empty'}"><div class="empty-content"><svg class="empty-symbol" width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbol}</svg><h2>${cartEmpty?'Корзина':'Ваш виш-лист пока пуст.'}</h2><p>${cartEmpty?'Ваша корзина пока пуста.':'Нажмите на сердечко у понравившегося товара.'}</p>${cartEmpty?'<button type="button" class="primary" data-cart-action="catalog">Перейти в каталог</button>':''}</div><span class="empty-signature" aria-hidden="true">J.P</span></div>`;
}
function render(){
  reconcileFilters();
  renderCatalogMenu();
  document.querySelectorAll("[data-gender]").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.gender||null)===state.gender)));
  document.querySelectorAll("[data-filter]").forEach(b=>{const type=b.dataset.filter;b.textContent=(type==='fulfillment_status'?statusLabels[state[type]]:state[type])||{fulfillment_status:"Наличие",category:"Категория",brand:"Бренд",size:"Размер"}[type];b.classList.toggle("selected",!!state[type])});
  renderCart();
  const inCart=state.tab==="cart";
  document.getElementById("cartPage").classList.toggle("hidden",!inCart);
  grid.classList.toggle("hidden",inCart);
  document.querySelector(".catalog-toolbar")?.classList.toggle("hidden",state.tab!=="catalog");
  document.querySelector(".catalog-head")?.classList.toggle("hidden",inCart);
  document.getElementById("filterSummary").classList.toggle("hidden",state.tab!=="catalog"||!document.getElementById("filterSummary").textContent);
  const list=filtered();
  count.textContent=state.tab==="favorites"?`Виш-лист · ${list.length}`:`В каталоге ${list.length} ${pluralRu(list.length,'товар','товара','товаров')}`;
  grid.innerHTML=list.length?list.map(p=>`<article class="product" data-id="${esc(p.id)}"><div class="photo">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}" loading="lazy">`:"JP"}<button class="heart ${state.favorites.has(String(p.id))?"is-favorite":""}" aria-label="Виш-лист" aria-pressed="${state.favorites.has(String(p.id))}" data-heart="${esc(p.id)}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button></div><h3><button type="button" class="product-open" aria-label="Открыть ${esc(p.brand)} ${esc(displayName(p))}">${esc(p.brand)}</button></h3><p>${esc(displayName(p))}</p>${conditionBadge(p)}<div class="card-size">${sizesOf(p).length?`${sizesOf(p).length>1?"Размеры":"Размер"}: ${esc(sizesOf(p).join(" · "))}`:"Размер уточняйте"}</div><div class="price">${esc(money(p))}</div><div class="catalog-status ${p.reserved?'is-reserved':onOrder(p)?"on-order":""}">${availabilityLabel(p)}</div><div class="card-delivery">Доставка ${deliveryLabel(p)}</div></article>`).join(""):(state.tab==="favorites"?emptyCollection('favorites'):'<div class="empty">Здесь пока ничего нет</div>');
}
let menuOpenGroup='category';
let menuCloseTimer=null;
const menuLabels={product_condition:'Раздел',category:'Категория',size:'Размер',brand:'Бренд',fulfillment_status:'Наличие'};
function renderCatalogMenu(){
  const labels=[state.product_condition?conditionLabels[state.product_condition]:null,state.gender?({men:'Мужское',women:'Женское'}[state.gender]):null,state.category,state.brand,state.size,state.fulfillment_status?statusLabels[state.fulfillment_status]:null].filter(Boolean);
  const badge=document.getElementById('menuBadge');badge.textContent=String(labels.length);badge.classList.toggle('hidden',!labels.length);
  const summary=document.getElementById('filterSummary');summary.textContent=labels.join(' · ');summary.classList.toggle('hidden',!labels.length);
  document.getElementById('showMenuProducts').textContent=`Показать товары · ${filtered().length}`;
  document.getElementById('menuGroups').innerHTML=Object.entries(menuLabels).map(([type,label])=>{
    const expanded=menuOpenGroup===type;
    const chosen=type==='product_condition'?conditionLabels[state[type]]:type==='fulfillment_status'?statusLabels[state[type]]:state[type];
    const choices=type==='size'&&!state.category?'<p class="menu-hint">Сначала выберите категорию — покажем только подходящие размеры.</p>':valuesFor(type).map(v=>`<button type="button" class="menu-choice" data-menu-type="${type}" data-menu-value="${esc(v)}" aria-pressed="${(state[type]===v||(!state[type]&&v==='Все'))}">${esc(type==='product_condition'?(conditionLabels[v]||v):type==='fulfillment_status'?(statusLabels[v]||v):type==='size'?menuSizeLabel(v):v)}</button>`).join('');
    return `<section class="menu-group"><button type="button" class="menu-group-toggle" data-menu-group="${type}" aria-expanded="${expanded}" aria-controls="menuChoices-${type}"><span>${label}<small>${esc(chosen||'Все')}</small></span><span class="menu-chevron" aria-hidden="true">+</span></button><div id="menuChoices-${type}" class="menu-accordion" ${expanded?'':'inert'}><div class="menu-choices">${choices}</div></div></section>`;
  }).join('');
}
function setCatalogMenu(open){
  const menu=document.getElementById('catalogMenu');
  if(menuCloseTimer!==null){clearTimeout(menuCloseTimer);menuCloseTimer=null}
  document.getElementById('openCatalogMenu').setAttribute('aria-expanded',String(open));
  if(open){
    menu.classList.remove('hidden','is-closing');
    if(document.body?.style)document.body.style.overflow='hidden';
    document.querySelector('main')?.toggleAttribute?.('inert',true);
    document.querySelector('.brand')?.toggleAttribute?.('inert',true);
    document.querySelector('.bottom-nav')?.toggleAttribute?.('inert',true);
    renderCatalogMenu();document.getElementById('closeCatalogMenu').focus?.();
    return;
  }
  const finish=()=>{
    menu.classList.add('hidden');menu.classList.remove('is-closing');menuCloseTimer=null;
    if(document.body?.style)document.body.style.overflow='';
    document.querySelector('main')?.toggleAttribute?.('inert',false);
    document.querySelector('.brand')?.toggleAttribute?.('inert',false);
    document.querySelector('.bottom-nav')?.toggleAttribute?.('inert',false);
    document.getElementById('openCatalogMenu').focus?.();
  };
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return}
  menu.classList.add('is-closing');menuCloseTimer=setTimeout(finish,280);
}
document.getElementById('openCatalogMenu').onclick=()=>setCatalogMenu(true);
let pawTimer=null,navPawTimer=null,moneyPawTimer=null;
function grabLogo(){
  const brand=document.querySelector('.brand');
  if(!brand||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  clearTimeout(pawTimer);brand.classList.remove('is-grabbing');void brand.offsetWidth;
  brand.classList.add('is-grabbing');
  pawTimer=setTimeout(()=>brand.classList.remove('is-grabbing'),1600);
}
document.getElementById('brandPaw').onclick=grabLogo;
setTimeout(grabLogo,1200);
function pressNavWithPaw(button){
  const paw=document.getElementById('navPaw');
  if(!paw||!button.getBoundingClientRect||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const box=button.getBoundingClientRect();
  clearTimeout(navPawTimer);paw.classList.remove('is-pressing');
  paw.style.left=`${box.left+box.width/2-15}px`;
  paw.style.top=`${box.top+20-33}px`;
  void paw.offsetWidth;paw.classList.add('is-pressing');
  navPawTimer=setTimeout(()=>paw.classList.remove('is-pressing'),850);
}
function showMoneyPaw(button){
  const paw=document.getElementById('moneyPaw');
  if(!paw||!button?.getBoundingClientRect||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const box=button.getBoundingClientRect(),width=110;
  clearTimeout(moneyPawTimer);paw.classList.remove('is-presenting');
  paw.style.left=`${Math.max(8,Math.min(innerWidth-width-8,box.left+box.width/2-width/2))}px`;
  paw.style.top=`${Math.max(8,box.top+box.height/2-width*1.5/2)}px`;
  void paw.offsetWidth;paw.classList.add('is-presenting');
  moneyPawTimer=setTimeout(()=>paw.classList.remove('is-presenting'),1050);
}
['closeCatalogMenu','menuBackdrop','showMenuProducts'].forEach(id=>document.getElementById(id).onclick=()=>setCatalogMenu(false));
document.getElementById('resetMenu').onclick=()=>{document.getElementById('reset').onclick();menuOpenGroup='category';renderCatalogMenu()};
document.getElementById('menuGroups').onclick=e=>{
  const group=e.target.closest('[data-menu-group]');
  if(group){
    menuOpenGroup=menuOpenGroup===group.dataset.menuGroup?null:group.dataset.menuGroup;
    document.querySelectorAll('[data-menu-group]').forEach(button=>{
      const expanded=button.dataset.menuGroup===menuOpenGroup;
      button.setAttribute('aria-expanded',String(expanded));
      document.getElementById(`menuChoices-${button.dataset.menuGroup}`).toggleAttribute('inert',!expanded);
    });
    return;
  }
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
    const focusable=[...menu.querySelectorAll('button:not([tabindex="-1"])')].filter(b=>!b.closest('.hidden,[inert]'));
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
});
let catalogLoading=false,firstLoad=true,lastCatalogLoadedAt=0;
async function loadProducts(quiet=false){
  if(catalogLoading)return;catalogLoading=true;const requestedNavigation=navigationRevision;
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
    const changed=JSON.stringify(products)!==JSON.stringify(rows);products=rows;lastCatalogLoadedAt=Date.now();
    if(changed||!quiet)render();
    const params=new URLSearchParams(location.search);
    const start=window.Telegram?.WebApp?.initDataUnsafe?.start_param||params.get("tgWebAppStartParam")||params.get("startapp");
    const id=params.get("product")||(start?.startsWith("p_")?start.slice(2):null);
    if(id&&firstLoad&&requestedNavigation===navigationRevision) await openLinkedProduct(id);firstLoad=false;
  }catch(e){
    if(quiet)return;
    count.textContent="Не удалось загрузить наличие";
    grid.innerHTML='<div class="empty">Не удалось загрузить товары. <button id="retryProducts" type="button">Повторить</button></div>';
  }finally{catalogLoading=false}
}
document.querySelectorAll('[data-gender]').forEach(b=>b.onclick=()=>{state.gender=b.dataset.gender||null;reconcileFilters();render()});
document.getElementById("search").oninput=e=>{state.search=e.target.value;render()};
document.getElementById('toggleSearch').onclick=()=>{
  const field=document.getElementById('catalogSearch');
  const open=field.classList.contains('hidden');
  field.classList.toggle('hidden',!open);
  document.getElementById('toggleSearch').setAttribute('aria-expanded',String(open));
  if(open)document.getElementById('search').focus?.();
  else{state.search='';document.getElementById('search').value='';render()}
};
document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>openFilter(b.dataset.filter));
function openFilter(type){
  currentFilter=type;tempValue=state[type];
  document.getElementById("sheetTitle").textContent={fulfillment_status:"Наличие",category:"Категория",brand:"Бренд",size:"Размер"}[type];
  options.innerHTML=valuesFor(type).map(v=>`<button class="${(tempValue===v||(!tempValue&&v==="Все"))?"selected":""}" data-v="${esc(v)}">${esc(type==='product_condition'?(conditionLabels[v]||v):type==='fulfillment_status'?(statusLabels[v]||v):type==='size'?menuSizeLabel(v):v)}</button>`).join("");
  sheet.classList.remove("hidden");
}
options.onclick=e=>{if(!e.target.dataset.v)return;tempValue=e.target.dataset.v==="Все"?null:e.target.dataset.v;[...options.children].forEach(x=>x.classList.toggle("selected",(tempValue===x.dataset.v)||(!tempValue&&x.dataset.v==="Все")))};
document.getElementById("applyFilter").onclick=()=>{state[currentFilter]=tempValue;sheet.classList.add("hidden");render()};
document.getElementById("closeSheet").onclick=()=>sheet.classList.add("hidden");
document.getElementById("reset").onclick=()=>{state.product_condition=state.gender=state.fulfillment_status=state.category=state.brand=state.size=null;state.search="";document.getElementById("search").value="";render()};
grid.onclick=e=>{
  if(e.target.id==="retryProducts"){loadProducts();return}
  const h=e.target.closest("[data-heart]");
  if(h){e.stopPropagation();toggleWishlist(h.dataset.heart);return}
  const card=e.target.closest("[data-id]");if(card)openProduct(String(card.dataset.id));
};
grid.onkeydown=e=>{if(e.target.matches("[data-id]")&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openProduct(e.target.dataset.id)}};
// Cart stays on this device. Checkout always rechecks the public catalogue.
function readCart(){
  try{const rows=JSON.parse(localStorage.getItem('jpCart')||'[]');if(!Array.isArray(rows))return [];const clean=[];for(const row of rows.slice(0,50)){if(!row||!/^([0-9]+|[a-f0-9-]{36})$/i.test(String(row.id))||typeof row.size!=='string'||row.size.length>100)continue;const item={id:String(row.id),size:row.size,quantity:Math.min(99,Math.max(1,Math.floor(Number(row.quantity)||1))),product:row.product&&typeof row.product==='object'?row.product:{}};const old=clean.find(x=>x.id===item.id&&x.size===item.size);if(old)old.quantity=Math.min(99,old.quantity+item.quantity);else clean.push(item)}return clean}catch{return []}
}
let cart=readCart(),checkoutBusy=false,cartRevision=0;
function cartLimit(p,size=''){return onOrder(p)?99:Math.min(99,ProductSizes.stockFor(p,size))}
function cartCount(){return cart.reduce((n,x)=>n+x.quantity,0)}
function cartProduct(row){return products.find(p=>String(p.id)===row.id)||row.product}
function cartSnapshot(p){return Object.fromEntries(['id','brand','name','category','price','currency','image_url','photos','size','fulfillment_status','reserved','stock_quantities'].map(k=>[k,p[k]]))}
function saveCart(){cartRevision++;try{localStorage.setItem('jpCart',JSON.stringify(cart))}catch{document.getElementById('cartStatus').textContent='Корзина доступна в этом сеансе. Браузер не разрешил сохранить её.'}}
function setTab(tab){
  if(state.tab!==tab)window.StoreAnalytics?.track("page_view",null,tab);
  navigationRevision++;
  state.tab=tab;selectedProduct=null;selectedSize=null;document.getElementById('productModal').classList.add('hidden');
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});render();
}
const wishlistClicks=new Map();
function toggleWishlist(id){
  if(id==null)return;id=String(id);const now=Date.now();if(now-(wishlistClicks.get(id)??-Infinity)<450)return;wishlistClicks.set(id,now);if(wishlistClicks.size>200)wishlistClicks.delete(wishlistClicks.keys().next().value);state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);
  window.StoreAnalytics?.track(state.favorites.has(id)?'wishlist_add':'wishlist_remove',id);
  try{localStorage.setItem('jpFav',JSON.stringify([...state.favorites]))}catch{}
  render();
  const heart=[...grid.querySelectorAll?.('[data-heart]')||[]].find(b=>b.dataset.heart===id);
  heart?.classList.add('motion-pop');
  document.querySelector('.detail-wishlist')?.classList.add('motion-pop');
  const button=document.querySelector('.detail-wishlist');if(button&&selectedProduct){const saved=state.favorites.has(String(selectedProduct.id));button.setAttribute('aria-pressed',String(saved));button.classList.toggle('is-saved',saved)}
}
function addToCart(){
  if(!selectedProduct)return;
  const p=products.find(x=>String(x.id)===String(selectedProduct.id));
  if(p?.reserved){document.getElementById('shareStatus').textContent='Товар на брони. Покупка станет доступна после снятия брони.';return}
  if(!p||p.available===false){document.getElementById('shareStatus').textContent='Товар больше недоступен в каталоге.';return}
  const sizes=sizesOf(p);
  if((selectedSize&&!sizes.includes(selectedSize))||(!selectedSize&&sizes.length===1)||String(p.price)!==String(selectedProduct.price)||String(p.currency)!==String(selectedProduct.currency)||p.fulfillment_status!==selectedProduct.fulfillment_status){openProduct(p.id);document.getElementById('shareStatus').textContent='Карточка изменилась. Проверьте размер, цену и наличие, затем нажмите «Купить» ещё раз.';return}
  if(sizesOf(p).length>1&&!selectedSize){document.getElementById('sizeHint').textContent='Пожалуйста, выберите размер.';document.querySelector('[data-size]')?.focus();return}
  const size=selectedSize||'';if(cartLimit(p,size)<1){document.getElementById('shareStatus').textContent='Этот размер закончился.';return}const row=cart.find(x=>x.id===String(p.id)&&x.size===size);
  if(row){document.getElementById('shareStatus').textContent=cartLimit(p,size)>1?'Товар этого размера уже в корзине. Количество можно изменить в корзине.':'Товар этого размера уже в корзине — доступна одна штука.';return}else{if(cart.length>=50){document.getElementById('shareStatus').textContent='В корзине максимум 50 позиций.';return}cart.push({id:String(p.id),size,quantity:1,product:cartSnapshot(p)})}
  window.StoreAnalytics?.track('cart_add',p.id);showMoneyPaw(document.querySelector('[data-action="add-cart"]'));saveCart();renderCart();document.querySelector('[data-action="add-cart"]')?.classList.add('motion-pop');document.getElementById('cartBadge').classList.add('motion-pop');document.getElementById('shareStatus').textContent='Товар добавлен в корзину.';
}
function cartTotals(rows=cart){
  const totals=new Map();let unknown=false;
  for(const row of rows){const p=cartProduct(row),price=Number(p.price),currency=({'€':'EUR','$':'USD','£':'GBP'}[p.currency]||String(p.currency||'').toUpperCase());if(p.price==null||p.price===''||!Number.isFinite(price)||price<0){unknown=true;continue}totals.set(currency,(totals.get(currency)||0)+Math.round(price*100)*row.quantity)}
  return {totals:[...totals].map(([currency,cents])=>({currency,price:cents/100})),unknown};
}
function renderCart(){
  let adjusted=false;for(const row of cart){const limit=cartLimit(cartProduct(row),row.size);if(limit>0&&row.quantity>limit){row.quantity=limit;adjusted=true}}if(adjusted){saveCart();document.getElementById('cartStatus').textContent='Количество обновлено в соответствии с остатком товара.'}
  document.getElementById('cartPage').classList.toggle('is-empty',!cart.length);
  const badge=document.getElementById('cartBadge');badge.textContent=String(cartCount());badge.classList.toggle('hidden',!cart.length);
  const detailCount=document.querySelector('.detail-cart-count');if(detailCount)detailCount.textContent=String(cartCount());
  if(!cart.length){document.getElementById('cartContent').innerHTML=emptyCollection('cart');return}
  const total=cartTotals();
  document.getElementById('cartContent').innerHTML=`<div class="cart-items">${cart.map((row,i)=>{const p=cartProduct(row),live=products.find(x=>String(x.id)===row.id),valid=live&&cartLimit(live,row.size)>0&&(row.size?sizesOf(live).includes(row.size):sizesOf(live).length===0);return `<article class="cart-item"><button type="button" class="cart-photo" data-cart-action="product" data-index="${i}" aria-label="Открыть ${esc(p.brand||'')} ${esc(p.name||'товар')}">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name||'')}">`:'J.P'}</button><div class="cart-item-info"><h2>${esc(p.brand||'')}</h2><button type="button" class="cart-name" data-cart-action="product" data-index="${i}">${esc(displayName(p)||'Товар')}</button><p>${row.size?`Размер: ${esc(row.size)}`:'Размер уточняйте'}</p><strong>${esc(money(p)||'Цена по запросу')}</strong><p class="cart-delivery">${valid?`${availabilityLabel(p)} · ${deliveryLabel(p)}`:'Товар или размер сейчас недоступен'}</p><div class="cart-item-controls"><div class="quantity-control" aria-label="Количество"><button type="button" data-cart-action="minus" data-index="${i}" aria-label="Уменьшить количество" ${row.quantity<=1?'disabled':''}>−</button><span>${row.quantity}</span><button type="button" data-cart-action="plus" data-index="${i}" aria-label="Увеличить количество" ${p.reserved||row.quantity>=cartLimit(p,row.size)?'disabled':''}>+</button></div><button type="button" class="cart-remove" data-cart-action="remove" data-index="${i}">Удалить</button></div></div></article>`}).join('')}</div><aside class="cart-summary"><h2>Итого</h2><p>${cartCount()} ${pluralRu(cartCount(),'вещь','вещи','вещей')}</p>${total.totals.map(t=>`<strong>${esc(money(t))}</strong>`).join('')}${total.unknown?'<p>Стоимость некоторых товаров уточнит менеджер.</p>':''}<button type="button" class="primary" data-cart-action="checkout" ${checkoutBusy?'disabled':''}>${checkoutBusy?'Проверяем наличие…':'Оформить через менеджера'}</button><p class="checkout-note">Откроется Telegram с вашим заказом. Доставку и оплату согласуем с менеджером.</p></aside>`;
}
async function checkoutCart(){
  if(checkoutBusy||!cart.length)return;checkoutBusy=true;renderCart();const status=document.getElementById('cartStatus');status.textContent='Проверяем наличие и цены…';
  const requestedRevision=cartRevision,requestedNavigation=navigationRevision;
  const requested=JSON.stringify(cart.map(x=>[x.id,x.size,x.quantity]));
  try{
    const ids=[...new Set(cart.map(x=>x.id))];const response=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=in.(${ids.map(encodeURIComponent).join(',')})&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error();const fresh=await response.json();if(!Array.isArray(fresh))throw Error();
    if(requestedNavigation!==navigationRevision){status.textContent='Оформление отменено. Нажмите «Оформить» в корзине, чтобы продолжить.';return}
    if(requestedRevision!==cartRevision||requested!==JSON.stringify(cart.map(x=>[x.id,x.size,x.quantity]))){status.textContent='Корзина изменилась. Нажмите «Оформить» ещё раз.';return}
    let changed=false,unavailable=false,reserved=false;
    for(const row of cart){const p=fresh.find(p=>String(p.id)===row.id);const index=products.findIndex(p=>String(p.id)===row.id);if(!p){if(index>=0)products.splice(index,1);unavailable=true;continue}if(index>=0)products[index]=p;else products.push(p);if(p.reserved)reserved=true;if((row.size&&!sizesOf(p).includes(row.size))||(!row.size&&sizesOf(p).length>0))unavailable=true;if(cartLimit(p,row.size)===0)unavailable=true;else if(row.quantity>cartLimit(p,row.size)){row.quantity=cartLimit(p,row.size);changed=true}const old=row.product;changed=changed||String(old.price)!==String(p.price)||String(old.currency)!==String(p.currency)||old.fulfillment_status!==p.fulfillment_status;row.product=cartSnapshot(p)}
    saveCart();
    if(reserved){status.textContent='В корзине есть товар на брони. Удалите его или дождитесь снятия брони — оформить заказ сейчас нельзя.';return}
    if(unavailable){status.textContent='Некоторые товары или размеры больше недоступны. Удалите их или выберите другой размер в карточке.';return}
    if(changed){status.textContent='Цена или наличие изменились. Корзина обновлена — проверьте итог и нажмите «Оформить» ещё раз.';return}
    const total=cartTotals();const text='Здравствуйте! Хочу оформить заказ:\n\n'+cart.map((row,i)=>{const p=cartProduct(row);return `${i+1}. ${p.brand||''} ${displayName(p)}${row.size?`, размер ${row.size}`:''} — ${row.quantity} шт.\n${money(p)||'Цена по запросу'} за шт. · ${availabilityLabel(p)}\n${productLink(p)}`}).join('\n\n')+'\n\nИтого: '+(total.totals.map(money).join(' + ')||'уточнить')+(total.unknown?' (есть товары с ценой по запросу)':'');
    if(text.length>3500){status.textContent='Заказ слишком большой для одного сообщения. Разделите его на несколько заказов.';return}
    if(telegramLink(`https://t.me/juliproz?text=${encodeURIComponent(text)}`)){window.StoreAnalytics?.track('checkout_open');status.textContent='Заказ подготовлен. Отправьте сообщение менеджеру в Telegram.';}else status.textContent='Telegram уже открывался. Подождите несколько секунд перед повторным оформлением.';
  }catch{status.textContent='Не удалось проверить наличие. Корзина сохранена — попробуйте ещё раз.'}finally{checkoutBusy=false;renderCart()}
}
const cartMutationTimes=new Map();
function allowCartMutation(action){const key=action==='remove'?'remove':'quantity',now=Date.now();if(now-(cartMutationTimes.get(key)??-Infinity)<350)return false;cartMutationTimes.set(key,now);return true}
document.getElementById('cartContent').addEventListener('click',e=>{
  const button=e.target.closest('[data-cart-action]');if(!button||button.isConnected===false||button.disabled)return;const action=button.dataset.cartAction;
  if(action==='catalog'){setTab('catalog');return}if(action==='checkout'){showMoneyPaw(button);checkoutCart();return}
  const index=Number(button.dataset.index),row=cart[index];if(!row)return;
  if(['remove','plus','minus'].includes(action)&&!allowCartMutation(action))return;
  if(action==='product'){openLinkedProduct(row.id);return}
  if(action==='remove'){window.StoreAnalytics?.track('cart_remove',row.id);cart.splice(index,1)}else if(action==='plus'&&!cartProduct(row).reserved)row.quantity=Math.min(cartLimit(cartProduct(row),row.size),row.quantity+1);else if(action==='minus')row.quantity=Math.max(1,row.quantity-1);
  document.getElementById('cartStatus').textContent='';saveCart();renderCart();
});
function relatedProducts(p){
  if(!p.category)return [];
  const compatible=x=>!p.gender||!x.gender||p.gender==='unisex'||x.gender==='unisex'||p.gender===x.gender;
  return products.filter(x=>String(x.id)!==String(p.id)&&x.available!==false&&x.category===p.category&&compatible(x)).sort((a,b)=>Number(b.brand===p.brand)-Number(a.brand===p.brand)).slice(0,4);
}
function relatedMarkup(p){
  const similar=relatedProducts(p);if(!similar.length)return '';
  return `<section class="related-products" aria-labelledby="relatedTitle"><h2 id="relatedTitle">Похожие товары</h2><div class="related-grid">${similar.map(x=>`<button type="button" class="related-card" data-related="${esc(x.id)}"><span class="related-photo">${imageOf(x)?`<img src="${esc(imageOf(x))}" alt="${esc(x.name)}" loading="lazy">`:'J.P'}</span><span class="related-brand">${esc(x.brand)}</span><span class="related-name">${esc(displayName(x))}</span><span class="related-size">${sizesOf(x).length?`Размер: ${esc(sizesOf(x).join(' · '))}`:'Размер уточняйте'}</span><strong>${esc(money(x)||'Цена по запросу')}</strong></button>`).join('')}</div></section>`;
}
let productReturnFocus=null;
function showProductModal(){
 const modal=document.getElementById('productModal');if(modal.classList.contains('hidden'))productReturnFocus=document.activeElement;
 modal.classList.remove('hidden');document.getElementById('backProduct').focus?.();
}
function closeProductModal(){navigationRevision++;selectedProduct=null;selectedSize=null;document.getElementById('productModal').classList.add('hidden');productReturnFocus?.focus?.();productReturnFocus=null}
document.addEventListener('keydown',e=>{
 const modal=document.getElementById('productModal');if(modal.classList.contains('hidden'))return;
 if(e.key==='Escape'){e.preventDefault();closeProductModal();return}
 if(e.key==='Tab'){
  const nodes=[...modal.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')].filter(n=>!n.closest('.hidden')&&n.getClientRects().length);
  const first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();modal.focus();return}
  if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus()}
 }
});
function openProduct(id){
  navigationRevision++;
  const p=products.find(x=>String(x.id)===String(id));if(!p)return;
  window.StoreAnalytics?.track("product_view",p.id);
  selectedProduct=p;
  const sizes=sizesOf(p);
  selectedSize=sizes.length===1?sizes[0]:(sizes.includes(state.size)?state.size:null);
  document.getElementById("productContent").innerHTML=`<div class="product-layout"><div class="product-gallery"><div class="hero">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}">`:"JP"}</div>${photosOf(p).length>1?`<div class="photo-picker" aria-label="Фотографии товара">${photosOf(p).map((url,i)=>`<button type="button" data-photo="${esc(url)}" aria-label="Фото ${i+1}"><img src="${esc(url)}" alt=""></button>`).join("")}</div>`:""}</div><div class="detail"><div class="product-eyebrow">${esc(p.category||"")} <span class="${p.reserved?"is-reserved":onOrder(p)?"on-order":""}">${availabilityLabel(p)}</span></div>${conditionBadge(p)}<div class="brandname">${esc(p.brand)}</div><h1>${esc(displayName(p))}</h1><div class="detail-price">${esc(money(p))}</div>${sizes.length>1?`<fieldset class="size-selector"><legend>Выберите размер</legend><div class="size-options">${sizes.map(size=>`<button type="button" data-size="${esc(size)}" aria-pressed="${selectedSize===size}">${esc(size)}</button>`).join("")}</div><p class="size-hint" id="sizeHint" role="status">${selectedSize?`Выбран размер ${esc(selectedSize)}`:"Выберите размер перед покупкой"}</p></fieldset>`:sizes.length===1?`<p class="detail-size">Размер: <strong>${esc(sizes[0])}</strong></p>`:""}${p.description?`<p class="product-description">${esc(p.description)}</p>`:""}<div class="detail-actions"><button type="button" class="primary cart-add purchase-action" data-action="add-cart" aria-label="${p.reserved?'На брони':'Купить'}" title="${p.reserved?'На брони':'Купить'}" ${p.reserved?'disabled':''}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l3 12h10l3-9H6"/><path d="M8 15l-1 3h12"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg><span>${p.reserved?'На брони':'Купить'}</span><span class="detail-cart-count" aria-hidden="true">${cartCount()}</span></button><button type="button" class="secondary detail-wishlist icon-action" data-action="wishlist" aria-label="Виш-лист" title="Виш-лист" aria-pressed="${state.favorites.has(String(p.id))}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button></div><p class="purchase-note">Срок доставки: ${deliveryLabel(p)}</p><p id="shareStatus" role="status"></p><aside class="sourcing-note product-sourcing" aria-label="Поиск, выкуп и комиссия"><div><h2>Поиск и продажа вещей</h2><p><strong>Не нашли нужный размер или ищете другую вещь?</strong> Отправьте нам фото или название — поможем найти нужную модель и организовать выкуп.</p><p><strong>Хотите продать свою вещь?</strong> Рассмотрим её выкуп или поможем продать через JULI.PROZ бот на комиссии. Отправьте фото, описание состояния и желаемую цену — условия согласуем заранее.</p></div><button type="button" class="sourcing-link" data-action="sourcing">Написать менеджеру <span aria-hidden="true">↗</span></button></aside></div>${relatedMarkup(p)}</div>`;
  showProductModal();
  document.getElementById("productModal").scrollTop=0;
}
document.getElementById("backProduct").onclick=closeProductModal;
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{setTab(b.dataset.tab);pressNavWithPaw(b)});
async function openLinkedProduct(id){
  const requestedNavigation=++navigationRevision;selectedProduct=null;selectedSize=null;
  id=String(id);if(/^\d+$/.test(id))id=id.replace(/^0+(?=\d)/,"");
  if(products.some(p=>String(p.id)===String(id))){openProduct(id);return}
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error();
    const rows=await r.json();
    if(requestedNavigation!==navigationRevision)return;
    if(!Array.isArray(rows))throw Error();
    if(rows.length){products.push(rows[0]);openProduct(id);return}
  }catch{
    if(requestedNavigation!==navigationRevision)return;
    document.getElementById("productContent").innerHTML='<div class="empty">Не удалось загрузить товар. Попробуйте обновить страницу.</div>';
    showProductModal();return;
  }
  selectedProduct=null;
  document.getElementById("productContent").innerHTML='<div class="empty">Товар скрыт из каталога или ссылка недействительна.</div>';
  showProductModal();
}
let contactBusy=false;
async function contact(p){
  if(contactBusy)return;contactBusy=true;
  try{await contactUnchecked(p,navigationRevision)}finally{contactBusy=false}
}
async function contactUnchecked(p,requestedNavigation){
  const requestedSize=p?selectedSize:null;
  if(p&&sizesOf(p).length>1&&!requestedSize){document.getElementById("sizeHint").textContent="Пожалуйста, выберите размер.";document.querySelector('[data-size]')?.focus();return}

  if(p?.id!=null){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(p.id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const rows=await r.json();if(!Array.isArray(rows))throw Error();if(!rows.length){document.getElementById("shareStatus").textContent="Товар больше не доступен в каталоге.";return}p=rows[0]}catch{document.getElementById("shareStatus").textContent="Не удалось проверить наличие. Попробуйте ещё раз.";return}}
  if(requestedNavigation!==navigationRevision)return;
  const currentSizes=sizesOf(p);
  if(requestedSize&&!currentSizes.includes(requestedSize)){document.getElementById("shareStatus").textContent="Этот размер больше недоступен. Откройте карточку заново.";loadProducts(true);return}
  if(p&&currentSizes.length>1&&!requestedSize){document.getElementById("shareStatus").textContent="Размеры изменились. Откройте карточку заново и выберите размер.";loadProducts(true);return}
  const size=requestedSize||(currentSizes.length===1?currentSizes[0]:null);
  const text=p?.id!=null?`Здравствуйте! Меня интересует ${p.brand||""} ${p.name||""}${size?`, размер ${size}`:""}.\nСтатус: ${availabilityLabel(p)}\nАртикул: ${p.id}\n${productLink(p)}`:"";
  if(telegramLink(`https://t.me/juliproz${text?`?text=${encodeURIComponent(text)}`:""}`))window.StoreAnalytics?.track("manager_open",p?.id);
}
document.getElementById("productContent").addEventListener("click",e=>{const related=e.target.closest("[data-related]");if(related){openProduct(related.dataset.related);return}const sizeButton=e.target.closest('[data-size]');if(sizeButton&&selectedProduct&&sizesOf(selectedProduct).includes(sizeButton.dataset.size)){selectedSize=sizeButton.dataset.size;document.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.size===selectedSize)));document.getElementById('sizeHint').textContent=`Выбран размер ${selectedSize}`;}const action=e.target.closest("[data-action]")?.dataset.action;if(action==="add-cart")addToCart();if(action==="wishlist")toggleWishlist(selectedProduct?.id);if(action==="open-cart")setTab("cart");if(action==="contact")contact(selectedProduct);if(action==="sourcing")contact();const b=e.target.closest("[data-photo]");if(b){const img=document.querySelector(".hero img");if(img){img.hidden=false;img.src=b.dataset.photo;img.parentElement.querySelector(".image-fallback")?.remove()}}});
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
document.addEventListener("error",e=>{if(e.target.tagName==="IMG"&&e.target.closest(".photo,.hero,.related-photo")){const parent=e.target.parentElement;e.target.hidden=true;if(!parent.querySelector('.image-fallback')){const placeholder=document.createElement('span');placeholder.className='image-fallback';placeholder.textContent='J.P';parent.appendChild(placeholder)}}},true);
document.addEventListener('load',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.photo,.hero')){e.target.hidden=false;e.target.parentElement.querySelector('.image-fallback')?.remove()}},true);
function refreshCatalogOnReturn(){if(Date.now()-lastCatalogLoadedAt>=60000)loadProducts(true)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCatalogOnReturn()});
window.addEventListener?.('focus',refreshCatalogOnReturn);

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

// Clear finite feedback effects so subsequent taps animate again.
document.addEventListener('animationend',e=>{if(e.animationName==='jp-pop')e.target.classList.remove('motion-pop')});
