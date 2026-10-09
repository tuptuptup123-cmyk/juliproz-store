const {test}=require('node:test'),assert=require('node:assert/strict');
const {eraseRegion}=require('../photo-background.js');
function image(w,h,color){return {width:w,height:h,data:Uint8ClampedArray.from(Array.from({length:w*h},()=>color).flat())}}
test('selected white hole is erased without touching the white exterior or product boundary',()=>{
 const source=image(9,9,[255,255,255,255]),mask=image(9,9,[255,255,255,255]);
 for(let y=2;y<=6;y++)for(let x=2;x<=6;x++)if(x===2||x===6||y===2||y===6)source.data.set([60,40,30,255],(y*9+x)*4);
 assert.equal(eraseRegion(source,mask,4,4,18),9);
 assert.equal(mask.data[(4*9+4)*4+3],0);assert.equal(mask.data[(2*9+4)*4+3],255);assert.equal(mask.data[3],255);assert.equal(source.data[(4*9+4)*4+3],255);
});
test('sensitivity is bounded and invalid clicks do not edit the mask',()=>{
 const source=image(3,1,[255,255,255,255]),mask=image(3,1,[255,255,255,255]);source.data.set([230,230,230,255],4);source.data.set([10,10,10,255],8);
 assert.equal(eraseRegion(source,mask,-1,0,18),0);assert.equal(eraseRegion(source,mask,0,0,18),1);assert.equal(mask.data[7],255);assert.equal(eraseRegion(source,mask,0,0,30),1);assert.equal(mask.data[7],0);assert.equal(mask.data[11],255);
});
const {eraseBrush}=require('../photo-background.js');
test('background brush erases sampled colour only inside its radius',()=>{
 const source=image(7,3,[255,255,255,255]),mask=image(7,3,[255,255,255,255]);source.data.set([20,40,60,255],(1*7+4)*4);
 eraseBrush(source,mask,3,1,2,[255,255,255],18,0);
 assert.equal(mask.data[(1*7+3)*4+3],0);assert.equal(mask.data[(1*7+4)*4+3],255);assert.equal(mask.data[3],255);assert.equal(source.data[(1*7+3)*4+3],255);
});
test('protected colour wins over sampled background and soft brush retains boundary alpha',()=>{
 const source=image(9,3,[255,255,255,255]),mask=image(9,3,[255,255,255,255]);
 assert.equal(eraseBrush(source,mask,4,1,4,[255,255,255],18,.5,[255,255,255]),0);
 eraseBrush(source,mask,4,1,4,[255,255,255],18,.5);assert.equal(mask.data[(1*9+4)*4+3],0);assert.ok(mask.data[(1*9+7)*4+3]>0);assert.equal(mask.data[(1*9+8)*4+3],255);
});
