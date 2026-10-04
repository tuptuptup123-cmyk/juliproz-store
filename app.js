const SUPABASE_URL="https://qhgzzhgxwpcctafpzjid.supabase.co";
const SUPABASE_KEY="sb_publishable_AD6Hie5z_KycK1unCJ-Khg_5d0gjGq_";

let products=[];
let state={category:null,brand:null,size:null,search:"",favorites:new Set(JSON.parse(localStorage.getItem("jpFav")||"[]")),tab:"catalog"};
const grid=document.getElementById("grid"),count=document.getElementById("count"),sheet=document.getElementById("sheet"),options=document.getElementById("sheetOptions");
let currentFilter=null,tempValue=null;

function money(p){
  if(p.price===null||p.price===undefined||p.price==="") return "";
  const symbols={EUR:"€",USD:"$",GBP:"£",AED:"AED",RUB:"₽"};
  const cur=(p.currency||"").toUpperCase();
  const n=Number(p.price);
  const amount=Number.isFinite(n)?new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n):p.price;
  return symbols[cur]?`${symbols[cur]} ${amount}`:`${amount}${cur?` ${cur}`:""}`;
}
function imageOf(p){return p.image_url||p.image||""}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function valuesFor(type){
  return ["Все",...Array.from(new Set(products.map(p=>p[type]).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),"ru"))];
}
function filtered(){
  return products.filter(p=>(state.tab!=="favorites"||state.favorites.has(Number(p.id)))&&(!state.category||p.category===state.category)&&(!state.brand||p.brand===state.brand)&&(!state.size||p.size===state.size)&&(`${p.brand||""} ${p.name||""}`.toLowerCase().includes(state.search.toLowerCase())))
}
function render(){
  const list=filtered();
  count.textContent=state.tab==="favorites"?`Избранное · ${list.length}`:`В наличии ${list.length} ${list.length===1?"товар":list.length>=2&&list.length<=4?"товара":"товаров"}`;
  grid.innerHTML=list.length?list.map(p=>`<article class="product" data-id="${p.id}"><div class="photo">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}">`:"J.P"}</div><button class="heart" data-heart="${p.id}">${state.favorites.has(Number(p.id))?"♥":"♡"}</button><h3>${esc(p.brand)}</h3><p>${esc(p.name)}${p.size?` · ${esc(p.size)}`:""}</p><div class="price">${esc(money(p))}</div></article>`).join(""):`<div class="empty">Здесь пока ничего нет</div>`;
}
async function loadProducts(){
  count.textContent="Загружаем наличие…";
  grid.innerHTML='<div class="empty">Загружаем товары…</div>';
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&available=eq.true&order=created_at.desc`,{
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
    });
    if(!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    products=await r.json();
    render();
  }catch(e){
    console.error(e);
    count.textContent="Не удалось загрузить наличие";
    grid.innerHTML='<div class="empty">Не удалось загрузить товары. Обновите страницу чуть позже.</div>';
  }
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
  const h=e.target.closest("[data-heart]");
  if(h){e.stopPropagation();const id=Number(h.dataset.heart);state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);localStorage.setItem("jpFav",JSON.stringify([...state.favorites]));render();return}
  const card=e.target.closest("[data-id]");if(card)openProduct(Number(card.dataset.id));
};
function openProduct(id){
  const p=products.find(x=>Number(x.id)===id);if(!p)return;
  document.getElementById("productContent").innerHTML=`<div class="hero">${imageOf(p)?`<img src="${esc(imageOf(p))}" alt="${esc(p.name)}">`:"J.P"}</div><div class="detail"><div class="brandname">${esc(p.brand)}</div><h1>${esc(p.name)}</h1><div class="detail-price">${esc(money(p))}</div><div class="spec"><span>Категория</span><b>${esc(p.category||"—")}</b></div><div class="spec"><span>Размер</span><b>${esc(p.size||"—")}</b></div>${p.description?`<div class="spec"><span>Описание</span><b>${esc(p.description)}</b></div>`:""}<button class="primary buy" onclick="contact()">Купить / Написать менеджеру</button></div>`;
  document.getElementById("productModal").classList.remove("hidden");
}
document.getElementById("backProduct").onclick=()=>document.getElementById("productModal").classList.add("hidden");
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");render()});
function contact(){window.open("https://t.me/juliproz","_blank")}
document.getElementById("chatBtn").onclick=contact;
if(window.Telegram?.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand()}
loadProducts();
