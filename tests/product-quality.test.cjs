'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{issues}=require('../product-quality.js');
test('quality hints use unique photos and factual missing fields without guessing names or prices',()=>{
 assert.deepEqual(issues({name:'Кроссовки Air Force 1',description:'Кожа; комплект.',photos:['a','b'],price:null}),[]);
 assert.deepEqual(issues({name:'  КРОССОВКИ ',product_condition:'pre_owned',image_url:'a',photos:['a']}).map(i=>i.code),['name','description','wear','photos']);
 assert.equal(issues({name:'Кольцо Trinity',description:'Золото',product_condition:'pre_owned',wear_condition:'like_new',photos:['a','b']}).length,0);
 assert.equal(issues({name:'Одно слово',description:'Описание',photos:['a','b']}).some(i=>i.code==='name'),false);
});
