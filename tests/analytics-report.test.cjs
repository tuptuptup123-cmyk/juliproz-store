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
