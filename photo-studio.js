// Photo editing preserves source pixels; the model supplies only an alpha mask.
(()=>{
 const $=id=>document.getElementById(id),SIZE=1400;
 let worker=null,taskId=0,active=null,previousFocus=null,painting=false;
 const waiting=new Map();
 function stopWorker(message){worker?.terminate();worker=null;for(const task of waiting.values()){clearTimeout(task.timer);task.reject(Error(message))}waiting.clear()}
 function infer(input){
  if(!worker){worker=new Worker('/photo-worker.js');worker.onmessage=({data})=>{const task=waiting.get(data.id);if(!task)return;clearTimeout(task.timer);waiting.delete(data.id);data.error?task.reject(Error('Не удалось удалить фон. Можно оставить оригинал и попробовать ещё раз.')):task.resolve(data.values)};worker.onerror=()=>stopWorker('Не удалось запустить обработку. Оригинал сохранён.');}
  const id=++taskId;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>stopWorker('Обработка заняла слишком много времени. Оригинал сохранён.'),90000);waiting.set(id,{resolve,reject,timer});worker.postMessage({id,input},[input.buffer])});
 }
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
 function read(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Не удалось прочитать фото.'));r.readAsDataURL(blob)})}
 async function encode(c){const blob=await new Promise(r=>c.toBlob(r,'image/webp',.94));if(!blob||!['image/webp','image/png'].includes(blob.type))throw Error('Браузер не смог сохранить обработанное фото.');return blob}
 function fullMask(source){const c=canvas(source.width,source.height),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);return c}
 function simpleMask(source){
  const w=source.width,h=source.height,data=source.getContext('2d').getImageData(0,0,w,h),pixels=data.data;
  let transparent=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<20)transparent++;
  // Already isolated products must not be segmented again (e.g. black soles).
  if(transparent>w*h*.01){const mask=canvas(w,h),out=mask.getContext('2d').createImageData(w,h);for(let i=0;i<pixels.length;i+=4){out.data[i]=out.data[i+1]=out.data[i+2]=255;out.data[i+3]=pixels[i+3]}mask.getContext('2d').putImageData(out,0,0);return mask}
  const corners=[0,w-1,(h-1)*w,w*h-1],color=[0,0,0];for(const p of corners)for(let c=0;c<3;c++)color[c]+=pixels[p*4+c]/4;
  const distance=p=>Math.max(...color.map((v,c)=>Math.abs(pixels[p*4+c]-v)));
  if(corners.some(p=>distance(p)>12))return null;
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  function push(p){if(seen[p])return;seen[p]=1;if(distance(p)<=22)queue[tail++]=p}
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  while(head<tail){const p=queue[head++],x=p%w;pixels[p*4+3]=0;if(x)push(p-1);if(x<w-1)push(p+1);if(p>=w)push(p-w);if(p<w*(h-1))push(p+w)}
  // If no useful uniform region was found, let the model handle the photo.
  if(tail<w*h*.08||tail>w*h*.98)return null;
  const mask=canvas(w,h),out=mask.getContext('2d').createImageData(w,h);
  for(let p=0;p<w*h;p++){out.data[p*4]=out.data[p*4+1]=out.data[p*4+2]=255;out.data[p*4+3]=pixels[p*4+3]}
  mask.getContext('2d').putImageData(out,0,0);return mask;
 }
 async function process(file,remove=true){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Фото должно быть JPG, PNG или WebP, до 6 МБ.');
  let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error('Не удалось открыть фото.')}
  if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('Фото слишком большое: максимум 40 мегапикселей.')}
  const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height)),source=canvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));
  source.getContext('2d').drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
  let mask=remove?simpleMask(source):fullMask(source);
  if(remove&&!mask){
   const small=canvas(320,320),ctx=small.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,320,320);ctx.drawImage(source,0,0,320,320);
   const rgba=ctx.getImageData(0,0,320,320).data,input=new Float32Array(3*320*320),mean=[.485,.456,.406],std=[.229,.224,.225];let max=1;
   for(let i=0;i<rgba.length;i+=4)max=Math.max(max,rgba[i],rgba[i+1],rgba[i+2]);
   for(let p=0;p<320*320;p++)for(let c=0;c<3;c++)input[c*320*320+p]=(rgba[p*4+c]/max-mean[c])/std[c];
   const values=await infer(input);let lo=Infinity,hi=-Infinity;for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v)}
   if(!Number.isFinite(hi)||hi-lo<.01)throw Error('Не удалось уверенно выделить товар. Используйте оригинал или режим без удаления фона.');
   const image=ctx.createImageData(320,320);let foreground=0;
   for(let p=0;p<values.length;p++){const alpha=Math.max(0,Math.min(1,(values[p]-lo)/(hi-lo)));image.data[p*4]=image.data[p*4+1]=image.data[p*4+2]=255;image.data[p*4+3]=Math.round(alpha*255);if(alpha>.5)foreground++}
   if(foreground<100)throw Error('Товар слишком маленький на фото. Попробуйте другое фото или оставьте оригинал.');
   ctx.putImageData(image,0,0);mask=canvas(source.width,source.height);mask.getContext('2d').drawImage(small,0,0,mask.width,mask.height);
  }
  const state={source,mask,originalFile:file,originalSrc:await read(file),padding:8,brightness:0,rotation:0,background:'transparent',removed:remove};
  return {...await exportState(state),state};
 }
 function compose(s){
  const {source,mask}=s,rgba=mask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,mask.width,mask.height).data;
  let x0=mask.width,y0=mask.height,x1=0,y1=0,count=0;
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(rgba[(y*mask.width+x)*4+3]>25){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++}
  if(!count)throw Error('На фото не осталось товара. Верните детали кистью или сбросьте обработку.');
  x0=Math.max(0,x0-3);y0=Math.max(0,y0-3);x1=Math.min(mask.width-1,x1+3);y1=Math.min(mask.height-1,y1+3);
  const cutout=canvas(source.width,source.height),cc=cutout.getContext('2d');cc.drawImage(source,0,0);cc.globalCompositeOperation='destination-in';cc.drawImage(mask,0,0);
  const out=canvas(SIZE,SIZE),ctx=out.getContext('2d');if(s.background!=='transparent'){ctx.fillStyle=s.background;ctx.fillRect(0,0,SIZE,SIZE)}
  const w=x1-x0+1,h=y1-y0+1,room=SIZE*(1-s.padding/50),scale=room/Math.max(w,h);
  ctx.translate(SIZE/2,SIZE/2);ctx.rotate(s.rotation*Math.PI/180);ctx.filter=`brightness(${1+s.brightness/100})`;ctx.drawImage(cutout,x0,y0,w,h,-w*scale/2,-h*scale/2,w*scale,h*scale);
  return out;
 }
 async function exportState(s){const blob=await encode(compose(s)),name=s.originalFile.name.replace(/\.[^.]+$/,'')+'-juli.'+(blob.type==='image/png'?'png':'webp'),file=new File([blob],name,{type:blob.type});return {file,src:await read(file),originalSrc:s.originalSrc,originalFile:s.originalFile,name:s.originalFile.name}}
 function draw(){if(!active)return;try{const out=compose(active.state),target=$('studioResult'),ctx=target.getContext('2d');target.width=out.width;target.height=out.height;ctx.drawImage(out,0,0);$('studioError').textContent='';drawMask()}catch(e){$('studioError').textContent=e.message}}
 function drawMask(){const s=active.state,target=$('studioMask');target.width=s.source.width;target.height=s.source.height;const ctx=target.getContext('2d');ctx.drawImage(s.source,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(s.mask,0,0);ctx.globalCompositeOperation='source-over'}
 function close(){if(!$('photoStudio').open)return;$('photoStudio').close();active=null;painting=false;previousFocus?.focus?.()}
 function open(entry,onApply,onOriginal){
  if(!entry.state)return;previousFocus=document.activeElement;
  const s=entry.state,mask=canvas(s.mask.width,s.mask.height);mask.getContext('2d').drawImage(s.mask,0,0);
  active={state:{...s,mask},onApply,onOriginal,history:[],initialMask:mask.getContext('2d').getImageData(0,0,mask.width,mask.height)};$('studioUndo').disabled=true;$('studioBefore').src=entry.originalSrc;$('studioPadding').value=s.padding;$('studioBrightness').value=s.brightness;$('studioBackground').value=s.background;$('studioError').textContent='';$('studioTools').open=false;
  $('photoStudio').showModal();draw();$('studioApply').focus();
 }
 for(const [id,field] of [['studioPadding','padding'],['studioBrightness','brightness'],['studioBackground','background']])$(id).oninput=()=>{if(!active)return;active.state[field]=field==='background'?$(id).value:Number($(id).value);draw()};
 $('studioRotate').onclick=()=>{if(active){active.state.rotation=(active.state.rotation+90)%360;draw()}};
 $('studioClose').onclick=close;$('photoStudio').addEventListener('cancel',e=>{e.preventDefault();close()});
 $('studioApply').onclick=async()=>{if(!active)return;const current=active;$('studioApply').disabled=true;try{const result=await exportState(current.state);if(active!==current)return;current.onApply({...result,state:current.state});close()}catch(e){$('studioError').textContent=e.message}finally{$('studioApply').disabled=false}};
 $('studioOriginal').onclick=()=>{active?.onOriginal();close()};
 const surface=$('studioMask');
 let lastPoint=null;
 function rememberMask(){const m=active.state.mask;active.history.push(m.getContext('2d').getImageData(0,0,m.width,m.height));if(active.history.length>6)active.history.shift();$('studioUndo').disabled=false}
 $('studioUndo').onclick=()=>{if(!active||painting||!active.history.length)return;active.state.mask.getContext('2d').putImageData(active.history.pop(),0,0);$('studioUndo').disabled=!active.history.length;draw()};
 $('studioResetMask').onclick=()=>{if(!active||painting)return;rememberMask();active.state.mask.getContext('2d').putImageData(active.initialMask,0,0);draw()};
 function point(e){const box=surface.getBoundingClientRect();return {x:(e.clientX-box.left)*surface.width/box.width,y:(e.clientY-box.top)*surface.height/box.height,scale:surface.width/box.width}}
 function paint(e){if(!painting||!active)return;const {x,y,scale}=point(e),ctx=active.state.mask.getContext('2d'),radius=Number($('studioBrushSize').value)*scale/2,softness=Number($('studioBrushSoftness').value)/100;
  ctx.globalCompositeOperation=$('studioBrush').value==='erase'?'destination-out':'source-over';
  const from=lastPoint||{x,y},steps=Math.max(1,Math.ceil(Math.hypot(x-from.x,y-from.y)/Math.max(1,radius*.2)));
  for(let i=1;i<=steps;i++){const px=from.x+(x-from.x)*i/steps,py=from.y+(y-from.y)*i/steps;let fill='#fff';if(softness){fill=ctx.createRadialGradient(px,py,radius*(1-softness),px,py,radius);fill.addColorStop(0,'#fff');fill.addColorStop(1,'rgba(255,255,255,0)')}ctx.fillStyle=fill;ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill()}
  ctx.globalCompositeOperation='source-over';lastPoint={x,y};drawMask();
 }
 surface.onpointerdown=e=>{if(!active||painting||e.button>0)return;e.preventDefault();rememberMask();const {x,y}=point(e);
  if($('studioBrush').value==='region'){const s=active.state,ctx=s.mask.getContext('2d'),mask=ctx.getImageData(0,0,s.mask.width,s.mask.height),source=s.source.getContext('2d').getImageData(0,0,s.source.width,s.source.height);PhotoBackground.eraseRegion(source,mask,x,y,Number($('studioTolerance').value));ctx.putImageData(mask,0,0);draw();return}
  painting=true;lastPoint=null;surface.setPointerCapture(e.pointerId);paint(e)
 };surface.onpointermove=paint;surface.onpointerup=surface.onpointercancel=()=>{painting=false;lastPoint=null;if(active)draw()};
 window.PhotoStudio={process,open,close,cancel:()=>{close();stopWorker('Обработка отменена.')}};
})();
