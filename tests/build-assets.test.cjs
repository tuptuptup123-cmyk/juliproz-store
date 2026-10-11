const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const [build,pages] of [['scripts/build-public.cjs',['index.html','admin.html','privacy.html']],['scripts/build-admin.cjs',['admin.html']]]){
 test(build+' includes every local script referenced by its pages',()=>{
  const source=fs.readFileSync(path.join(root,build),'utf8');
  for(const page of pages){const html=fs.readFileSync(path.join(root,page),'utf8');for(const match of html.matchAll(/<script[^>]+src="([^"?#]+)(?:[?#][^"]*)?"/g)){const asset=match[1];if(/^https?:/.test(asset))continue;assert.ok(source.includes("'"+asset+"'"),page+' requires missing build asset '+asset);assert.ok(fs.existsSync(path.join(root,asset)),asset+' must exist')}}
 });
}
