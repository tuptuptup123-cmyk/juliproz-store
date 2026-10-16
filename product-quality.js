/* Advisory checks only: never invent catalogue facts or block legacy-card corrections. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProductQuality=api})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const generic=new Set(['часы','кроссовки','кеды','балетки','картхолдер','кольцо','сумка','кепка','футболка','джинсы','платье','ботинки','туфли','браслет']);
 function issues(p={}){
  const result=[],add=(code,target,message)=>result.push({code,target,message});
  if(!String(p.name||'').trim()||generic.has(String(p.name).trim().toLocaleLowerCase('ru')))add('name','productBasics','Уточните полное название: тип вещи, модель и особенности версии.');
  if(!String(p.description||'').trim())add('description','productBasics','Добавьте описание: материал, цвет, комплектацию и состояние.');
  if(p.product_condition==='pre_owned'&&!p.wear_condition)add('wear','productBasics','Укажите фактическое состояние PRE-OWNED.');
  const photos=[...new Set([p.image_url,...(Array.isArray(p.photos)?p.photos:[])].filter(Boolean))];
  if(photos.length<2)add('photos','productPhotos',photos.length?'Добавьте другие ракурсы и детали вещи.':'Добавьте фотографии самой вещи.');
  return result;
 }
 return {issues};
});
