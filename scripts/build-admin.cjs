// Optional isolated admin deployment; do not enable on the public store project.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'dist');
if(out!==path.join(root,'dist')&&out!==path.join(root,'admin-deployment','dist'))throw Error('Unsupported admin output directory');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['admin.html','admin.css','admin.js','admin-selects.js','fonts.css','config.js','image-policy.js','product-sizes.js','product-pricing.js','photo-studio.js','photo-background.js','photo-worker.js','images','fonts','vendor']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(out,name),{recursive:true})}
const html=fs.readFileSync(path.join(out,'admin.html'),'utf8').replace('href="/" target="_blank"','href="https://juliproz-store.vercel.app/" target="_blank"');
fs.writeFileSync(path.join(out,'admin.html'),html);fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Isolated admin assets prepared. No Telegram SDK or public catalogue.');
