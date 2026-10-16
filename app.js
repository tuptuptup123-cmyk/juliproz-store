// Remove legacy admin credentials left on the public storefront origin.
try{localStorage.removeItem('jpAdminSessionV1')}catch{}
try{sessionStorage.removeItem('jpAdminSessionV1')}catch{}
const taxonomy=window.CatalogTaxonomy||{category:v=>String(v||'').trim(),brandParts:v=>[...new Set(String(v||'').split(/\s*×\s*/).map(x=>x.trim()).filter(Boolean))],unique:v=>[...new Set(v)]};
const categoryOf=p=>taxonomy.category(p?.category);
const sameLabel=(a,b)=>taxonomy.key?taxonomy.key(a)===taxonomy.key(b):a===b;
const hasCategory=(p,value)=>sameLabel(categoryOf(p),value);
const wearLabels={like_new:'Как новая',gently_used:'Небольшие следы носки',used:'Следы носки',very_used:'Сильный износ'};
const wearLabel=p=>p?.product_condition==='pre_owned'?(wearLabels[p.wear_condition]||''):'';
const conditionLabels={new:'Новые вещи',pre_owned:'PRE-OWNED',vintage:'VINTAGE',commission:'Комиссия'};
const conditionOf=p=>p?.product_condition||'new';
const teamPickBadge=p=>p?.team_pick===true?'<span class="team-pick-badge">Выбор команды</span>':'';
const conditionBadge=p=>(conditionOf(p)==='new'?'':`<span class="condition-badge">${esc(conditionLabels[conditionOf(p)])}</span>`)+(p.on_commission?'<span class="condition-badge commission-badge">Комиссия</span>':'');
function descriptionText(p){const text=String(p.description||'').trim(),wear=wearLabel(p);return [text,wear&&!text.toLocaleLowerCase('ru').includes(wear.toLocaleLowerCase('ru'))?'Состояние: '+wear:''].filter(Boolean).join('\n\n')}
const matchesCondition=p=>!state.product_condition||(state.product_condition==='commission'?p.on_commission===true:conditionOf(p)===state.product_condition);
function brandsOf(p){return taxonomy.brandParts(p?.brand)}
const hasBrand=(p,value)=>brandsOf(p).some(b=>sameLabel(b,value));
const SUPABASE_URL=window.STORE_CONFIG.url;
const SUPABASE_KEY=window.STORE_CONFIG.key;

let products=[];
let selectedProduct=null;
let selectedSize=null;
let navigationRevision=0;
const sizesOf=p=>p?.color_catalog_sizes||ProductSizes.parse(p?.size).filter(size=>onOrder(p)||ProductSizes.stockFor(p,size)>0);
// A presentation-only group approved for these two physical Brioni sizes.
// Never replace the raw catalogue rows: cart, stock and order links use their IDs.
function brioniSizeGroup(rows=products){
  const xl=rows.find(p=>String(p.id)==='302'),xxl=rows.find(p=>String(p.id)==='301');
  if(!xl||!xxl||[xl,xxl].some(p=>p.available===false||p.reserved)||xl.brand!=='Brioni'||xxl.brand!=='Brioni'||xl.size!=='XL'||xxl.size!=='XXL')return null;
  const same=['brand','name','category','price','currency','original_price','product_condition','wear_condition','gender','fulfillment_status','on_commission'];
  if(same.some(key=>String(xl[key]??'')!==String(xxl[key]??'')))return null;
  return {...xl,team_pick:xl.team_pick===true||xxl.team_pick===true,size:'XL; XXL',stock_quantities:{XL:ProductSizes.stockFor(xl,'XL'),XXL:ProductSizes.stockFor(xxl,'XXL')},variant_ids:{XL:'302',XXL:'301'}};
}
// Owner-confirmed colour variants. The three other Loro cap models stay separate.
// Every colour keeps its original row, photo, size, stock and checkout destination.
function loroColorDefinitions(){return [
  {id:'388',label:'Красный'},{id:'297',label:'Тёмно-бирюзовый'},
  {id:'299',label:'Синий'},{id:'303',label:'Пыльно-розовый'},
  {id:'304',label:'Бордовый'},{id:'305',label:'Зелёный'},
  {id:'306',label:'Тёмно-синий'},{id:'394',label:'Бирюзовый'},
  {id:'396',label:'Персиковый'},{id:'397',label:'Лиловый'}
]}
function loroColorGroup(rows=products){
  const members=loroColorDefinitions().map(option=>({option,product:rows.find(p=>String(p.id)===option.id)})).filter(x=>x.product&&x.product.available!==false);
  if(members.length<2||members.some(x=>x.product.brand!=='Loro Piana'))return null;
  const first=members[0].product,same=['category','price','currency','original_price','product_condition','wear_condition','gender','fulfillment_status','on_commission'];
  if(members.some(x=>same.some(key=>String(x.product[key]??'')!==String(first[key]??''))))return null;
  return {id:members.some(x=>x.option.id==='388')?'388':members[0].option.id,members};
}
function colorGroupFor(id){const group=loroColorGroup();return group?.members.some(x=>x.option.id===String(id))?group:null}
function colorLabel(id){return loroColorDefinitions().find(x=>x.id===String(id))?.label||''}
function catalogueProducts(){
  // Colour variants keep their own catalogue cards; the detail selector connects them.
  const group=brioniSizeGroup();
  return group?products.filter(p=>String(p.id)!=='301').map(p=>String(p.id)==='302'?group:p):products;
}
function presentationProduct(id){
  const raw=products.find(p=>String(p.id)===String(id));
  return ['301','302'].includes(String(id))?(brioniSizeGroup()||raw):raw;
}
function isWishlisted(p){return state.favorites.has(String(p.id))||Boolean(p.variant_ids&&Object.values(p.variant_ids).some(id=>state.favorites.has(id)))||Boolean(p.color_member_ids?.some(id=>state.favorites.has(id)))}
function displayName(p){
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
const onOrder=p=>p?.fulfillment_status==='on_order';
function stockLabel(p,size=null){if(p?.available===false||p?.reserved||onOrder(p))return '';const n=size===null?ProductSizes.stockUnits(p):ProductSizes.stockFor(p,size);return n>0?'В наличии · '+n+' шт.':'Нет в наличии'}
const availabilityLabel=p=>p?.reserved?'На брони':onOrder(p)?'Под заказ':ProductSizes.stockUnits(p)===0?'Нет в наличии':'В наличии';
const deliveryLabel=p=>onOrder(p)?'10–14 рабочих дней':'7–10 рабочих дней';
const statusLabels={in_stock:'В наличии',on_order:'Под заказ'};
function productLink(p){const id=encodeURIComponent(String(p.id));return isTelegramStore()?`https://t.me/JuliProzBot/shop?startapp=p_${id}`:`https://www.juliproz.com/?product=${id}${window.SiteLanguage?.language==='en'?'&lang=en':''}`}
const CATALOG_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,fulfillment_status,gender,description,photos,reserved,product_condition,stock_quantities,on_commission,original_price,wear_condition,team_pick';
function photosOf(p){return [...new Set([p.image_url,p.image,...(Array.isArray(p.photos)?p.photos:[])].filter(safeProductImage))]}
const managerOpenTimes=new Map();
function openManager(text=''){
  const url=window.SiteLanguage?.managerLink?window.SiteLanguage.managerLink(text,{inTelegram:isTelegramStore()}):'https://t.me/juliproz'+(text?'?text='+encodeURIComponent(text):'');
  if(Date.now()-(managerOpenTimes.get(url)??-Infinity)<5000)return false;
  // Same-tab WhatsApp navigation survives the awaited stock check on mobile browsers.
  if(isTelegramStore()&&window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);else window.open(url,url.startsWith('https://wa.me/')?"_self":"_blank","noopener");managerOpenTimes.set(url,Date.now());if(managerOpenTimes.size>50)managerOpenTimes.delete(managerOpenTimes.keys().next().value);return true;}

function shareSelectedProduct(){
  if(!selectedProduct)return;
  const id=selectedProduct.variant_ids?.[selectedSize]||selectedProduct.id;
  const product=products.find(p=>String(p.id)===String(id));
  if(!product||product.available===false){document.getElementById('shareStatus').textContent='Товар больше недоступен в каталоге.';return}
  window.ProductSharing.open(product,{title:[brandsOf(product).join(' × '),displayName(product)].filter(Boolean).join(' — '),size:selectedSize});
}
function pluralRu(n,one,few,many){const k=Math.abs(n)%100;return k>=11&&k<=14?many:k%10===1?one:k%10>=2&&k%10<=4?few:many}
// Presentation-only detection: the public SDK also loads in ordinary browsers.
function isTelegramStore(){
 const app=window.Telegram?.WebApp;
 if(app&&((typeof app.initData==='string'&&app.initData.length>0)||(typeof app.platform==='string'&&app.platform!==''&&app.platform!=='unknown')))return true;
 const launch=new URLSearchParams(location.hash?.slice(1)||'');
 return Boolean(launch.get('tgWebAppData')||launch.get('tgWebAppVersion')||(launch.get('tgWebAppPlatform')&&launch.get('tgWebAppPlatform')!=='unknown'));
}
function syncWebNavigation(){
 window.SiteLanguage?.sync();
 const web=!isTelegramStore();
 document.querySelectorAll('.bottom-nav .web-only').forEach(b=>b.classList.toggle('hidden',!web));
 document.querySelector('.bottom-nav')?.classList.toggle('is-website-navigation',web);
 if(!web&&['home','about'].includes(state.tab)){const untouched=navigationRevision===0;setTab('catalog');if(untouched)navigationRevision=0;}
}

function initialStoreTab(){
 const params=new URLSearchParams(location.search);
 const linked=params.has('product')||params.get('startapp')?.startsWith('p_')||params.get('tgWebAppStartParam')?.startsWith('p_')||window.Telegram?.WebApp?.initDataUnsafe?.start_param?.startsWith('p_');
 return isTelegramStore()||linked||params.get('tab')==='catalog'?'catalog':'home';
}
let state={sort:"recommended",sale:false,product_condition:null,gender:null,fulfillment_status:null,category:null,brand:null,size:null,search:"",favorites:new Set((()=>{try{return JSON.parse(localStorage.getItem("jpFav")||"[]").map(String)}catch{return []}})()),tab:initialStoreTab()};
const grid=document.getElementById("grid"),count=document.getElementById("count"),sheet=document.getElementById("sheet"),options=document.getElementById("sheetOptions");
let currentFilter=null,tempValue=null;

function money(p){
  if(p.price==null||p.price===''||!['EUR','€'].includes(p.currency||'EUR'))return '';
  const n=window.ProductPricing.amount(p.price,p.currency);return n==null?'':'€ '+new Intl.NumberFormat(window.SiteLanguage?.language==='en'?'en-GB':'ru-RU',{maximumFractionDigits:0}).format(n);
}
function priceMarkup(p){if(!['EUR','€'].includes(p.currency||'EUR'))return 'Цена по запросу';return window.ProductPricing.markup(p,money,esc,{showPercentage:false})||'Цена по запросу'}
function imageOf(p){return photosOf(p)[0]||""}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function matchesAvailability(p){return !state.fulfillment_status||(state.fulfillment_status==='on_order'?onOrder(p):!onOrder(p)&&!p.reserved&&ProductSizes.stockUnits(p)>0)}
function matchesSale(p){return !state.sale||Boolean(window.ProductPricing.discount(p))}
function matchesGender(p){return !state.gender||p.gender===state.gender||p.gender==='unisex'||!p.gender}
function matchesContext(p,except){
  return matchesSale(p)&&matchesGender(p)&&matchesCondition(p)&&matchesAvailability(p)&&(except==='category'||!state.category||hasCategory(p,state.category))&&(except==='brand'||!state.brand||hasBrand(p,state.brand))&&(except==='size'||!state.size||sizesOf(p).includes(state.size));
}
function valuesFor(type){
  if(type==='product_condition')return ['Все','new','pre_owned','vintage','commission'];
  if(type==='fulfillment_status')return ['Все','in_stock','on_order'];
  // Offer categories within the audience, then brands and sizes within the category.
  const scope=catalogueProducts().filter(p=>matchesSale(p)&&matchesGender(p)&&matchesCondition(p)&&matchesAvailability(p)&&(type==='category'||!state.category||hasCategory(p,state.category))&&(type!=='size'||!state.brand||hasBrand(p,state.brand)));
  const values=scope.flatMap(p=>type==='size'?(variantLabel(p)==='размер'?sizesOf(p):[]):type==='brand'?brandsOf(p):[type==='category'?categoryOf(p):p[type]]).filter(Boolean);
  return ['Все',...(type==='size'?[...new Set(values)]:taxonomy.unique(values)).sort((a,b)=>type==='size'?ProductSizes.compare(a,b):String(a).localeCompare(String(b),'ru'))];
}
function menuSizeLabel(value){
  if(value==='Все'||state.category!=='Аксессуары')return value;
  const rows=products.filter(p=>matchesSale(p)&&matchesGender(p)&&matchesCondition(p)&&hasCategory(p,state.category)&&(!state.brand||hasBrand(p,state.brand))&&matchesAvailability(p)&&sizesOf(p).includes(value));
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
let sortRevision=0;
function priceForSort(p){return ['EUR','€'].includes(p.currency||'EUR')?window.ProductPricing.amount(p.price,p.currency):null}
function brandSortKey(brand){
  return String(brand||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function compareBrands(a,b){
  const x=brandSortKey(a.brand),y=brandSortKey(b.brand);
  const priority=key=>key==='chrome hearts'?0:key==='hermes'?1:key?2:3;
  return priority(x)-priority(y)||x.localeCompare(y,'en',{sensitivity:'base'});
}
function sortProducts(rows){
  return rows.slice().sort((a,b)=>{
    if(state.sort==='recommended'){const choice=Number(b.team_pick===true)-Number(a.team_pick===true);if(choice)return choice}
    if(state.sort==='recommended'||state.sort==='brand'){const order=compareBrands(a,b);if(order)return order}
    if(state.sort==='price_asc'||state.sort==='price_desc'){const x=priceForSort(a),y=priceForSort(b);if(x===null||y===null)return x===y?0:x===null?1:-1;return state.sort==='price_asc'?x-y:y-x}
    if(state.sort==='discount'){const x=window.ProductPricing.discount(a),y=window.ProductPricing.discount(b);return (y?(y.original-y.current)/y.original:0)-(x?(x.original-x.current)/x.original:0)}
    return (Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0);
  });
}
function filtered(){
  if(state.tab==="favorites")return sortProducts(catalogueProducts().filter(p=>isWishlisted(p)));
  const normalize=taxonomy.searchText||((v)=>String(v??'').toLowerCase().trim());
  const terms=normalize(state.search).split(' ').filter(Boolean);
  return sortProducts(catalogueProducts().filter(p=>{
    if(!matchesContext(p))return false;
    const text=normalize([p.brand,p.name,p.id,...Object.values(p.variant_ids||{}),p.size,p.color_search,categoryOf(p),window.SiteLanguage?.english(p.name),window.SiteLanguage?.english(categoryOf(p))].filter(v=>v!=null).join(' '));
    return terms.every(term=>text.includes(term));
  }));
}
function changeCatalogSort(value){if(!['recommended','brand','newest','price_asc','price_desc','discount'].includes(value))return;sortRevision++;state.sort=value;document.getElementById('sortStatus').textContent='';render()}
const sortLabels={recommended:'Рекомендуем',brand:'По брендам',newest:'Сначала новые',price_asc:'Дешевле',price_desc:'Дороже',discount:'Сначала большая скидка'};
function syncCatalogSort(){document.getElementById('catalogSortLabel').textContent='Сортировка';document.getElementById('catalogSort').setAttribute('aria-label','Сортировка товаров: '+sortLabels[state.sort]);document.getElementById('catalogSort').setAttribute('data-value',state.sort);document.querySelectorAll('[data-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sort===state.sort)))}
function setSortOpen(open){document.getElementById('catalogSortOptions').classList.toggle('hidden',!open);document.getElementById('catalogSort').setAttribute('aria-expanded',String(open))}
document.getElementById('catalogSort').onclick=()=>setSortOpen(document.getElementById('catalogSortOptions').classList.contains('hidden'));
document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{setSortOpen(false);document.getElementById('catalogSort').focus?.();changeCatalogSort(b.dataset.sort)});
document.addEventListener('click',e=>{if(!e.target.closest?.('#catalogSortWrap'))setSortOpen(false)});
document.getElementById('catalogSortWrap').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();setSortOpen(false);document.getElementById('catalogSort').focus?.()}if(e.key==='ArrowDown'&&e.target.id==='catalogSort'){e.preventDefault();setSortOpen(true);document.querySelector('[data-sort]')?.focus?.()}});
function emptyCollection(kind){
  const cartEmpty=kind==='cart';
  const symbol=cartEmpty?'<path d="M3 4h5l5 25h24l6-18H10"/><circle cx="16" cy="38" r="2.5"/><circle cx="35" cy="38" r="2.5"/>':'<path d="M40 8a11 11 0 0 0-16 0A11 11 0 0 0 8 24l16 16 16-16a11 11 0 0 0 0-16Z"/>';
  return `<div class="collection-empty ${cartEmpty?'cart-empty':'wishlist-empty'}"><div class="empty-content"><svg class="empty-symbol" width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbol}</svg><h2>${cartEmpty?'Корзина':'Ваш виш-лист пока пуст.'}</h2><p>${cartEmpty?'Ваша корзина пока пуста.':'Нажмите на сердечко у понравившегося товара.'}</p>${cartEmpty?'<button type="button" class="primary" data-cart-action="catalog">Перейти в каталог</button>':''}</div><span class="empty-signature" aria-hidden="true">J.P</span></div>`;
}
// Keep the full data set for filtering; mount cards only as the reader approaches them.
const CATALOG_BATCH_SIZE=24;
let catalogueRows=[],catalogueRendered=0,catalogueMore=null,catalogueObserver=null;
function catalogueCard(p){return `<article class="product" data-id="${esc(p.id)}"><div class="photo">${teamPickBadge(p)}${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:"JP"}<button class="heart ${isWishlisted(p)?"is-favorite":""}" aria-label="Виш-лист" aria-pressed="${isWishlisted(p)}" data-heart="${esc(p.id)}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button></div><h3><button type="button" class="product-open" aria-label="Открыть ${esc(brandsOf(p).join(' × '))} ${esc(displayName(p))}">${esc(brandsOf(p).join(' × '))}</button>${window.ProductPricing.discount(p)?'<span class="card-sale-badge">SALE</span>':''}</h3><div class="card-name-row"><p>${esc(displayName(p))}${p.color_member_ids?` · ${p.color_member_ids.length} ${pluralRu(p.color_member_ids.length,'цвет','цвета','цветов')}`:""}</p></div><div class="card-size">${sizesOf(p).length?`${ProductSizes.variantLabel(p,sizesOf(p).length>1)}: ${esc(sizesOf(p).join(" · "))}`:"Размер уточняйте"}</div><div class="price">${priceMarkup(p)}</div><div class="card-footer"><div class="card-meta">${conditionBadge(p,true)}</div>${availabilityLabel(p)!=='В наличии'?'<div class="catalog-status '+(p.reserved?'is-reserved':onOrder(p)?'on-order':'')+'">'+availabilityLabel(p)+'</div>':''}<div class="card-delivery">Доставка ${deliveryLabel(p)}</div></div></article>`}
function appendCatalogueRows(){
  if(catalogueRendered>=catalogueRows.length)return;
  const end=Math.min(catalogueRendered+CATALOG_BATCH_SIZE,catalogueRows.length);
  const html=catalogueRows.slice(catalogueRendered,end).map(catalogueCard).join('');
  if(catalogueMore)catalogueMore.insertAdjacentHTML('beforebegin',html);else grid.insertAdjacentHTML('beforeend',html);
  catalogueRendered=end;
  if(catalogueRendered===catalogueRows.length){catalogueObserver?.disconnect();catalogueMore?.remove();catalogueMore=null}
}
function renderCatalogueRows(rows,empty){
  catalogueObserver?.disconnect();catalogueMore=null;catalogueRows=rows;catalogueRendered=0;
  if(!rows.length){grid.innerHTML=empty;return}
  if(typeof IntersectionObserver!=='function'){grid.innerHTML=rows.map(catalogueCard).join('');return}
  grid.innerHTML='';appendCatalogueRows();
  if(catalogueRendered>=rows.length)return;
  catalogueMore=document.createElement('button');catalogueMore.type='button';catalogueMore.className='catalogue-more';catalogueMore.textContent='Показать ещё';catalogueMore.onclick=appendCatalogueRows;grid.appendChild(catalogueMore);
  catalogueObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))appendCatalogueRows()},{rootMargin:'800px'});
  catalogueObserver.observe(catalogueMore);
}
function render(){
  document.querySelectorAll('.bottom-nav [data-tab]').forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
  document.querySelector(".brand")?.classList.toggle("is-home-page",state.tab==="home");
  const inCart=state.tab==="cart",inSell=state.tab==="sell",inServices=state.tab==="services",inHome=state.tab==="home",inAbout=state.tab==="about",inWebPage=inHome||inAbout;
  document.getElementById("webHomePage").classList.toggle("hidden",!inHome);
  document.getElementById("webAboutPage").classList.toggle("hidden",!inAbout);
  document.querySelector(".brand")?.classList.toggle("is-information-page",inSell||inServices||inWebPage);
  document.querySelector(".brand")?.classList.toggle("is-catalog-page",state.tab==="catalog");
  document.getElementById("servicesPage").classList.toggle("hidden",!inServices);
  document.getElementById("sellPage").classList.toggle("hidden",!inSell);
  document.getElementById("cartPage").classList.toggle("hidden",!inCart);
  grid.classList.toggle("hidden",inCart||inSell||inServices||inWebPage);
  document.querySelector(".catalog-toolbar")?.classList.toggle("hidden",state.tab!=="catalog");
  document.querySelector(".catalog-head")?.classList.toggle("hidden",inCart||inSell||inServices||inWebPage);
  document.getElementById("filterSummary").classList.toggle("hidden",state.tab!=="catalog"||!document.getElementById("filterSummary").textContent);
  if(inSell||inServices||inWebPage)return;
  renderCart();
  if(inCart)return;
  syncCatalogSort();
  if(state.tab==='catalog'){
    reconcileFilters();renderCatalogMenu();
    document.querySelectorAll("[data-gender]").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.gender||null)===state.gender)));
    document.querySelectorAll("[data-filter]").forEach(b=>{const type=b.dataset.filter;b.textContent=(type==='fulfillment_status'?statusLabels[state[type]]:state[type])||{fulfillment_status:"Наличие",category:"Категория",brand:"Бренд",size:"Размер"}[type];b.classList.toggle("selected",!!state[type])});
    document.getElementById("filterSummary").classList.toggle("hidden",!document.getElementById("filterSummary").textContent);
  }
  const list=filtered();
  count.textContent=state.tab==="favorites"?`Виш-лист · ${list.length}`:`В каталоге ${list.length} ${pluralRu(list.length,'товар','товара','товаров')}`;
  renderCatalogueRows(list,(state.tab==="favorites"?emptyCollection('favorites'):'<div class="empty">Здесь пока ничего нет</div>'));
}
let menuOpenGroup='category';
let menuCloseTimer=null;
const menuLabels={product_condition:'Раздел',category:'Категория',size:'Размер',brand:'Бренд',fulfillment_status:'Наличие'};
function renderCatalogMenu(){
  document.querySelectorAll('[data-hot-brand]').forEach(b=>b.setAttribute('aria-pressed',String(Boolean(state.brand)&&sameLabel(state.brand,b.dataset.hotBrand))));
  document.querySelectorAll('[data-sale]').forEach(b=>b.setAttribute('aria-pressed',String(state.sale)));
  const labels=[state.sale?'SALE':null,state.product_condition?conditionLabels[state.product_condition]:null,state.gender?({men:'Мужское',women:'Женское'}[state.gender]):null,state.category,state.brand,state.size,state.fulfillment_status?statusLabels[state.fulfillment_status]:null].filter(Boolean);
  const badge=document.getElementById('menuBadge');badge.textContent=String(labels.length);badge.classList.toggle('hidden',!labels.length);
  const summary=document.getElementById('filterSummary');summary.textContent=labels.join(' · ');summary.classList.toggle('hidden',!labels.length);
  if(document.getElementById('catalogMenu').classList.contains('hidden'))return;
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
  document.getElementById('openProductMenu')?.setAttribute('aria-expanded',String(open));
  if(open){
    menu.classList.remove('hidden','is-closing');
    if(document.body?.style)document.body.style.overflow='hidden';
    document.querySelector('main')?.toggleAttribute?.('inert',true);
    document.querySelector('.brand')?.toggleAttribute?.('inert',true);
    document.querySelector('.bottom-nav')?.toggleAttribute?.('inert',true);
    document.getElementById('productModal').toggleAttribute?.('inert',true);
    renderCatalogMenu();document.getElementById('closeCatalogMenu').focus?.();
    return;
  }
  const finish=()=>{
    menu.classList.add('hidden');menu.classList.remove('is-closing');menuCloseTimer=null;
    if(document.body?.style)document.body.style.overflow='';
    const productOpen=!document.getElementById('productModal').classList.contains('hidden');
    document.querySelector('main')?.toggleAttribute?.('inert',productOpen);
    document.querySelector('.brand')?.toggleAttribute?.('inert',productOpen);
    document.querySelector('.bottom-nav')?.toggleAttribute?.('inert',false);
    document.getElementById('productModal').toggleAttribute?.('inert',false);
    document.getElementById(document.getElementById('productModal').classList.contains('hidden')?'openCatalogMenu':'openProductMenu').focus?.();
  };
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return}
  menu.classList.add('is-closing');menuCloseTimer=setTimeout(finish,280);
}
document.getElementById('openCatalogMenu').onclick=()=>setCatalogMenu(true);
document.getElementById('openProductMenu')?.addEventListener('click',()=>setCatalogMenu(true));
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
['closeCatalogMenu','menuBackdrop'].forEach(id=>document.getElementById(id).onclick=()=>setCatalogMenu(false));
document.getElementById('showMenuProducts').onclick=()=>{setTab('catalog');setCatalogMenu(false)};
document.querySelectorAll('[data-hot-brand]').forEach(b=>b.onclick=()=>{const brand=state.brand&&sameLabel(state.brand,b.dataset.hotBrand)?null:b.dataset.hotBrand;state.sale=false;state.product_condition=state.gender=state.fulfillment_status=state.category=state.size=null;state.search='';document.getElementById('search').value='';state.brand=brand;if(state.tab!=='catalog')setTab('catalog');else render()});
document.querySelectorAll('[data-sale]').forEach(b=>b.onclick=()=>{state.sale=!state.sale;reconcileFilters();if(state.tab!=='catalog')setTab('catalog');else render()});
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
const CATALOG_CACHE_KEY='jpCatalogueV2';
function readCatalogueCache(){
  try{const raw=sessionStorage.getItem(CATALOG_CACHE_KEY);if(!raw||raw.length>2000000)return null;const saved=JSON.parse(raw),age=Date.now()-saved.savedAt;
    if(!Number.isFinite(saved.savedAt)||age<0||age>120000||!Array.isArray(saved.products)||saved.products.length>10000||saved.products.some(p=>!p||typeof p!=='object'||p.available!==true||!/^\d+$|^[a-f0-9-]{36}$/i.test(String(p.id))))return null;
    return saved.products;
  }catch{return null}
}
function saveCatalogueCache(rows){try{const value=JSON.stringify({savedAt:Date.now(),products:rows});if(value.length<=2000000)sessionStorage.setItem(CATALOG_CACHE_KEY,value)}catch{}}
let catalogueEndpointRetryAt=0;
async function fetchCatalogue(){
  if(window.STORE_CONFIG.catalogEndpoint&&Date.now()>=catalogueEndpointRetryAt){
    try{
      const response=await fetch(window.STORE_CONFIG.catalogEndpoint,{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Catalogue cache unavailable');
      const rows=await response.json();
      if(!Array.isArray(rows)||rows.length>10000||rows.some(p=>!p||p.available!==true))throw Error('Invalid catalogue');
      return rows;
    }catch{catalogueEndpointRetryAt=Date.now()+60000}
  }
  const rows=[];
    for(let offset=0;;offset+=500){
      const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&available=eq.true&order=created_at.desc,id.desc&limit=500&offset=${offset}`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});
      if(!r.ok) throw new Error(`Supabase ${r.status}`);
      const page=await r.json();
      if(!Array.isArray(page))throw new Error("Invalid catalog response");
      rows.push(...page);
      if(page.length<500)break;
    }
    return rows;
}
let catalogLoading=false,firstLoad=true,lastCatalogLoadedAt=0;
async function loadProducts(quiet=false){
  if(catalogLoading)return;catalogLoading=true;const requestedNavigation=navigationRevision;
  if(!quiet){
  count.textContent="Загружаем наличие…";
  grid.innerHTML='<div class="empty">Загружаем товары…</div>';
  }
  try{
    const rows=await fetchCatalogue();
    const changed=JSON.stringify(products)!==JSON.stringify(rows);products=rows;lastCatalogLoadedAt=Date.now();saveCatalogueCache(rows);
    if(changed||!quiet)render();
    if(changed)syncOpenProductGallery();
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
document.getElementById("reset").onclick=()=>{setSortOpen(false);sortRevision++;state.sort="recommended";document.getElementById("sortStatus").textContent="";state.sale=false;state.product_condition=state.gender=state.fulfillment_status=state.category=state.brand=state.size=null;state.search="";document.getElementById("search").value="";render()};
grid.onclick=e=>{
  if(e.target.id==="retryProducts"){loadProducts();return}
  const h=e.target.closest("[data-heart]");
  if(h){e.stopPropagation();toggleWishlist(h.dataset.heart,true);return}
  const card=e.target.closest("[data-id]");if(card)openProduct(String(card.dataset.id));
};
grid.onkeydown=e=>{if(e.target.matches("[data-id]")&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openProduct(e.target.dataset.id)}};
// Cart stays on this device. Checkout always rechecks the public catalogue.
function readCart(){
  try{const rows=JSON.parse(localStorage.getItem('jpCart')||'[]');if(!Array.isArray(rows))return [];const clean=[];for(const row of rows.slice(0,50)){if(!row||!/^([0-9]+|[a-f0-9-]{36})$/i.test(String(row.id))||typeof row.size!=='string'||row.size.length>100)continue;const item={id:String(row.id),size:ProductSizes.normalize?ProductSizes.normalize(row.size.trim()):row.size,quantity:Math.min(99,Math.max(1,Math.floor(Number(row.quantity)||1))),product:row.product&&typeof row.product==='object'?cartSnapshot(row.product):{}};const old=clean.find(x=>x.id===item.id&&x.size===item.size);if(old)old.quantity=Math.min(99,old.quantity+item.quantity);else clean.push(item)}return clean}catch{return []}
}
let cart=readCart(),checkoutBusy=false,cartRevision=0;
function cartLimit(p,size=''){return onOrder(p)?99:Math.min(99,ProductSizes.stockFor(p,size))}
function cartCount(){return cart.reduce((n,x)=>n+x.quantity,0)}
function cartProduct(row){return products.find(p=>String(p.id)===row.id)||row.product}
function liveCartProduct(row){const p=products.find(p=>String(p.id)===row.id);return p&&p.available!==false&&(row.size?sizesOf(p).includes(row.size):sizesOf(p).length===0)?p:null}
function cartSnapshot(p){const snapshot=Object.fromEntries(['id','brand','name','category','price','currency','image_url','photos','size','fulfillment_status','reserved','stock_quantities','original_price'].map(k=>[k,['price','original_price'].includes(k)?window.ProductPricing.amount(p[k],p.currency):p[k]]));snapshot.price_basis=p.price_basis||{price:p.price,original_price:p.original_price};return snapshot}
function saveCart(){cartRevision++;try{localStorage.setItem('jpCart',JSON.stringify(cart))}catch{document.getElementById('cartStatus').textContent='Корзина доступна в этом сеансе. Браузер не разрешил сохранить её.'}}
function setTab(tab){
  if(['home','about'].includes(tab)&&isTelegramStore())return;
  setSortOpen(false);
  if(tab!=='catalog'){document.getElementById('catalogSearch').classList.add('hidden');document.getElementById('toggleSearch').setAttribute('aria-expanded','false');state.search='';document.getElementById('search').value=''}
  if(state.tab!==tab)window.StoreAnalytics?.track("page_view",null,['sell','services','home','about'].includes(tab)?null:tab);
  navigationRevision++;
  state.tab=tab;selectedProduct=null;selectedSize=null;hideProductModal();productReturnFocus=null;
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});render();
}
const wishlistClicks=new Map();
function toggleWishlist(id,fromCard=false){
  if(id==null)return;id=String(id);const now=Date.now();if(now-(wishlistClicks.get(id)??-Infinity)<450)return;wishlistClicks.set(id,now);if(wishlistClicks.size>200)wishlistClicks.delete(wishlistClicks.keys().next().value);const display=presentationProduct(id),ids=display?.variant_ids?Object.values(display.variant_ids):[id];if(ids.some(key=>state.favorites.has(key)))ids.forEach(key=>state.favorites.delete(key));else state.favorites.add(id);
  window.StoreAnalytics?.track(state.favorites.has(id)?'wishlist_add':'wishlist_remove',id);
  try{localStorage.setItem('jpFav',JSON.stringify([...state.favorites]))}catch{}
  if(state.tab==='favorites')render();
  else for(const button of grid.querySelectorAll?.('[data-heart]')||[]){
    const p=catalogueRows.find(p=>String(p.id)===button.dataset.heart)||presentationProduct(button.dataset.heart);
    if(p){const saved=isWishlisted(p);button.classList.toggle('is-favorite',saved);button.setAttribute('aria-pressed',String(saved))}
  }
  const heart=[...grid.querySelectorAll?.('[data-heart]')||[]].find(b=>b.dataset.heart===id);
  heart?.classList.add('motion-pop');
  document.querySelector('.detail-wishlist')?.classList.add('motion-pop');
  const button=document.querySelector('.detail-wishlist');if(button&&selectedProduct){const saved=isWishlisted(selectedProduct);button.setAttribute('aria-pressed',String(saved));button.classList.toggle('is-saved',saved)}
}
function addToCart(){
  if(!selectedProduct)return;
  if(selectedProduct.variant_ids&&!selectedSize){document.getElementById('sizeHint').textContent='Пожалуйста, выберите размер.';document.querySelector('[data-size]')?.focus();return}
  const variantId=selectedProduct.variant_ids?.[selectedSize]||selectedProduct.id;
  if(selectedProduct.variant_ids&&!brioniSizeGroup()){openProduct(variantId,true);document.getElementById('shareStatus').textContent='Карточка изменилась. Проверьте размер, цену и наличие, затем нажмите «Купить» ещё раз.';return}
  const p=products.find(x=>String(x.id)===String(variantId));
  if(p?.reserved){document.getElementById('shareStatus').textContent='Товар на брони. Покупка станет доступна после снятия брони.';return}
  if(!p||p.available===false){document.getElementById('shareStatus').textContent='Товар больше недоступен в каталоге.';return}
  const sizes=sizesOf(p);
  if((selectedSize&&!sizes.includes(selectedSize))||(!selectedSize&&sizes.length===1)||priceForSort(p)!==priceForSort(selectedProduct)||String(p.currency)!==String(selectedProduct.currency)||p.fulfillment_status!==selectedProduct.fulfillment_status){openProduct(p.id,true);document.getElementById('shareStatus').textContent='Карточка изменилась. Проверьте размер, цену и наличие, затем нажмите «Купить» ещё раз.';return}
  if(sizesOf(p).length>1&&!selectedSize){document.getElementById('sizeHint').textContent=`Пожалуйста, выберите ${variantLabel(p)}.`;document.querySelector('[data-size]')?.focus();return}
  const size=selectedSize||'';if(cartLimit(p,size)<1){document.getElementById('shareStatus').textContent='Этот вариант закончился.';return}const row=cart.find(x=>x.id===String(p.id)&&x.size===size);
  if(row){document.getElementById('shareStatus').textContent=cartLimit(p,size)>1?'Этот вариант товара уже в корзине. Количество можно изменить в корзине.':'Этот вариант товара уже в корзине — доступна одна штука.';return}else{if(cart.length>=50){document.getElementById('shareStatus').textContent='В корзине максимум 50 позиций.';return}cart.push({id:String(p.id),size,quantity:1,product:cartSnapshot(p)})}
  window.StoreAnalytics?.track('cart_add',p.id);showMoneyPaw(document.querySelector('[data-action="add-cart"]'));saveCart();renderCart();document.querySelector('[data-action="add-cart"]')?.classList.add('motion-pop');document.getElementById('cartBadge').classList.add('motion-pop');document.getElementById('shareStatus').textContent='Товар добавлен в корзину.';
}
function cartTotals(rows=cart){
  const totals=new Map();let unknown=false;
  for(const row of rows){const price=priceForSort(cartProduct(row)),currency='EUR';if(price==null){unknown=true;continue}totals.set(currency,(totals.get(currency)||0)+price*row.quantity)}
  return {totals:[...totals].map(([currency,price])=>({currency,price})),unknown};
}
function renderCart(){
  let adjusted=false;for(const row of cart){const limit=cartLimit(cartProduct(row),row.size);if(limit>0&&row.quantity>limit){row.quantity=limit;adjusted=true}}if(adjusted){saveCart();document.getElementById('cartStatus').textContent='Количество обновлено в соответствии с остатком товара.'}
  document.getElementById('cartPage').classList.toggle('is-empty',!cart.length);
  const badge=document.getElementById('cartBadge');badge.textContent=String(cartCount());badge.classList.toggle('hidden',!cart.length);
  const detailCount=document.querySelector('.detail-cart-count');if(detailCount)detailCount.textContent=String(cartCount());
  if(!cart.length){document.getElementById('cartContent').innerHTML=emptyCollection('cart');return}
  const total=cartTotals();
  document.getElementById('cartContent').innerHTML=`<div class="cart-items">${cart.map((row,i)=>{const p=cartProduct(row),photo=imageOf(presentationProduct(row.id)||p),live=liveCartProduct(row),valid=live&&cartLimit(live,row.size)>0&&(row.size?sizesOf(live).includes(row.size):sizesOf(live).length===0);return `<article class="cart-item"><button type="button" class="cart-photo" data-cart-action="product" data-index="${i}" aria-label="Открыть ${esc(brandsOf(p).join(' × '))} ${esc(p.name||'товар')}">${photo?`<img src="${esc(photo)}" alt="${esc(p.name||'')}">`:'J.P'}</button><div class="cart-item-info"><h2>${esc(brandsOf(p).join(' × '))}</h2><button type="button" class="cart-name" data-cart-action="product" data-index="${i}">${esc(displayName(p)||'Товар')}</button><p>${colorLabel(row.id)?`Цвет: ${esc(colorLabel(row.id))}<br>`:""}${row.size?`${ProductSizes.variantLabel(p)}: ${esc(row.size)}`:'Размер уточняйте'}</p><strong>${priceMarkup(p)||'Цена по запросу'}</strong><p class="cart-delivery">${valid?`${availabilityLabel(p)!=='В наличии'?availabilityLabel(p)+' · ':''}${deliveryLabel(p)}`:'Товар или размер сейчас недоступен'}</p><div class="cart-item-controls"><div class="quantity-control" aria-label="Количество"><button type="button" data-cart-action="minus" data-index="${i}" aria-label="Уменьшить количество" ${row.quantity<=1?'disabled':''}>−</button><span>${row.quantity}</span><button type="button" data-cart-action="plus" data-index="${i}" aria-label="Увеличить количество" ${!valid||p.reserved||row.quantity>=cartLimit(live,row.size)?'disabled':''}>+</button></div><button type="button" class="cart-remove" data-cart-action="remove" data-index="${i}">Удалить</button></div></div></article>`}).join('')}</div><aside class="cart-summary"><h2>Итого</h2><p>${cartCount()} ${pluralRu(cartCount(),'вещь','вещи','вещей')}</p>${total.totals.map(t=>`<strong>${esc(money(t))}</strong>`).join('')}${total.unknown?'<p>Стоимость некоторых товаров уточнит менеджер.</p>':''}<button type="button" class="primary" data-cart-action="checkout" ${checkoutBusy?'disabled':''}>${checkoutBusy?'Проверяем наличие…':'Оформить через менеджера'}</button><p class="checkout-note">Откроется Telegram с вашим заказом. Доставку и оплату согласуем с менеджером.</p></aside>`;
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
    for(const row of cart){const p=fresh.find(p=>String(p.id)===row.id);const index=products.findIndex(p=>String(p.id)===row.id);if(!p){if(index>=0)products.splice(index,1);unavailable=true;continue}if(index>=0)products[index]=p;else products.push(p);if(p.reserved)reserved=true;if((row.size&&!sizesOf(p).includes(row.size))||(!row.size&&sizesOf(p).length>0))unavailable=true;if(cartLimit(p,row.size)===0)unavailable=true;else if(row.quantity>cartLimit(p,row.size)){row.quantity=cartLimit(p,row.size);changed=true}const old=row.product;changed=changed||priceForSort(old)!==priceForSort(p)||String(old.currency)!==String(p.currency)||old.fulfillment_status!==p.fulfillment_status;row.product=cartSnapshot(p)}
    saveCart();
    if(reserved){status.textContent='В корзине есть товар на брони. Удалите его или дождитесь снятия брони — оформить заказ сейчас нельзя.';return}
    if(unavailable){status.textContent='Некоторые товары или размеры больше недоступны. Удалите их или выберите другой размер в карточке.';return}
    if(changed){status.textContent='Цена или наличие изменились. Корзина обновлена — проверьте итог и нажмите «Оформить» ещё раз.';return}
    const text='Привет! Хочу заказать:\n\n'+cart.map(row=>`${productLink(cartProduct(row))}\n${ProductSizes.variantLabel(cartProduct(row))}: ${row.size||'уточнить'} · Количество: ${row.quantity}`).join('\n\n');
    if(text.length>3500){status.textContent='Заказ слишком большой для одного сообщения. Разделите его на несколько заказов.';return}
    if(openManager(text)){window.StoreAnalytics?.track('checkout_open');status.textContent='Заказ подготовлен. Отправьте сообщение менеджеру в Telegram.';}else status.textContent='Telegram уже открывался. Подождите несколько секунд перед повторным оформлением.';
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
  if(action==='remove'){window.StoreAnalytics?.track('cart_remove',row.id);cart.splice(index,1)}else if(action==='plus'){
    const live=liveCartProduct(row);if(!live||live.reserved||cartLimit(live,row.size)<1){document.getElementById('cartStatus').textContent='Товар или размер сейчас недоступен. Количество не изменено.';renderCart();return}
    row.quantity=Math.min(cartLimit(live,row.size),row.quantity+1);
  }else if(action==='minus')row.quantity=Math.max(1,row.quantity-1);
  document.getElementById('cartStatus').textContent='';saveCart();renderCart();
});
function relatedProducts(p){
  if(!p.category)return [];
  const compatible=x=>!p.gender||!x.gender||p.gender==='unisex'||x.gender==='unisex'||p.gender===x.gender;
  const colorGroup=colorGroupFor(p.id);
  return catalogueProducts().filter(x=>String(x.id)!==String(p.id)&&String(x.id)!==colorGroup?.id&&x.available!==false&&categoryOf(x)===categoryOf(p)&&compatible(x)).sort((a,b)=>Number(b.brand===p.brand)-Number(a.brand===p.brand)).slice(0,4);
}
function relatedMarkup(p){
  const similar=relatedProducts(p);if(!similar.length)return '';
  return `<section class="related-products" aria-labelledby="relatedTitle"><h2 id="relatedTitle">Похожие товары</h2><div class="related-grid">${similar.map(x=>`<button type="button" class="related-card" data-related="${esc(x.id)}"><span class="related-photo">${imageOf(x)?`<img src="${esc(imageOf(x))}" alt="${esc(x.name)}" loading="lazy">`:'J.P'}</span><span class="related-brand">${esc(x.brand)}</span><span class="related-name">${esc(displayName(x))}</span><span class="related-size">${sizesOf(x).length?`${ProductSizes.variantLabel(x,sizesOf(x).length>1)}: ${esc(sizesOf(x).join(' · '))}`:'Размер уточняйте'}</span><strong>${priceMarkup(x)||'Цена по запросу'}</strong></button>`).join('')}</div></section>`;
}
let productReturnFocus=null;
let productNavHome=null;
function hideProductModal(){
 document.body?.classList?.remove('product-modal-open');
 const modal=document.getElementById('productModal'),nav=modal.querySelector?.('.bottom-nav');
 if(nav&&productNavHome){productNavHome.replaceWith(nav);productNavHome=null}
 modal.classList.add('hidden');
 const menuOpen=!document.getElementById('catalogMenu').classList.contains('hidden');
 document.querySelector('main')?.toggleAttribute?.('inert',menuOpen);
 document.querySelector('.brand')?.toggleAttribute?.('inert',menuOpen);
}
function showProductModal(){
 document.body?.classList?.add('product-modal-open');
 const modal=document.getElementById('productModal');if(modal.classList.contains('hidden'))productReturnFocus=document.activeElement;
 const nav=document.querySelector('.bottom-nav');
 if(nav?.before&&document.createComment&&!modal.contains(nav)){productNavHome=document.createComment('bottom navigation');nav.before(productNavHome);modal.appendChild(nav)}
 modal.classList.remove('hidden');
 document.querySelector('main')?.toggleAttribute?.('inert',true);
 document.querySelector('.brand')?.toggleAttribute?.('inert',true);
 document.getElementById('backProduct').focus?.();
}
function closeProductModal(){navigationRevision++;selectedProduct=null;selectedSize=null;hideProductModal();productReturnFocus?.focus?.();productReturnFocus=null}
document.addEventListener('keydown',e=>{
 const modal=document.getElementById('productModal');if(modal.classList.contains('hidden'))return;
 if(!document.getElementById('catalogMenu').classList.contains('hidden'))return;
 if(e.key==='Escape'){e.preventDefault();closeProductModal();return}
 if(e.key==='Tab'){
  const nodes=[...modal.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')].filter(n=>!n.closest('.hidden')&&n.getClientRects().length);
  const first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();modal.focus();return}
  if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus()}
 }
});
function variantLabel(p){return ProductSizes.variantLabel(p).toLowerCase()}
// Refresh only photos in an open detail view; keep size, cart, focus and scroll.
function syncOpenProductGallery(){
  if(!selectedProduct||document.getElementById('productModal').classList.contains('hidden'))return;
  const fresh=products.find(p=>String(p.id)===String(selectedProduct.id));if(!fresh)return;
  for(const img of document.querySelectorAll?.('#productContent [data-color-id] img')||[]){const row=products.find(p=>String(p.id)===img.closest('[data-color-id]')?.dataset.colorId),url=row&&imageOf(row);if(url&&img.getAttribute('src')!==url)img.src=url}
  const previous=photosOf(selectedProduct),photos=photosOf(fresh);selectedProduct={...selectedProduct,image_url:fresh.image_url,image:fresh.image,photos:fresh.photos};
  if(JSON.stringify(previous)===JSON.stringify(photos))return;
  const gallery=document.querySelector('#productContent .product-gallery');if(!gallery)return;
  const shown=gallery.querySelector('.hero img')?.getAttribute('src'),active=photos.includes(shown)?shown:photos[0];
  gallery.innerHTML=`<div class="hero">${active?`<img src="${esc(active)}" alt="${esc(fresh.name)}">`:"JP"}</div>${photos.length>1?`<div class="photo-picker" aria-label="Фотографии товара">${photos.map((url,i)=>`<button type="button" data-photo="${esc(url)}" aria-label="Фото ${i+1}"><img src="${esc(url)}" alt=""></button>`).join("")}</div>`:""}`;
}
function colorSelectorMarkup(p){
  const group=colorGroupFor(p.id);if(!group)return '';
  return `<fieldset class="color-selector"><legend>Выберите цвет</legend><div class="color-options">${group.members.map(({option,product})=>`<button type="button" class="color-option" data-color-id="${esc(option.id)}" aria-pressed="${String(p.id)===option.id}" aria-label="${esc(option.label)}, размер ${esc(product.size||'уточняйте')}${product.reserved?', на брони':ProductSizes.stockUnits(product)===0?', нет в наличии':''}">${imageOf(product)?`<img src="${esc(imageOf(product))}" alt="">`:''}<span>${esc(option.label)}</span><small>${esc(product.size||'Размер уточняйте')}${product.reserved?' · На брони':ProductSizes.stockUnits(product)===0?' · Нет в наличии':''}</small></button>`).join('')}</div><p class="color-hint" role="status">Выбран цвет: ${esc(colorLabel(p.id))}</p></fieldset>`;
}
function openProduct(id,linked=false){

  navigationRevision++;
  const raw=products.find(x=>String(x.id)===String(id));if(!raw)return;
  let p=presentationProduct(id);
  // An old variant link must show its own unavailable state, never another size.
  if(linked&&p.variant_ids&&!sizesOf(p).includes(raw.size))p=raw;
  window.StoreAnalytics?.track("product_view",p.id);
  selectedProduct=p;
  const sizes=sizesOf(p),soldOut=!onOrder(p)&&ProductSizes.stockUnits(p)===0,purchaseLabel=p.reserved?'На брони':soldOut?'Нет в наличии':'Купить';
  selectedSize=linked&&p.variant_ids?raw.size:sizes.length===1?sizes[0]:(sizes.includes(state.size)?state.size:null);
  document.getElementById("productContent").innerHTML=`<div class="product-layout"><div class="product-gallery"><div class="hero">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}">`:"JP"}</div>${photosOf(p).length>1?`<div class="photo-picker" aria-label="Фотографии товара">${photosOf(p).map((url,i)=>`<button type="button" data-photo="${esc(url)}" aria-label="Фото ${i+1}"><img src="${esc(url)}" alt=""></button>`).join("")}</div>`:""}</div><div class="detail"><div class="product-eyebrow">${esc(categoryOf(p))}${availabilityLabel(p)!=='В наличии'?` <span class="${p.reserved?"is-reserved":onOrder(p)?"on-order":""}">${availabilityLabel(p)}</span>`:''}</div>${teamPickBadge(p)}${conditionBadge(p)}<div class="brandname">${esc(brandsOf(p).join(' × '))}</div><h1>${esc(displayName(p))}</h1><div class="detail-price">${priceMarkup(p)}</div>${colorSelectorMarkup(p)}${sizes.length>1?`<fieldset class="size-selector"><legend>Выберите ${variantLabel(p)}</legend><div class="size-options">${sizes.map(size=>`<button type="button" data-size="${esc(size)}" aria-pressed="${selectedSize===size}">${esc(size)}</button>`).join("")}</div><p class="size-hint" id="sizeHint" role="status">${selectedSize?`Выбран ${variantLabel(p)} ${esc(selectedSize)}`:`Выберите ${variantLabel(p)} перед покупкой`}</p></fieldset>`:sizes.length===1?`<p class="detail-size">${ProductSizes.variantLabel(p)}: <strong>${esc(sizes[0])}</strong></p>`:""}<p class="stock-label detail-stock" id="detailStock" role="status">${stockLabel(p,selectedSize)}</p>${descriptionText(p)?`<p class="product-description">${esc(descriptionText(p))}</p>`:""}<div class="detail-actions"><button type="button" class="primary cart-add purchase-action" data-action="add-cart" aria-label="${purchaseLabel}" title="${purchaseLabel}" ${p.reserved||soldOut?'disabled':''}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l3 12h10l3-9H6"/><path d="M8 15l-1 3h12"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg><span>${purchaseLabel}</span><span class="detail-cart-count" aria-hidden="true">${cartCount()}</span></button><button type="button" class="secondary detail-wishlist icon-action" data-action="wishlist" aria-label="Виш-лист" title="Виш-лист" aria-pressed="${isWishlisted(p)}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button><button type="button" class="secondary icon-action detail-share" data-action="share" aria-label="Поделиться вещью" title="Поделиться вещью"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M5 11v9h14v-9"/></svg></button></div><p class="purchase-note">Срок доставки: ${deliveryLabel(p)}</p><p id="shareStatus" role="status"></p><aside class="sourcing-note product-sourcing" aria-label="Поиск, выкуп и комиссия"><div><h2>Поиск и продажа вещей</h2><p><strong>Не нашли нужный размер или ищете другую вещь?</strong> Отправьте нам фото или название — поможем найти нужную модель и организовать выкуп.</p><p><strong>Хотите продать свою вещь?</strong> Рассмотрим её выкуп или поможем продать через наш магазин на комиссии. Отправьте фото, описание состояния и желаемую цену — условия согласуем заранее.</p></div><button type="button" class="sourcing-link" data-action="sourcing">Написать менеджеру <span aria-hidden="true"><svg class="inline-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></span></button></aside></div>${relatedMarkup(p)}</div>`;

  showProductModal();
  document.getElementById("productModal").scrollTop=0;
}
document.getElementById("backProduct").onclick=closeProductModal;
document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{
  const text=b.dataset.service==='authentication'?'Здравствуйте! Хочу организовать аутентификацию вещи через ваших партнёров. Подскажите онлайн- и офлайн-варианты, стоимость и сроки.':'Здравствуйте! Хочу обратиться в ателье или обсудить спа для сумки, полировку или обслуживание часов через ваших партнёров. Пришлю фотографии и описание запроса.';
  if(openManager(text))window.StoreAnalytics?.track(b.dataset.service==='authentication'?'manager_authentication':'manager_atelier');
});
document.getElementById('offerItem').onclick=()=>{
  const text='Здравствуйте! Хочу предложить вещь для выкупа или продажи на комиссии через ваш магазин.';
  if(openManager(text))window.StoreAnalytics?.track('manager_sell');
};
document.querySelectorAll('[data-web-section]').forEach(b=>b.onclick=()=>setTab(b.dataset.webSection));
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{setTab(b.dataset.tab);pressNavWithPaw(b)});
async function openLinkedProduct(id){
  const requestedNavigation=++navigationRevision;selectedProduct=null;selectedSize=null;
  id=String(id);if(/^\d+$/.test(id))id=id.replace(/^0+(?=\d)/,"");
  if(products.some(p=>String(p.id)===String(id))){openProduct(id,true);return}
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error();
    const rows=await r.json();
    if(requestedNavigation!==navigationRevision)return;
    if(!Array.isArray(rows))throw Error();
    if(rows.length){products.push(rows[0]);openProduct(id,true);return}
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
async function contact(p,event=null,sourceProduct=null){
  if(contactBusy)return;contactBusy=true;
  try{await contactUnchecked(p,navigationRevision,event,sourceProduct)}finally{contactBusy=false}
}
async function contactUnchecked(p,requestedNavigation,event=null,sourceProduct=null){
  const requestedSize=p?selectedSize:null;
  if(p&&sizesOf(p).length>1&&!requestedSize){document.getElementById("sizeHint").textContent=`Пожалуйста, выберите ${variantLabel(p)}.`;document.querySelector('[data-size]')?.focus();return}

  if(p?.id!=null){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(p.id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const rows=await r.json();if(!Array.isArray(rows))throw Error();if(!rows.length){document.getElementById("shareStatus").textContent="Товар больше не доступен в каталоге.";return}p=rows[0]}catch{document.getElementById("shareStatus").textContent="Не удалось проверить наличие. Попробуйте ещё раз.";return}}
  if(requestedNavigation!==navigationRevision)return;
  const currentSizes=sizesOf(p);
  if(requestedSize&&!currentSizes.includes(requestedSize)){document.getElementById("shareStatus").textContent="Этот размер больше недоступен. Откройте карточку заново.";loadProducts(true);return}
  if(p&&currentSizes.length>1&&!requestedSize){document.getElementById("shareStatus").textContent="Размеры изменились. Откройте карточку заново и выберите размер.";loadProducts(true);return}
  const size=requestedSize||(currentSizes.length===1?currentSizes[0]:null);
  const text=p?.id!=null?`Здравствуйте! Меня интересует ${p.brand||""} ${p.name||""}${size?`, ${variantLabel(p)} ${size}`:""}.\nСтатус: ${availabilityLabel(p)}\nАртикул: ${p.id}\n${productLink(p)}`:"";
  if(openManager(text))window.StoreAnalytics?.track(event||(p?.id!=null?"manager_product":"manager_general"),p?.id??sourceProduct);
}
document.getElementById("productContent").addEventListener("click",e=>{const colorButton=e.target.closest('[data-color-id]');if(colorButton&&selectedProduct){const group=colorGroupFor(selectedProduct.id),id=colorButton.dataset.colorId;if(group?.members.some(x=>x.option.id===id)){const scroll=document.getElementById('productModal').scrollTop;openProduct(id,true);document.getElementById('productModal').scrollTop=scroll;document.querySelector(`[data-color-id="${id}"]`)?.focus?.()}return}const related=e.target.closest("[data-related]");if(related){openProduct(related.dataset.related);return}const sizeButton=e.target.closest('[data-size]');if(sizeButton&&selectedProduct&&sizesOf(selectedProduct).includes(sizeButton.dataset.size)){selectedSize=sizeButton.dataset.size;document.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.size===selectedSize)));document.getElementById('sizeHint').textContent=`Выбран ${variantLabel(selectedProduct)} ${selectedSize}`;document.getElementById('detailStock').textContent=stockLabel(selectedProduct,selectedSize);}const action=e.target.closest("[data-action]")?.dataset.action;if(action==="share")shareSelectedProduct();if(action==="add-cart")addToCart();if(action==="wishlist")toggleWishlist(selectedProduct?.id);if(action==="open-cart")setTab("cart");if(action==="contact")contact(selectedProduct);if(action==="sourcing")contact(null,"manager_search_product",selectedProduct?.id);const b=e.target.closest("[data-photo]");if(b){const img=document.querySelector(".hero img");if(img){img.hidden=false;img.src=b.dataset.photo;img.parentElement.querySelector(".image-fallback")?.remove()}}});
let telegramInitialized=false;
function initializeTelegram(){
  syncWebNavigation();
  const tg=window.Telegram?.WebApp;if(!tg||telegramInitialized)return;telegramInitialized=true;
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
  // A late SDK must still honour a Telegram-only product deep link.
  const start=tg.initDataUnsafe?.start_param;
  if(!firstLoad&&navigationRevision===0&&start?.startsWith('p_'))openLinkedProduct(start.slice(2));
}
document.addEventListener('load',e=>{if(e.target.id==='telegramSdk')initializeTelegram()},true);
initializeTelegram();
const cachedCatalogue=readCatalogueCache();
if(cachedCatalogue)products=cachedCatalogue;
render();
loadProducts(Boolean(cachedCatalogue));

// Retry transient image failures once per URL, then show an explicit status.
const productImageAttempts=new WeakMap();
const productImageAreas='.photo,.hero,.related-photo,.photo-picker,.cart-photo,.color-option';
function handleProductImageError(e){
 const img=e.target;if(img.tagName!=='IMG'||!img.closest(productImageAreas))return;
 const parent=img.parentElement,src=img.getAttribute('src'),previous=productImageAttempts.get(img);
 const base=previous?.retry===src?previous.original:src;
 if(safeProductImage(base)&&previous?.retry!==src){
  const url=new URL(base,location.href||'https://juliproz-store.vercel.app');url.searchParams.set('jp_retry',Date.now().toString());
  productImageAttempts.set(img,{original:base,retry:url.href});img.src=url.href;return;
 }
 img.hidden=true;
 if(!parent.querySelector('.image-fallback')){const placeholder=document.createElement('span');placeholder.className='image-fallback';placeholder.textContent='Фото не загрузилось';placeholder.setAttribute('role','status');parent.appendChild(placeholder)}
}
function handleProductImageLoad(e){const img=e.target;if(img.tagName==='IMG'&&img.closest(productImageAreas)){img.hidden=false;img.parentElement.querySelector('.image-fallback')?.remove()}}
document.addEventListener('error',handleProductImageError,true);
document.addEventListener('load',handleProductImageLoad,true);
function refreshCatalogOnReturn(){if(Date.now()-lastCatalogLoadedAt>=60000)loadProducts(true)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCatalogOnReturn()});
window.addEventListener?.('focus',refreshCatalogOnReturn);
// Long-lived Telegram views also receive edits without closing or reloading.
window.setInterval?.(()=>{if(document.visibilityState==='visible')refreshCatalogOnReturn()},60000);

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
enablePhotoSwipes(grid,'.photo',area=>catalogueProducts().find(p=>String(p.id)===area.closest('[data-id]').dataset.id));
enablePhotoSwipes(document.getElementById('productContent'),'.hero',()=>selectedProduct);

// Clear finite feedback effects so subsequent taps animate again.
document.addEventListener('animationend',e=>{if(e.animationName==='jp-pop')e.target.classList.remove('motion-pop')});

// Keep the original controls (and their focus/handlers) reachable after the masthead scrolls away.
if(typeof IntersectionObserver==='function'){
  const masthead=document.querySelector('.brand');
  if(masthead)new IntersectionObserver(entries=>{
    const entry=entries[0];
    masthead.classList.toggle('menu-floating',!entry.isIntersecting&&entry.boundingClientRect.top<0);
  },{threshold:0}).observe(masthead);
}

// Language changes retain filters, bag, wishlist and the selected variant.
document.addEventListener('site-language-change',()=>{window.SiteLanguage?.apply();});

document.addEventListener("click",event=>{if(event.target.closest('a[data-contact-event="manager_general"]'))window.StoreAnalytics?.track("manager_general")});
