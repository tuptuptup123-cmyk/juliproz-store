(function(root){
  // Commas between digits are decimal separators; separate options with ; or newlines.
  function parseSizes(value){
    const raw=String(value??'').replace(/(\d),(?=\d)/g,'$1.');
    return [...new Set(raw.split(/[;\n,]+/).map(s=>s.trim()).filter(Boolean))];
  }
  function serializeSizes(value){
    const sizes=parseSizes(value), text=sizes.join('; ');
    if(text.length>100)throw Error('Список размеров слишком длинный (максимум 100 символов).');
    return text||null;
  }
  root.ProductSizes={parse:parseSizes,serialize:serializeSizes};
  if(typeof module==='object')module.exports=root.ProductSizes;
})(typeof window==='object'?window:globalThis);
