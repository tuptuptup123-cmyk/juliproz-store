(function(root){
 'use strict';
 const channels={checkout_open:'Оформление корзины',manager_product:'Вопрос о конкретном товаре',manager_search_product:'Поиск вещи / комиссия из карточки',manager_general:'Общий вопрос',manager_sell:'Предложить свою вещь',manager_authentication:'Аутентификация',manager_atelier:'Ателье / спа / обслуживание',manager_open:'Старые переходы — источник не определён'};
 const count=v=>Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>new Intl.NumberFormat('ru-RU').format(count(v));
 function table(headers,rows){return `<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
 const row=cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;

 const metrics={visitors:'Посетители с событиями',views:'Просмотры товаров',cart:'Добавления в корзину',contacts:'Переходы к менеджеру'};
 function chart(data={},metric='visitors'){
  if(!Object.hasOwn(metrics,metric))metric='visitors';
  const daily=(Array.isArray(data.daily)?data.daily:[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d.day))).slice().sort((a,b)=>a.day.localeCompare(b.day));
  if(!daily.length)return '<div class="chart-empty"><span aria-hidden="true">↗</span><p>Пока нет данных по дням</p><small>График появится, когда накопится статистика.</small></div>';
  const max=Math.max(1,...daily.map(d=>count(d[metric]))),ceiling=max<=4?max:Math.ceil(max/4)*4;
  const x=i=>52+(daily.length===1?304:i/(daily.length-1)*608),y=v=>210-count(v)/ceiling*172;
  const points=daily.map((d,i)=>`${x(i).toFixed(2)},${y(d[metric]).toFixed(2)}`).join(' ');
  const path=daily.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(d[metric]).toFixed(2)}`).join(' ');
  const label=day=>day.slice(8,10)+'.'+day.slice(5,7),step=Math.max(1,Math.ceil((daily.length-1)/6));
  const ticks=[...new Set([0,Math.round(ceiling/2),ceiling])];
  const grid=ticks.map(v=>`<line x1="52" x2="660" y1="${y(v)}" y2="${y(v)}" class="chart-grid-line"/><text x="42" y="${y(v)+4}" text-anchor="end">${num(v)}</text>`).join('');
  const dots=daily.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d[metric])}" r="4" tabindex="0" aria-label="${esc(d.day)}: ${num(d[metric])}"><title>${esc(d.day)} · ${metrics[metric]}: ${num(d[metric])}</title></circle>${i%step===0||i===daily.length-1?`<text x="${x(i)}" y="238" text-anchor="middle">${label(d.day)}</text>`:''}`).join('');
  return `<svg class="analytics-line-chart" viewBox="0 0 712 252" role="img" aria-label="${metrics[metric]} по дням"><title>${metrics[metric]} по дням</title>${grid}<path d="${path} L${x(daily.length-1)},210 L${x(0)},210 Z" class="chart-area"/><polyline points="${points}" class="chart-line"/>${dots}</svg><p class="dashboard-note chart-caption">${metrics[metric]}. Наведите на точку или выберите её клавишей Tab, чтобы увидеть значение.</p>`;
 }
 function contactBars(data,unique,share){
  const entries=Object.entries(channels).filter(([key])=>count(data[key])>0),max=Math.max(1,...entries.map(([key])=>count(data[key])));
  if(!entries.length)return '<p class="dashboard-empty">Переходов за этот период пока нет.</p>';
  return entries.map(([key,label])=>`<div class="contact-bar"><div><span>${label}</span><strong>${num(data[key])}</strong></div><div class="report-track" aria-hidden="true"><span style="width:${count(data[key])/max*100}%"></span></div><small>${unique[key]==null?'Уникальные посетители не определены':num(unique[key])+' посетителей · '+share(unique[key])}</small></div>`).join('');
 }
 function interest(data){
  const groups=[['wishlist_add','Вишлист','#c66b95'],['cart_add','Корзина','#202020'],['checkout_open','Оформление','#e1c6d7']],total=groups.reduce((s,[key])=>s+count(data[key]),0);
  let offset=0;const rings=groups.map(([key,label,color])=>{const portion=total?count(data[key])/total*100:0;const part=`<circle cx="60" cy="60" r="44" fill="none" stroke="${color}" stroke-width="10" pathLength="100" stroke-dasharray="${portion} ${100-portion}" stroke-dashoffset="-${offset}" transform="rotate(-90 60 60)"/>`;offset+=portion;return part}).join('');
  return `<div class="interest-summary"><svg viewBox="0 0 120 120" role="img" aria-label="Вишлист, корзина и оформление: ${num(total)} действий"><circle cx="60" cy="60" r="44" fill="none" stroke="#f1f1f1" stroke-width="10"/>${total?rings:''}<text x="60" y="61" text-anchor="middle" class="ring-number">${num(total)}</text><text x="60" y="78" text-anchor="middle" class="ring-label">действий</text></svg><div>${groups.map(([key,label,color])=>`<div class="interest-legend"><span><i style="background:${color}" aria-hidden="true"></i>${label}</span><strong>${num(data[key])}</strong></div>`).join('')}</div></div><p class="dashboard-note">Количество действий, включая повторные. Оформление — открытие чата с менеджером из корзины.</p>`;
 }
 function ranking(data){
  const products=(Array.isArray(data.products)?data.products:[]).slice().sort((a,b)=>count(b.views)-count(a.views)).slice(0,5),max=Math.max(1,...products.map(p=>count(p.views)));
  return products.length?'<ol class="product-ranking">'+products.map((p,i)=>`<li><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-product"><strong>${esc(p.brand)}</strong><span>${esc(p.name)}</span><div class="report-track" aria-hidden="true"><span style="width:${count(p.views)/max*100}%"></span></div><small>№ ${esc(p.id)} · ♡ ${num(p.wishlist)} · корзина ${num(p.cart)}</small></div><span class="rank-value"><strong>${num(p.views)}</strong><small>просмотров</small></span></li>`).join('')+'</ol>':'<p class="dashboard-empty">Просмотров товаров пока нет.</p>';
 }

 function render(data={}){
  const labels={active:'Сейчас в магазине',visitors:'Посетители за период',sessions:'Посещения',product_view:'Просмотры товаров',wishlist_add:'Добавления в вишлист',cart_add:'Добавления в корзину'};
  const cards=Object.entries(labels).map(([key,label])=>`<div class="stat"><span>${label}</span><strong>${num(data[key])}</strong></div>`).join('');
  const visitors=count(data.visitors),unique=data.event_visitors||{};
  const share=v=>visitors?`${Math.min(100,count(v)/visitors*100).toFixed(1).replace('.',',')}%`:'—';
  const contacts=table(['Назначение кнопки','Нажатия','Посетители','Доля посетителей'],Object.entries(channels).map(([key,label])=>row([label,num(data[key]),unique[key]==null?'—':num(unique[key]),unique[key]==null?'—':share(unique[key])])));
  const actions=table(['Действие','Нажатия','Посетители'],[['product_view','Просмотр товара'],['wishlist_add','Добавление в вишлист'],['wishlist_remove','Удаление из вишлиста'],['cart_add','Добавление в корзину'],['cart_remove','Удаление из корзины']].map(([key,label])=>row([label,num(data[key]),unique[key]==null?'—':num(unique[key])])));
  const channelClicks=table(['Telegram-канал','Нажатия','Посетители'],Object.entries({channel_julia_main:'Юля · основной',channel_julia_outlet:'Юля · аутлет',channel_vasya_main:'Вася · основной',channel_vasya_outlet:'Вася · аутлет'}).map(([key,label])=>row([label,num(data[key]),unique[key]==null?'—':num(unique[key])])));
  const products=table(['Товар','Просмотры','Вишлист','Корзина','Вопрос о товаре','Поиск / комиссия'],(Array.isArray(data.products)?data.products:[]).map(p=>row([`${esc(p.brand)} ${esc(p.name)} <small>№ ${esc(p.id)}</small>`,num(p.views),num(p.wishlist),num(p.cart),num(p.contacts),num(p.search_contacts)])));
  const days=table(['Дата','Посетители с событиями','Просмотры товаров','Добавления в корзину','Переходы к менеджеру'],(Array.isArray(data.daily)?data.daily:[]).map(d=>row([esc(d.day),num(d.visitors),num(d.views),num(d.cart),num(d.contacts)])));
  return {cards,details:`<section class="dashboard-card"><div class="dashboard-card-heading"><h2>Клики по Telegram-каналам</h2></div>${channelClicks}<p class="dashboard-note">Нажатия посетителей, согласившихся на статистику. Это переходы по ссылкам, а не подтверждённые вступления. Вступления смотрите в Telegram. Данные появляются с момента обновления.</p></section><div class="analytics-visual-grid"><section class="dashboard-card interest-card"><div class="dashboard-card-heading"><h2>Интерес к коллекции</h2><span class="dashboard-note">Действия</span></div>${interest(data)}</section><section class="dashboard-card contact-card"><div class="dashboard-card-heading"><h2>Переходы к менеджеру</h2><span class="dashboard-note">Нажатия</span></div>${contactBars(data,unique,share)}<p class="dashboard-note">Статистика не подтверждает отправку сообщения и покупку. Посетители уникальны внутри каждой строки; складывать их нельзя.</p></section><section class="dashboard-card ranking-card"><div class="dashboard-card-heading"><h2>Популярные товары</h2><span class="dashboard-note">Топ 5 · по просмотрам</span></div>${ranking(data)}</section></div><details class="analytics-data"><summary>Все данные <span>Источники, действия, товары и дни</span></summary><div class="analytics-data-content"><h3>Переходы к менеджеру</h3>${contacts}<h3>Интерес к товарам</h3>${actions}<h3>Популярные товары</h3><p class="dashboard-note">До 20 товаров. Оформление корзины не приписывается каждому товару как обращение.</p>${products}<h3>Динамика по дням</h3><p class="dashboard-note">Киев, Europe/Kyiv. Старые переходы сохранены отдельно.</p>${days}</div></details>`};

 }
 root.AnalyticsReport={render,chart,channels};if(typeof module==='object')module.exports=root.AnalyticsReport;
})(typeof window==='object'?window:globalThis);
