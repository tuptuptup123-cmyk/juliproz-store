const assert=require('node:assert/strict'),test=require('node:test');
const pricing=require('../product-pricing.js');
test('EUR unit amounts use nearest whole euros without converting foreign currencies',()=>{
 for(const [value,expected] of [[624.9,625],['624.9',625],[624.49,624],[624.5,625],[0,0],[0.49,0]]){
  for(const currency of ['EUR','€',undefined,null,''])assert.equal(pricing.amount(value,currency),expected);
 }
 for(const value of [null,undefined,'',NaN,Infinity,-1,-0.1,'invalid'])assert.equal(pricing.amount(value),null);
 assert.equal(pricing.amount(624.9,'USD'),624.9);
});
test('discount uses actual prices and never overstates the percentage',()=>{
 assert.equal(pricing.discount({price:800,original_price:1000}).label,'−20%');
 assert.equal(pricing.discount({price:799.99,original_price:1000}).percent,20);
 assert.equal(pricing.discount({price:99.99,original_price:100}),null);
 assert.equal(pricing.discount({price:999,original_price:1000}).label,'Скидка');
 assert.equal(pricing.discount({price:624.9,original_price:899.7}).label,'−30%');
 assert.equal(pricing.discount({price:99.99,original_price:100,currency:'USD'}).label,'Скидка');
 assert.equal(pricing.discount({price:0,original_price:100}).label,'−100%');
 for(const original_price of [null,'',0,80,-1,NaN,Infinity])assert.equal(pricing.discount({price:100,original_price}),null);
 assert.equal(pricing.discount({price:null,original_price:100}),null);
});
test('discount validation rejects incomplete or misleading old prices',()=>{
 pricing.validate(null,null);pricing.validate(100,80);
 for(const pair of [[100,null],[100,100],[80,100],[Infinity,10],[100,-1],[100,99.99]])assert.throws(()=>pricing.validate(...pair),/Цена до скидки/);
 pricing.validate(100,99.99,'USD');
});
test('former price is marked semantically and all formatted prices are escaped',()=>{
 const format=p=>'<'+p.currency+':'+p.price+'>',escape=s=>s.replaceAll('<','&lt;').replaceAll('>','&gt;');
 const html=pricing.markup({price:800,original_price:1000,currency:'EUR'},format,escape);
 assert.match(html,/<del class="price-original"/);assert.match(html,/−20%/);assert.match(html,/&lt;EUR:1000&gt;/);assert.doesNotMatch(html,/<EUR/);
 assert.equal(pricing.markup({price:800,currency:'EUR'},format,escape),'&lt;EUR:800&gt;');
 const rounded=pricing.markup({price:624.9,original_price:899.7,currency:'EUR'},format,escape);
 assert.match(rounded,/&lt;EUR:625&gt;/);assert.match(rounded,/&lt;EUR:900&gt;/);assert.match(rounded,/−30%/);
 assert.doesNotMatch(pricing.markup({price:99.99,original_price:100,currency:'EUR'},format,escape),/price-original|discount-badge/);
});
