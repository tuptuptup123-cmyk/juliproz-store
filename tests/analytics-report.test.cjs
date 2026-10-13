const {test}=require('node:test'),assert=require('node:assert/strict');
const {render}=require('../analytics-report.js');
test('contact sources retain historical unknown clicks and distinct visitors without inventing sales',()=>{
 const report=render({visitors:10,checkout_open:8,manager_search_product:3,manager_open:12,event_visitors:{checkout_open:2,manager_search_product:1},products:[]});
 assert.match(report.details,/Оформление корзины<\/td><td>8<\/td><td>2<\/td><td>20,0%/);
 assert.match(report.details,/источник не определён<\/td><td>12<\/td><td>—/);
 assert.match(report.details,/Отправку сообщения и покупку сайт не подтверждает/);
 assert.doesNotMatch(report.details,/NaN|Infinity/);
});
test('report escapes product names and handles empty or invalid counts',()=>{
 const report=render({active:Infinity,visitors:0,products:[{id:'<img>',brand:'<script>',name:'" onerror="x',views:-3}],daily:[{day:'<script>'}]});
 assert.doesNotMatch(report.details,/<script>|<img>/);assert.match(report.details,/&lt;script&gt;/);assert.doesNotMatch(report.cards,/Infinity/);
 assert.doesNotThrow(()=>render());
});

test('daily chart preserves every available day, sorts dates and switches metrics',()=>{
 const {chart}=require('../analytics-report.js');
 const daily=[{day:'2026-10-13',visitors:10,cart:3},{day:'2026-10-11',visitors:0,cart:1},{day:'2026-10-12',visitors:5,cart:2}];
 const svg=chart({daily},'cart');
 assert.match(svg,/Добавления в корзину по дням/);
 assert.equal((svg.match(/<circle /g)||[]).length,3);
 assert.ok(svg.indexOf('2026-10-11: 1')<svg.indexOf('2026-10-13: 3'));
 assert.doesNotMatch(svg,/NaN|Infinity/);
 assert.match(chart({daily:[]}),/Пока нет данных/);
 assert.doesNotMatch(chart({daily:[{day:'2026-10-13',cart:0}]},'cart'),/NaN|Infinity/);
});
test('visual summary keeps zero states and detailed sources without fabricated targets',()=>{
 const {render}=require('../analytics-report.js'),report=render({visitors:0,products:[],daily:[]});
 assert.match(report.details,/analytics-data/);assert.match(report.details,/Переходов за этот период пока нет/);
 assert.match(report.details,/Просмотров товаров пока нет/);assert.doesNotMatch(report.details,/NaN|Infinity/);
});
