/* Product copy shared by the website, server and editor. No automatic claims about an item. */
(function(root){
 'use strict';
 const words={'Сумка':'Bag','Кошелёк':'Wallet','Кошелек':'Wallet','Лоферы':'Loafers','Шлёпанцы':'Slides','Шлепанцы':'Slides','Туфли':'Shoes','Босоножки':'Sandals','Сапоги':'Boots','Платье':'Dress','Юбка':'Skirt','Пиджак':'Blazer','Пальто':'Coat','Клатч':'Clutch','Картхолдер':'Cardholder','Браслет':'Bracelet','Кольцо':'Ring','Серьги':'Earrings','Колье':'Necklace','Кулон':'Pendant','Рюкзак':'Backpack','Часы':'Watch','полный комплект':'full set','новые':'new','новая':'new','новый':'new','В наличии':'In stock','Под заказ':'Available to order','Состояние':'Condition'};
 const key=s=>String(s??'').replace(/\s+/g,' ').trim(),cyrillic=s=>/[А-Яа-яЁё]/.test(s);
 function english(value){
  const raw=String(value??''),source=key(raw),dict=root.SiteTranslations?.products||{};
  if(Object.hasOwn(dict,source))return dict[source];
  let result=raw;
  for(const [from,to] of Object.entries({...words,...dict}).sort((a,b)=>b[0].length-a[0].length)){
   if(!cyrillic(from)||!result.includes(from))continue;
   const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   result=result.replace(new RegExp('(?<![А-Яа-яЁё])'+escaped+'(?![А-Яа-яЁё])','g'),()=>to);
  }
  return result;
 }
 function value(p,field,language='ru',translate=english){return language==='en'?(String(p?.[field+'_en']||'').trim()||translate(p?.[field]||'')):String(p?.[field]||'')}
 function missing(p){return ['name','description'].filter(field=>key(p?.[field])&&cyrillic(value(p,field,'en')))}
 root.ProductCopy={english,value,missing};
 if(typeof module==='object'&&module.exports)module.exports=root.ProductCopy;
})(typeof window==='object'?window:globalThis);
