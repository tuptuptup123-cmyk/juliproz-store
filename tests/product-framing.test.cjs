const {test}=require('node:test'),assert=require('node:assert/strict');
const {alphaBounds,placement}=require('../product-framing.js');
test('opaque photos are preserved; white cutouts are measured by alpha only',()=>{
  const opaque=new Uint8ClampedArray(40*40*4).fill(255);
  assert.equal(alphaBounds(opaque,40,40),null);
  const cutout=new Uint8ClampedArray(40*40*4);
  for(let y=12;y<28;y++)for(let x=2;x<10;x++)cutout.set([255,255,255,255],(y*40+x)*4);
  assert.deepEqual(alphaBounds(cutout,40,40),{left:1/40,top:11/40,width:10/40,height:18/40});
});
test('different embedded margins produce identical object size and centre',()=>{
  const first={left:.1,top:.2,width:.4,height:.4};
  const second={left:.2,top:.4,width:.2,height:.2};
  for(const [width,height] of [[160,200],[390,390],[260,325]]){
    const a=placement(first,1000,1000,width,height),b=placement(second,2000,2000,width,height);
    const fit=Math.min(width,height);
    assert.ok(Math.abs(first.width*fit*a.scale-second.width*fit*b.scale)<1e-8);
    for(const [bounds,result] of [[first,a],[second,b]]){
      const cx=(bounds.left+bounds.width/2-.5)*fit*result.scale+result.x;
      const cy=(bounds.top+bounds.height/2-.5)*fit*result.scale+result.y;
      assert.ok(Math.abs(cx)<1e-8&&Math.abs(cy)<1e-8);
      assert.ok(bounds.width*fit*result.scale<=width*.84+1e-8);
      assert.ok(bounds.height*fit*result.scale<=height*.84+1e-8);
    }
  }
});
test('portrait and landscape products fit with minimum margins, including resize',()=>{
  for(const [nw,nh] of [[2000,500],[500,2000]])for(const [w,h] of [[160,200],[600,450]]){
    const bounds={left:.2,top:.1,width:.7,height:.8},r=placement(bounds,nw,nh,w,h),fit=Math.min(w/nw,h/nh);
    assert.ok(nw*fit*bounds.width*r.scale<=w*.84+1e-8);
    assert.ok(nh*fit*bounds.height*r.scale<=h*.84+1e-8);
  }
  assert.equal(placement(null,100,100,100,100),null);
  assert.equal(placement({left:0,top:0,width:1,height:1},100,100,0,100),null);
});
