(function(root){
  function discount(p){
    if(p?.original_price==null||p.original_price===''||p.price==null||p.price==='')return null;
    const original=Number(p.original_price),current=Number(p.price);
    if(!Number.isFinite(original)||!Number.isFinite(current)||current<0||original<=current)return null;
    const percent=Math.floor((original-current)/original*100+1e-8);
    return {original,current,percent,label:percent>0?'−'+percent+'%':'Скидка'};
  }
  function markup(p,format,escape){
    const sale=discount(p),current=escape(format(p));
    if(!sale)return current;
    return `<span class="sale-price"><span class="price-current">${current}</span><del class="price-original" aria-label="Цена до скидки">${escape(format({...p,price:sale.original}))}</del><span class="discount-badge">${sale.label}</span></span>`;
  }
  function validate(original,current){
    if(original==null)return;
    if(current==null||!Number.isFinite(original)||!Number.isFinite(current)||current<0||original<=current)throw Error('Цена до скидки должна быть выше текущей цены. Укажите обе цены или очистите поле «Цена до скидки».');
  }
  root.ProductPricing={discount,markup,validate};
  if(typeof module==='object')module.exports=root.ProductPricing;
})(typeof window==='object'?window:globalThis);
