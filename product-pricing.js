(function(root){
  // Round EUR unit amounts for display and totals; retain raw prices for percentage math.
  function amount(value,currency='EUR'){
    if(value==null||value==='')return null;
    const number=Number(value);
    if(!Number.isFinite(number)||number<0)return null;
    return ['EUR','€'].includes(currency||'EUR')?Math.round(number):number;
  }
  function discount(p){
    const original=amount(p?.original_price,p?.currency),current=amount(p?.price,p?.currency);
    if(original==null||current==null||original<=current)return null;
    const basis=p?.price_basis;
    const matchesBasis=basis&&amount(basis.price,p.currency)===current&&amount(basis.original_price,p.currency)===original;
    const rawOriginal=amount(matchesBasis?basis.original_price:p.original_price,'RAW');
    const rawCurrent=amount(matchesBasis?basis.price:p.price,'RAW');
    const exact=(rawOriginal-rawCurrent)/rawOriginal*100;
    const nearest=Math.round(exact);
    // An owner-entered whole percent may require a reference price rounded to cents.
    // Snap only that half-cent uncertainty; real fractional markdowns still round down.
    const centRoundedInteger=nearest>0&&nearest<100&&Math.abs(rawOriginal-rawCurrent/(1-nearest/100))<=0.005+1e-8;
    const percent=centRoundedInteger?nearest:Math.floor(exact+1e-8);
    return {original,current,percent,label:percent>0?'−'+percent+'%':'Скидка'};
  }
  function markup(p,format,escape,{showPercentage=true}={}){
    const sale=discount(p),current=escape(format({...p,price:amount(p.price,p.currency)}));
    if(!sale)return current;
    return `<span class="sale-price"><span class="price-current">${current}</span><del class="price-original" aria-label="Цена до скидки">${escape(format({...p,price:sale.original}))}</del>${showPercentage?`<span class="discount-badge">${sale.label}</span>`:''}</span>`;
  }
  function validate(original,current,currency='EUR'){
    if(original==null)return;
    if(current==null||!Number.isFinite(original)||!Number.isFinite(current)||current<0||original<=current||amount(original,currency)<=amount(current,currency))throw Error('Цена до скидки должна быть выше текущей цены после округления. Укажите обе цены или очистите поле «Цена до скидки».');
  }
  root.ProductPricing={amount,discount,markup,validate};
  if(typeof module==='object')module.exports=root.ProductPricing;
})(typeof window==='object'?window:globalThis);
