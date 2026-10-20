const {test}=require('node:test'),assert=require('node:assert/strict');
const {progress}=require('../admin-business.js');
test('profit target progress handles unknown amounts, losses and exceeded goals',()=>{
 assert.equal(progress(null,1000),0);assert.equal(progress(200,null),0);
 assert.equal(progress(-200,1000),0);assert.equal(progress(550,1000),55);assert.equal(progress(1300,1000),100);
});
