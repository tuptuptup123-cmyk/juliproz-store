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
    return [...new Set(options.map(s=>s.trim()).filter(Boolean))];
  }
  function serializeSizes(value){
    const sizes=parseSizes(value), text=sizes.join('; ');
    if(text.length>100)throw Error('Список размеров слишком длинный (максимум 100 символов).');
    return text||null;
  }
  root.ProductSizes={parse:parseSizes,serialize:serializeSizes};
  if(typeof module==='object')module.exports=root.ProductSizes;
})(typeof window==='object'?window:globalThis);
