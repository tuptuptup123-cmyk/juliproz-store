'use strict';
const config=require('../config.js'),{photo}=require('./public-product-image.cjs'),{amount}=require('../product-pricing.js');

// Called only for an admitted private /start share_ID update. Resolve at
// delivery time so queued requests cannot disclose a subsequently hidden item.
async function productCard(reply,request=fetch){
 const id=String(reply.product_id||'');
 if(reply.method!=='sendProductCard'||!Number.isSafeInteger(reply.chat_id)||reply.chat_id<=0||!/^\d{1,16}$/.test(id)||Number(id)<=0||!Number.isSafeInteger(Number(id)))throw Error('Invalid product request');
 const response=await request(config.url+'/rest/v1/products?select=id,brand,name,image_url,available,price,currency&id=eq.'+id+'&available=eq.true&limit=1',{
  headers:{apikey:config.key},redirect:'error',signal:AbortSignal.timeout(5000)
 });
 if(!response.ok)throw Error('Catalogue unavailable');
 const rows=await response.json();if(!Array.isArray(rows))throw Error('Catalogue unavailable');
 const product=rows[0],chat_id=reply.chat_id;
 if(!product||String(product.id)!==id||product.available!==true)return {method:'sendMessage',chat_id,text:'Эта вещь больше не доступна в каталоге.',reply_markup:{inline_keyboard:[[{text:'Открыть магазин',url:'https://t.me/JuliProzBot/shop'}]]}};
 const url='https://t.me/JuliProzBot/shop?startapp=p_'+id;
 const title=[product.brand,product.name].filter(Boolean).join(' — ').slice(0,240)||'Вещь JULI.PROZ';
 const price=['EUR','€'].includes(product.currency||'EUR')?amount(product.price,product.currency):null;
 const priceLine=price==null?'Цена по запросу':'Цена: € '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(price);
 const text=title+'\n'+priceLine+'\nАртикул: '+id+'\n'+url;
 const reply_markup={inline_keyboard:[[{text:'Открыть в боте',url}]]};
 if(!photo(product.image_url))return {method:'sendMessage',chat_id,text,link_preview_options:{is_disabled:true},reply_markup};
 return {method:'sendPhoto',chat_id,photo:'https://www.juliproz.com/api/telegram-product-photo?id='+id,caption:text,reply_markup};
}
module.exports={productCard};
