'use strict';
const fs=require('node:fs'),path=require('node:path'),CleanCSS=require('clean-css');
// Formatting-only compression. Preserve declaration values, rule order and CSS URLs.
module.exports=function(directory){
 let before=0,after=0;
 for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.css'))){
  const file=path.join(directory,name),source=fs.readFileSync(file,'utf8');
  const result=new CleanCSS({level:0,rebase:false,inline:['none']}).minify(source);
  if(result.errors.length)throw Error('CSS minification failed: '+name+' '+result.errors.join('; '));
  before+=Buffer.byteLength(source);after+=Buffer.byteLength(result.styles);fs.writeFileSync(file,result.styles);
 }
 console.log('Public CSS bytes: '+before+' → '+after);
};
