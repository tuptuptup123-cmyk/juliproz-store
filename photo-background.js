// Remove only the connected colour region selected by the editor user.
(function(root){
 function eraseRegion(source,mask,x,y,tolerance=18){
  const {width:w,height:h,data}=source;x=Math.floor(x);y=Math.floor(y);
  if(x<0||y<0||x>=w||y>=h||mask.width!==w||mask.height!==h)return 0;
  const start=y*w+x,target=[data[start*4],data[start*4+1],data[start*4+2]],seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0,count=0;
  const limit=Math.max(0,Math.min(80,Number(tolerance)||0));
  function push(p){if(seen[p])return;seen[p]=1;if(data[p*4+3]<10||Math.max(...target.map((v,c)=>Math.abs(data[p*4+c]-v)))>limit)return;queue[tail++]=p}
  push(start);
  while(head<tail){const p=queue[head++],px=p%w;if(mask.data[p*4+3])count++;mask.data[p*4+3]=0;if(px)push(p-1);if(px<w-1)push(p+1);if(p>=w)push(p-w);if(p<w*(h-1))push(p+w)}
  return count;
 }
 if(typeof module==='object'&&module.exports)module.exports={eraseRegion};else root.PhotoBackground={eraseRegion};
})(globalThis);
