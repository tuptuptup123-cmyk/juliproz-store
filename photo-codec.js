// Preserve transparency when a mobile browser cannot encode WebP.
(function(root){
 async function decode(file){
  if(typeof root.createImageBitmap==='function')try{return await root.createImageBitmap(file)}catch{}
  const src=root.URL.createObjectURL(file),image=new root.Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Не удалось открыть фото.'));image.src=src});if(!image.naturalWidth||!image.naturalHeight)throw Error('Не удалось открыть фото.');image.close=()=>root.URL.revokeObjectURL(src);return image}catch(error){root.URL.revokeObjectURL(src);throw error}
 }
 async function encode(canvas,quality=.92){
  const attempt=type=>new Promise(resolve=>{try{canvas.toBlob(resolve,type,quality)}catch{resolve(null)}});
  let blob=await attempt('image/webp');
  if(!blob||!['image/webp','image/png'].includes(blob.type))blob=await attempt('image/png');
  if(!blob||!['image/webp','image/png'].includes(blob.type))throw Error('Браузер не смог подготовить фото. Попробуйте выбрать его заново.');
  return blob;
 }
 root.PhotoCodec={decode,encode};if(typeof module==='object')module.exports=root.PhotoCodec;
})(typeof window==='object'?window:globalThis);
