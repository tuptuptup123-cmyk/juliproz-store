(function(root){
 'use strict';
 const channels={checkout_open:'Оформление корзины',manager_product:'Вопрос о конкретном товаре',manager_search_product:'Поиск вещи / комиссия из карточки',manager_general:'Общий вопрос',manager_sell:'Предложить свою вещь',manager_authentication:'Аутентификация',manager_atelier:'Ателье / спа / обслуживание',manager_open:'Старые переходы — источник не определён'};
 const count=v=>Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>new Intl.NumberFormat('ru-RU').format(count(v));
 function table(headers,rows){return `<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
 const row=cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
 function render(data={}){
  const labels={active:'Сейчас в магазине',visitors:'Посетители за период',sessions:'Посещения',product_view:'Просмотры товаров',wishlist_add:'Добавления в вишлист',cart_add:'Добавления в корзину'};
  const cards=Object.entries(labels).map(([key,label])=>`<div class="stat"><span>${label}</span><strong>${num(data[key])}</strong></div>`).join('');
  const visitors=count(data.visitors),unique=data.event_visitors||{};
  const share=v=>visitors?`${Math.min(100,count(v)/visitors*100).toFixed(1).replace('.',',')}%`:'—';
  const contacts=table(['Назначение кнопки','Нажатия','Посетители','Доля посетителей'],Object.entries(channels).map(([key,label])=>row([label,num(data[key]),unique[key]==null?'—':num(unique[key]),unique[key]==null?'—':share(unique[key])])));
  const actions=table(['Действие','Нажатия','Посетители'],[['product_view','Просмотр товара'],['wishlist_add','Добавление в вишлист'],['wishlist_remove','Удаление из вишлиста'],['cart_add','Добавление в корзину'],['cart_remove','Удаление из корзины']].map(([key,label])=>row([label,num(data[key]),unique[key]==null?'—':num(unique[key])])));
  const products=table(['Товар','Просмотры','Вишлист','Корзина','Вопрос о товаре','Поиск / комиссия'],(Array.isArray(data.products)?data.products:[]).map(p=>row([`${esc(p.brand)} ${esc(p.name)} <small>№ ${esc(p.id)}</small>`,num(p.views),num(p.wishlist),num(p.cart),num(p.contacts),num(p.search_contacts)])));
  const days=table(['Дата','Посетители с событиями','Просмотры товаров','Добавления в корзину','Переходы в Telegram'],(Array.isArray(data.daily)?data.daily:[]).map(d=>row([esc(d.day),num(d.visitors),num(d.views),num(d.cart),num(d.contacts)])));
  return {cards,details:`<h3>Переходы в Telegram</h3><p class="field-help">Назначение кнопки показывает, откуда открыли Telegram. Отправку сообщения и покупку сайт не подтверждает. Посетители уникальны внутри каждой строки; складывать их нельзя.</p>${contacts}<h3>Интерес к товарам</h3>${actions}<h3>Популярные товары</h3><p class="field-help">До 20 товаров, по числу просмотров. Оформление корзины считается отдельно и не приписывается каждому товару как обращение.</p>${products}<h3>Динамика по дням</h3><p class="field-help">Часовой пояс: Бангкок, UTC+7. Период — последние 24 часа, 7 или 30 дней. Разбивка новых источников начинается с обновления; старые переходы сохранены отдельно.</p>${days}`};
 }
 root.AnalyticsReport={render,channels};if(typeof module==='object')module.exports=root.AnalyticsReport;
})(typeof window==='object'?window:globalThis);
