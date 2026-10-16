(function(root){
  // One fractional digit uses a decimal comma; multi-digit alternatives stay separate.
  function parseSizes(value){
    const raw=String(value??'').replace(/(\d),(\d)(?!\d)/g,'$1.$2');
    // A set describes both pieces, rather than alternative sizes.
    if(/^верх\s/i.test(raw.trim()) && /[;\n]\s*низ\s/i.test(raw))return [raw.trim()];
    const isSize=s=>/^(?:\d+(?:\.\d+)?|[2-6]?[XSML]+|OS|One Size)$/i.test(s.trim());
    const options=raw.split(/[;\n]+/).flatMap(part=>{
      const commaList=part.split(',');
      return commaList.length>1&&commaList.every(isSize)?commaList:[part];
    });
    return [...new Set(options.map(s=>normalize(s.trim())).filter(Boolean))].sort(compare);
  }
  function normalize(s){
    s=s.replace(/^(\d+),(\d+)$/,'$1.$2');
    if(/^(?:one[ -]?size|o[ /-]?s|единый размер|универсальный)$/i.test(s))return 'One Size';
    let latin=s.replace(/[Хх]/g,'X').replace(/[Мм]/g,'M').replace(/[Сс]/g,'S').toUpperCase();
    latin=latin.replace(/^2XL$/,'XXL').replace(/^3XL$/,'XXXL').replace(/^XXXXL$/,'4XL');
    s=s.replace(/^Длинна:/i,'Длина:');
    return /^(?:[2-6]?X{1,4}[SL]|[SML])$/.test(latin)?latin:s;
  }
  function compare(a,b){
    const order=['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL'];
    if(a==='One Size'||b==='One Size')return a===b?0:a==='One Size'?1:-1;
    if(order.includes(a)&&order.includes(b))return order.indexOf(a)-order.indexOf(b);
    return String(a).localeCompare(String(b),'ru',{numeric:true});
  }
  function serializeSizes(value){
    const sizes=parseSizes(value), text=sizes.join('; ');
    if(text.length>100)throw Error('Список размеров слишком длинный (максимум 100 символов).');
    return text||null;
  }
  function stockFor(p,size=''){
    const q=p?.stock_quantities;if(q==null)return 1;
    size=normalize(String(size).trim());
    const aliases=Object.keys(q).filter(k=>normalize(k.trim())===size),n=aliases.length===1?q[aliases[0]]:undefined;return typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=9999?n:0;
  }
  function stockUnits(p){if(p?.stock_quantities==null)return 1;const sizes=parseSizes(p.size);return (sizes.length?sizes:['']).reduce((sum,size)=>sum+stockFor(p,size),0)}
  // Legacy cards may store colour choices in the size field. Keep their stock keys intact.
  function variantLabel(p,plural=false){
    const values=parseSizes(p?.size);
    const colors=new Set(['розовый','синий','голубой','белый','черный','серый','бежевый','коричневый','красный','зеленый','желтый','фиолетовый','оранжевый','бордовый','серебристый','золотой','pink','blue','white','black','grey','gray','beige','brown','red','green','yellow','purple','orange','silver','gold']);
    const isColor=values.length>0&&values.every(v=>colors.has(v.toLowerCase().replace(/ё/g,'е')));
    return isColor?(plural?'Цвета':'Цвет'):(plural?'Размеры':'Размер');
  }
  function cartLimit(p,size='',rows=[]){
    if(p?.stock_quantities==null){const other=rows.filter(r=>String(r.id)===String(p?.id)&&r.size!==size).reduce((n,r)=>n+r.quantity,0);return Math.max(0,1-other)}
    return p.fulfillment_status==='on_order'?99:Math.min(99,stockFor(p,size));
  }
  function normalizeLegacyCart(rows,productFor){
    const seen=new Set(),result=[];let changed=false;
    for(const row of rows){
      if(productFor(row)?.stock_quantities==null){const id=String(row.id);if(seen.has(id)){changed=true;continue}seen.add(id);if(row.quantity!==1){result.push({...row,quantity:1});changed=true;continue}}
      result.push(row);
    }
    return {rows:result,changed};
  }
  root.ProductSizes={variantLabel,parse:parseSizes,serialize:serializeSizes,compare:compare,normalize:normalize,stockFor,stockUnits,cartLimit,normalizeLegacyCart};
  if(typeof module==='object')module.exports=root.ProductSizes;
})(typeof window==='object'?window:globalThis);
