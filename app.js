const SUPABASE_URL=window.STORE_CONFIG.url;
const SUPABASE_KEY=window.STORE_CONFIG.key;

let products=[];
let selectedProduct=null;
function productLink(p){return `https://t.me/JuliProzBot/shop?startapp=p_${encodeURIComponent(String(p.id))}`}
const CATALOG_FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,description,photos';
function photosOf(p){return [...new Set([p.image_url,p.image,...(Array.isArray(p.photos)?p.photos:[])].filter(safeProductImage))]}
function telegramLink(url){if(window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);else window.open(url,"_blank","noopener")}

let state={category:null,brand:null,size:null,search:"",favorites:new Set((()=>{try{return JSON.parse(localStorage.getItem("jpFav")||"[]").map(String)}catch{return []}})()),tab:"catalog"};
const grid=document.getElementById("grid"),count=document.getElementById("count"),sheet=document.getElementById("sheet"),options=document.getElementById("sheetOptions");
let currentFilter=null,tempValue=null;

function money(p){
  if(p.price===null||p.price===undefined||p.price==="") return "";
  const symbols={EUR:"€",USD:"$",GBP:"£",AED:"AED",RUB:"₽"};
  const cur=({"€":"EUR","$":"USD","£":"GBP","₽":"RUB"}[p.currency]||p.currency||"").toUpperCase();
  const n=Number(p.price);
  const amount=Number.isFinite(n)?new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n):p.price;
  return symbols[cur]?`${symbols[cur]} ${amount}`:`${amount}${cur?` ${cur}`:""}`;
}
function imageOf(p){return photosOf(p)[0]||""}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function valuesFor(type){
  return ["Все",...Array.from(new Set(products.map(p=>p[type]).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),"ru"))];
}
function filtered(){
  return products.filter(p=>(state.tab!=="favorites"||state.favorites.has(String(p.id)))&&(!state.category||p.category===state.category)&&(!state.brand||p.brand===state.brand)&&(!state.size||p.size===state.size)&&(`${p.brand||""} ${p.name||""} ${p.id} ${p.size||""}`.toLowerCase().includes(state.search.toLowerCase())))
}
function render(){
  document.querySelectorAll("[data-filter]").forEach(b=>{const type=b.dataset.filter;b.textContent=state[type]||{category:"Категория",brand:"Бренд",size:"Размер"}[type];b.classList.toggle("selected",!!state[type])});
  const list=filtered();
  count.textContent=state.tab==="favorites"?`Избранное · ${list.length}`:`В наличии ${list.length} ${list.length===1?"товар":list.length>=2&&list.length<=4?"товара":"товаров"}`;
  grid.innerHTML=list.length?list.map(p=>`<article class="product" tabindex="0" role="button" data-id="${esc(p.id)}"><div class="photo">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}" loading="lazy">`:"JP"}<button class="heart ${state.favorites.has(String(p.id))?"is-favorite":""}" aria-label="Избранное" aria-pressed="${state.favorites.has(String(p.id))}" data-heart="${esc(p.id)}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button></div><h3>${esc(p.brand)}</h3><p>${esc(p.name)}${p.size?` · ${esc(p.size)}`:""}</p><div class="price">${esc(money(p))}</div></article>`).join(""):`<div class="empty">Здесь пока ничего нет</div>`;
}
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
document.getElementById("search").oninput=e=>{state.search=e.target.value;render()};
document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>openFilter(b.dataset.filter));
function openFilter(type){
  currentFilter=type;tempValue=state[type];
  document.getElementById("sheetTitle").textContent={category:"Категория",brand:"Бренд",size:"Размер"}[type];
  options.innerHTML=valuesFor(type).map(v=>`<button class="${(tempValue===v||(!tempValue&&v==="Все"))?"selected":""}" data-v="${esc(v)}">${esc(v)}</button>`).join("");
  sheet.classList.remove("hidden");
}
options.onclick=e=>{if(!e.target.dataset.v)return;tempValue=e.target.dataset.v==="Все"?null:e.target.dataset.v;[...options.children].forEach(x=>x.classList.toggle("selected",(tempValue===x.dataset.v)||(!tempValue&&x.dataset.v==="Все")))};
document.getElementById("applyFilter").onclick=()=>{state[currentFilter]=tempValue;sheet.classList.add("hidden");render()};
document.getElementById("closeSheet").onclick=()=>sheet.classList.add("hidden");
document.getElementById("reset").onclick=()=>{state.category=state.brand=state.size=null;state.search="";document.getElementById("search").value="";render()};
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
  document.getElementById("productContent").innerHTML=`<div class="hero">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}" loading="lazy">`:"JP"}</div>${photosOf(p).length>1?`<div class="photo-picker">${photosOf(p).map(url=>`<button type="button" data-photo="${esc(url)}"><img src="${esc(url)}" alt="${esc(p.name)}"></button>`).join("")}</div>`:""}<div class="detail"><div class="brandname">${esc(p.brand)}</div><h1>${esc(p.name)}</h1><div class="detail-price">${esc(money(p))}</div><div class="spec"><span>Категория</span><b>${esc(p.category||"—")}</b></div><div class="spec"><span>Размер</span><b>${esc(p.size||"—")}</b></div>${p.description?`<div class="spec"><span>Описание</span><b>${esc(p.description)}</b></div>`:""}<button class="primary buy" data-action="contact">Купить / Написать менеджеру</button><button class="primary buy" data-action="share">Поделиться товаром</button><p id="shareStatus" role="status"></p></div>`;
  document.getElementById("productModal").classList.remove("hidden");
  document.getElementById("productModal").scrollTop=0;
}
document.getElementById("backProduct").onclick=()=>{selectedProduct=null;document.getElementById("productModal").classList.add("hidden")};
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
  document.getElementById("productContent").innerHTML='<div class="empty">Этот товар уже снят с наличия или ссылка недействительна.</div>';
  document.getElementById("productModal").classList.remove("hidden");
}
async function contact(p){
  if(p?.id!=null){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=${CATALOG_FIELDS}&id=eq.${encodeURIComponent(p.id)}&available=eq.true`,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const rows=await r.json();if(!rows.length){document.getElementById("shareStatus").textContent="Товар уже снят с наличия.";return}p=rows[0]}catch{document.getElementById("shareStatus").textContent="Не удалось проверить наличие. Попробуйте ещё раз.";return}}
  const text=p?.id!=null?`Здравствуйте! Меня интересует ${p.brand||""} ${p.name||""}${p.size?`, размер ${p.size}`:""}${money(p)?`. ${money(p)}`:""}\nАртикул: ${p.id}\n${productLink(p)}`:"";
  telegramLink(`https://t.me/juliproz${text?`?text=${encodeURIComponent(text)}`:""}`);
}
async function shareProduct(){
  if(!selectedProduct)return;
  const url=productLink(selectedProduct);
  try{await navigator.clipboard.writeText(url);document.getElementById("shareStatus").textContent="Ссылка скопирована"}
  catch{telegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`${selectedProduct.brand||""} ${selectedProduct.name||""}`)}`)}
}
document.getElementById("productContent").addEventListener("click",e=>{const action=e.target.closest("[data-action]")?.dataset.action;if(action==="contact")contact(selectedProduct);if(action==="share")shareProduct();const b=e.target.closest("[data-photo]");if(b){const img=document.querySelector(".hero img");if(img){img.hidden=false;img.src=b.dataset.photo;img.parentElement.querySelector(".image-fallback")?.remove()}}});
document.getElementById("chatBtn").onclick=()=>contact();
if(window.Telegram?.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand()}
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
