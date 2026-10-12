(function(root){
  'use strict';
  // Measure transparency, never colours: white products retain every detail.
  function alphaBounds(data,width,height){
    let left=width,top=height,right=-1,bottom=-1,transparent=false;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const alpha=data[(y*width+x)*4+3];
      if(alpha<255)transparent=true;
      if(alpha>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
    }
    if(!transparent||right<left)return null;
    // A one-pixel guard preserves antialiased edges and fine jewellery chains.
    left=Math.max(0,left-1);top=Math.max(0,top-1);
    right=Math.min(width-1,right+1);bottom=Math.min(height-1,bottom+1);
    return {left:left/width,top:top/height,width:(right-left+1)/width,height:(bottom-top+1)/height};
  }
  // Classify only opaque product pixels; transparent padding is not a colour.
  function isLightCutout(data){
    let clear=0,solid=0,light=0;
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]<8)clear++;
      if(data[i+3]>240){solid++;if(Math.min(data[i],data[i+1],data[i+2])>210)light++}
    }
    return clear>data.length/4*.08&&solid>0&&light/solid>.55;
  }
  function placement(bounds,naturalWidth,naturalHeight,width,height){
    if(!bounds||Math.min(naturalWidth,naturalHeight,width,height)<=0)return null;
    const fit=Math.min(width/naturalWidth,height/naturalHeight);
    const drawnWidth=naturalWidth*fit,drawnHeight=naturalHeight*fit;
    const scale=Math.min(width*.84/(drawnWidth*bounds.width),height*.84/(drawnHeight*bounds.height));
    return {scale,x:(.5-bounds.left-bounds.width/2)*drawnWidth*scale,y:(.5-bounds.top-bounds.height/2)*drawnHeight*scale};
  }
  if(typeof module==='object'&&module.exports){module.exports={alphaBounds,placement,isLightCutout};return}
  if(!root.document||!root.IntersectionObserver||!root.ResizeObserver)return;
  const selector='.photo img,.hero img,.related-photo img,.cart-photo img,.photo-picker img,.color-option img,#previewImage img,.catalogue-preview-photo img';
  const cache=new Map(),records=new WeakMap(),observed=new WeakSet();
  function measure(img,src){
    if(cache.has(src))return cache.get(src);
    // JPEG cannot have transparency; no pixel readback is needed.
    if(/\.jpe?g(?:[?#]|$)/i.test(src))return Promise.resolve(null);
    const pending=new Promise(resolve=>{
      function inspect(source){
        const work=()=>{
          try{
            if(source===img&&img.getAttribute('src')!==src){cache.delete(src);resolve(null);return}
            const ratio=Math.min(1,512/Math.max(source.naturalWidth,source.naturalHeight));
            const canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(source.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(source.naturalHeight*ratio));
            const ctx=canvas.getContext('2d',{willReadFrequently:true});
            ctx.drawImage(source,0,0,canvas.width,canvas.height);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            const bounds=alphaBounds(pixels,canvas.width,canvas.height);
            if(bounds)bounds.lightProduct=isLightCutout(pixels);
            resolve(bounds);
          }catch{resolve(null)}
        };
        if(root.requestIdleCallback)root.requestIdleCallback(work,{timeout:250});else root.setTimeout(work,0);
      }
      // Reuse a decoded same-origin image instead of downloading/decoding it twice.
      if(new URL(img.currentSrc||src,root.location.href).origin===root.location.origin){inspect(img);return}
      const source=new Image();source.crossOrigin='anonymous';
      source.onload=()=>inspect(source);source.onerror=()=>resolve(null);source.src=src;
    });
    cache.set(src,pending);if(cache.size>256)cache.delete(cache.keys().next().value);
    return pending;
  }
  function reset(img){img.classList.remove('product-framed','product-light');img.style.removeProperty('transform');records.delete(img)}
  function update(img){
    const record=records.get(img);if(!record||record.src!==img.getAttribute('src'))return;
    const result=placement(record.bounds,img.naturalWidth,img.naturalHeight,img.clientWidth,img.clientHeight);
    if(result)img.style.transform=`translate(${result.x}px,${result.y}px) scale(${result.scale})`;
  }
  const resize=new ResizeObserver(entries=>entries.forEach(({target})=>update(target)));
  async function frame(img){
    const src=img.getAttribute('src');reset(img);
    if(!src||!img.complete||!img.naturalWidth)return;
    const bounds=await measure(img,src);
    if(!bounds||!img.isConnected||img.getAttribute('src')!==src)return;
    // A tab may have been hidden while CORS/image decoding was in flight.
    // Keep its DOM stable and resume framing when the image is visible again.
    if(!img.clientWidth||!img.clientHeight){visible.observe(img);return}
    records.set(img,{src,bounds});img.classList.add('product-framed');img.classList.toggle('product-light',bounds.lightProduct===true);update(img);
  }
  const visible=new IntersectionObserver(entries=>{
    for(const {target,isIntersecting} of entries)if(isIntersecting){visible.unobserve(target);frame(target)}
  },{rootMargin:'150px'});
  function discover(node=document){
    const images=[...(node.matches?.(selector)?[node]:[]),...node.querySelectorAll(selector)];
    for(const img of images){
      if(observed.has(img))continue;observed.add(img);resize.observe(img);visible.observe(img);
    }
  }
  document.addEventListener('load',event=>{if(event.target.matches?.(selector))visible.observe(event.target)},true);
  new MutationObserver(changes=>{
    for(const change of changes)for(const node of change.removedNodes||[]){
      if(node.nodeType!==1||node.isConnected)continue;
      const removed=[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)];
      for(const img of removed){resize.unobserve(img);visible.unobserve(img);observed.delete(img)}
    }
    for(const change of changes)if(change.type==='attributes'&&change.target.matches(selector)){
      reset(change.target);visible.observe(change.target);
    }
    for(const change of changes)for(const node of change.addedNodes||[]){if(node.nodeType===1&&node.isConnected)discover(node)}
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  discover();
})(typeof window==='object'?window:globalThis);
