'use strict';
const fs=require('node:fs'),path=require('node:path'),postcss=require('postcss'),CleanCSS=require('clean-css');
const root=path.resolve(__dirname,'..');
// Keep shared document rules and the server homepage; all interactive styles stay in the full sheet.
const sheet=postcss.parse(fs.readFileSync(path.join(root,'style.css'),'utf8'));
sheet.walkRules(rule=>{if(rule.parent.type==='atrule'&&/keyframes$/i.test(rule.parent.name))return;const keep=rule.selectors.some(selector=>/^(?:\*|:root|body\b|html\b)/.test(selector)||/\.seo-(?:landing|home-photo|navigation|brand-links|languages|contact)\b/.test(selector));if(!keep)rule.remove()});
sheet.walkAtRules(rule=>{if(/keyframes$/i.test(rule.name)||rule.nodes?.length===0)rule.remove()});
const source=fs.readFileSync(path.join(root,'fonts.css'),'utf8')+'\n'+sheet.toString()+'\n'+fs.readFileSync(path.join(root,'home-buyer.css'),'utf8');
const result=new CleanCSS({level:0,rebase:false,inline:['none']}).minify(source);if(result.errors.length)throw Error(result.errors.join('; '));
fs.writeFileSync(path.join(root,'home-critical.css'),result.styles);
console.log('Homepage critical CSS: '+Buffer.byteLength(result.styles)+' bytes');
