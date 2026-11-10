'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{issues}=require('../product-quality.js');
test('quality hints use unique photos and factual missing fields without guessing names or prices',()=>{
 assert.deepEqual(issues({name:'Кроссовки Air Force 1',description:'Кожа; комплект.',photos:['a','b'],price:null}),[]);
 assert.deepEqual(issues({name:'  КРОССОВКИ ',product_condition:'pre_owned',image_url:'a',photos:['a']}).map(i=>i.code),['name','description','wear','photos']);
 assert.equal(issues({name:'Кольцо Trinity',description:'Золото',product_condition:'pre_owned',wear_condition:'like_new',photos:['a','b']}).length,0);
 assert.equal(issues({name:'Одно слово',description:'Описание',photos:['a','b']}).some(i=>i.code==='name'),false);
});
test('quality flags missing translation, unconfirmed price mode and category-specific sizes',()=>{
 const p={name:'Лоферы Summer Walk',description:'Замша.',photos:['a','b'],category:'Обувь',price:'',price_on_request:false,missing_translations:['description']};
 assert.deepEqual(issues(p).map(x=>x.code),['description_en','price_request','size']);
 assert.deepEqual(issues({...p,size:'42',price_on_request:true,missing_translations:[]}),[]);
 assert.deepEqual(issues({...p,category:'Сумки',price:null,price_on_request:true,missing_translations:[]}),[]);
 assert.equal(issues({...p,price:0}).some(x=>x.code==='price'),true);
 assert.equal(issues({...p,price:'bad'}).some(x=>x.code==='price'),true);
 assert.equal(issues({...p,price:900,size:'42',missing_translations:[]}).some(x=>x.code.startsWith('price')),false);
});
