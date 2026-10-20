const {test}=require('node:test'),assert=require('node:assert/strict');
const {amount,margin,balance,missingFields,knownTotal}=require('../admin-finance.js');
test('unknown amounts remain unknown, while an explicit zero is valid',()=>{assert.equal(amount(''),null);assert.equal(amount(null),null);assert.equal(amount('  '),null);assert.equal(amount('0'),0);assert.equal(amount('1000'),1000);for(const n of ['NaN','Infinity',-1,1.5,1000000000])assert.throws(()=>amount(n))});
test('commission income subtracts the full owner obligation rather than paid cash only',()=>{assert.equal(margin({on_commission:true,amount:2000,owner_due:1400,owner_paid:500,purchase_cost:1,expenses:100}),500);assert.equal(margin({on_commission:true,amount:2000,owner_due:null,expenses:0}),null)});
test('profit preserves missing costs and real losses',()=>{assert.equal(margin({amount:100,purchase_cost:null,expenses:0}),null);assert.equal(margin({amount:100,purchase_cost:70,expenses:null}),null);assert.equal(margin({amount:100,purchase_cost:120,expenses:0}),-20)});
test('client balance distinguishes an unknown payment from an unpaid order',()=>{assert.equal(balance({amount:1000,received:null}),null);assert.equal(balance({amount:1000,received:0}),1000);assert.equal(balance({amount:1000,received:300}),700)});
test('completion identifies missing facts without treating explicit zero as missing',()=>{
 assert.deepEqual(missingFields({status:'completed',received:0,purchase_cost:0,expenses:0}),[]);
 assert.deepEqual(missingFields({status:'completed',received:null,purchase_cost:null,expenses:null}),['полученная оплата','закупка','расходы']);
 assert.deepEqual(missingFields({status:'active',on_commission:true,received:0,expenses:0,owner_ref:' ',owner_due:0,owner_paid:null}),['владелец вещи','выплачено владельцу']);
 assert.deepEqual(missingFields({status:'cancelled',received:0}),[]);
 assert.deepEqual(missingFields({status:'cancelled',received:null}),['оплата после возврата']);
 assert.deepEqual(missingFields({status:'linked'}),[]);
});
test('a wholly unknown aggregate is not displayed as a confirmed zero',()=>{
 assert.equal(knownTotal(0,6,6),null);assert.equal(knownTotal(0,0,0),0);
 assert.equal(knownTotal(0,6,0),0);assert.equal(knownTotal(150,6,4),150);
});
