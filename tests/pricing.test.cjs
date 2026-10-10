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

test('canonical prices preserve intended whole discounts within reference-price cent tolerance',()=>{
 for(const [price,original,percent] of [[400,571.43,30],[350,538.46,35],[220,338.46,35],[300,461.54,35],[580.27,1160.54,50],[1071.26,2142.52,50],[624.9,1249.8,50]]){
  const result=pricing.discount({price,original_price:original});assert.equal(result.percent,percent);assert.equal(result.current,Math.round(price));assert.equal(result.original,Math.round(original));
 }
 // No whole-percent inflation when a true fractional markdown is outside cent uncertainty.
 for(const [price,original,percent] of [[624.9,899.7,30],[400,570,29],[350,538,34],[800,1100,27]])assert.equal(pricing.discount({price,original_price:original}).percent,percent);
});
test('rounded cart snapshots retain an explicit canonical percentage basis',()=>{
 assert.equal(pricing.discount({price:350,original_price:538,price_basis:{price:350,original_price:538.46}}).percent,35);
 assert.equal(pricing.discount({price:625,original_price:1250,price_basis:{price:624.9,original_price:1249.8}}).percent,50);
 assert.equal(pricing.discount({price:400,original_price:570,price_basis:{price:350,original_price:538.46}}).percent,29,'Stale basis cannot override changed prices');
});

test('public markup can omit percentages without losing sale prices or discount math',()=>{
 const p={price:625,original_price:1249.8,currency:'EUR'},format=p=>'€ '+p.price,escape=s=>s;
 const html=pricing.markup(p,format,escape,{showPercentage:false});
 assert.match(html,/price-original/);assert.match(html,/€ 1250/);assert.match(html,/€ 625/);
 assert.doesNotMatch(html,/discount-badge|−49%/);
 assert.equal(pricing.discount(p).percent,49);
 assert.match(pricing.markup(p,format,escape),/discount-badge/,'Admin markup keeps its existing percentage information');
});
