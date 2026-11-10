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
  for(const field of Array.isArray(p.missing_translations)?p.missing_translations:[]){
   if(field==='name'||field==='description')add(field+'_en','productBasics',field==='name'?'Добавьте английское название.':'Добавьте английское описание.');
  }
  if(Object.hasOwn(p,'price')){
   const empty=p.price==null||String(p.price).trim()==='';
   if(empty&&p.price_on_request===false)add('price_request','productSizes','Подтвердите «Цена по запросу» или укажите цену.');
   if(!empty&&(!Number.isFinite(Number(p.price))||Number(p.price)<=0))add('price','productSizes','Проверьте цену: она должна быть больше нуля или выберите «Цена по запросу».');
  }
  const sized=new Set(['обувь','одежда','брюки','джинсы','жилеты','зип-худи','кардиганы','костюмы','купальники','куртки','леггинсы','лонгсливы','майки','поло','рубашки','свитеры','свитшоты','спортивная одежда','футболки','худи','шорты','топы','блузы','юбки','платья','комбинезоны','пиджаки','пальто','тренчи','пуховики','пляжная одежда','перчатки']);
  if(sized.has(String(p.category||'').trim().toLocaleLowerCase('ru'))&&!String(p.size||'').trim())add('size','productSizes','Уточните размер вещи. Если он неизвестен, проверьте его у менеджера; не подставляйте One Size.');
  return result;
 }
 return {issues};
});
