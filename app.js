const products=[
{id:1,brand:"HERMÈS",name:"Kelly 25",category:"Сумки",size:"25 см",price:"€ 28 500",color:"Etoupe",image:""},
{id:2,brand:"CHANEL",name:"Classic Flap",category:"Сумки",size:"Medium",price:"€ 10 900",color:"Black",image:""},
{id:3,brand:"GOLDEN GOOSE",name:"Super-Star",category:"Обувь",size:"38",price:"€ 590",color:"White",image:""},
{id:4,brand:"PRADA",name:"Кардиган",category:"Одежда",size:"S",price:"€ 1 490",color:"Cream",image:""},
{id:5,brand:"GUCCI",name:"Лоферы",category:"Обувь",size:"39",price:"€ 790",color:"Black",image:""},
{id:6,brand:"JIL SANDER",name:"Пальто",category:"Одежда",size:"M",price:"€ 1 250",color:"Camel",image:""}
];
let state={category:null,brand:null,size:null,search:"",favorites:new Set(JSON.parse(localStorage.getItem("jpFav")||"[]")),tab:"catalog"};
const grid=document.getElementById("grid"),count=document.getElementById("count"),sheet=document.getElementById("sheet"),options=document.getElementById("sheetOptions");
let currentFilter=null,tempValue=null;
const values={category:["Все","Сумки","Одежда","Обувь","Украшения","Часы","Аксессуары"],brand:["Все","HERMÈS","CHANEL","GUCCI","PRADA","GOLDEN GOOSE","JIL SANDER","LORO PIANA","MESSIKA","CARTIER"],size:["Все","XS","S","M","L","35","36","37","38","39","40","41","25 см","Medium"]};
function filtered(){return products.filter(p=>(state.tab!=="favorites"||state.favorites.has(p.id))&&(!state.category||p.category===state.category)&&(!state.brand||p.brand===state.brand)&&(!state.size||p.size===state.size)&&(`${p.brand} ${p.name}`.toLowerCase().includes(state.search.toLowerCase())))}
function render(){const list=filtered();count.textContent=state.tab==="favorites"?`Избранное · ${list.length}`:`В наличии ${list.length} товара`;grid.innerHTML=list.length?list.map(p=>`<article class="product" data-id="${p.id}"><div class="photo">${p.image?`<img src="${p.image}">`:"J.P"}</div><button class="heart" data-heart="${p.id}">${state.favorites.has(p.id)?"♥":"♡"}</button><h3>${p.brand}</h3><p>${p.name}${p.size?` · ${p.size}`:""}</p><div class="price">${p.price}</div></article>`).join(""):`<div class="empty">Здесь пока ничего нет</div>`}
document.getElementById("search").oninput=e=>{state.search=e.target.value;render()};
document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>openFilter(b.dataset.filter));
function openFilter(type){currentFilter=type;tempValue=state[type];document.getElementById("sheetTitle").textContent={category:"Категория",brand:"Бренд",size:"Размер"}[type];options.innerHTML=values[type].map(v=>`<button class="${(tempValue===v||(!tempValue&&v==="Все"))?"selected":""}" data-v="${v}">${v}</button>`).join("");sheet.classList.remove("hidden")}
options.onclick=e=>{if(!e.target.dataset.v)return;tempValue=e.target.dataset.v==="Все"?null:e.target.dataset.v;[...options.children].forEach(x=>x.classList.toggle("selected",(tempValue===x.dataset.v)||(!tempValue&&x.dataset.v==="Все")))};
document.getElementById("applyFilter").onclick=()=>{state[currentFilter]=tempValue;sheet.classList.add("hidden");render()};
document.getElementById("closeSheet").onclick=()=>sheet.classList.add("hidden");
document.getElementById("reset").onclick=()=>{state.category=state.brand=state.size=null;state.search="";document.getElementById("search").value="";render()};
grid.onclick=e=>{const h=e.target.closest("[data-heart]");if(h){e.stopPropagation();const id=+h.dataset.heart;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);localStorage.setItem("jpFav",JSON.stringify([...state.favorites]));render();return}const card=e.target.closest("[data-id]");if(card)openProduct(+card.dataset.id)};
function openProduct(id){const p=products.find(x=>x.id===id);document.getElementById("productContent").innerHTML=`<div class="hero">${p.image?`<img src="${p.image}">`:"J.P"}</div><div class="detail"><div class="brandname">${p.brand}</div><h1>${p.name}</h1><div class="detail-price">${p.price}</div><div class="spec"><span>Категория</span><b>${p.category}</b></div><div class="spec"><span>Размер</span><b>${p.size}</b></div><div class="spec"><span>Цвет</span><b>${p.color}</b></div><button class="primary buy" onclick="contact()">Купить / Написать менеджеру</button></div>`;document.getElementById("productModal").classList.remove("hidden")}
document.getElementById("backProduct").onclick=()=>document.getElementById("productModal").classList.add("hidden");
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");render()});
function contact(){window.open("https://t.me/juliproz","_blank")}
document.getElementById("chatBtn").onclick=contact;
if(window.Telegram?.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand()}
render();