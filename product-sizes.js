(function(root){
  // Commas between digits are decimal separators; separate options with ; or newlines.
  function parseSizes(value){
    const raw=String(value??'').replace(/(\d),(?=\d)/g,'$1.');
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
    if(/^(?:one[ -]?size|os|единый размер|универсальный)$/i.test(s))return 'One Size';
    const latin=s.replace(/[Хх]/g,'X').replace(/[Мм]/g,'M').replace(/[Сс]/g,'S').toUpperCase();
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
  root.ProductSizes={parse:parseSizes,serialize:serializeSizes,compare:compare};
  if(typeof module==='object')module.exports=root.ProductSizes;
})(typeof window==='object'?window:globalThis);
