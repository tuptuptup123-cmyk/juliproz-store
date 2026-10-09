const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
const files=['index.html','privacy.html','admin.html','fonts.css','style.css','styles.css','admin.css','app.js','admin.js','config.js','image-policy.js','product-sizes.js','analytics.js','photo-studio.js','photo-background.js','photo-worker.js'];
for(const name of [...files,'images','fonts','vendor']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(out,name),{recursive:true});}
console.log('Public assets staged; internal source and SQL excluded.');
