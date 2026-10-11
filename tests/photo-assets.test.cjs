const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const stage=require('../scripts/stage-photo-assets.cjs');
test('reviewed image bytes are staged exactly and metadata stays private',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'photo-assets-')),out=path.join(root,'dist');
 try{
  fs.mkdirSync(path.join(root,'photo-assets'));
  const bytes=Buffer.from('RIFF1234WEBPphoto'),asset={path:'photo-cleanup-20261011/225-cover.webp',base64:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  const file=path.join(root,'photo-assets','225.json');fs.writeFileSync(file,JSON.stringify(asset));stage(root,out);
  assert.deepEqual(fs.readFileSync(path.join(out,'images',asset.path)),bytes);
  assert.equal(fs.existsSync(path.join(out,'photo-assets')),false);
  asset.sha256='wrong';fs.writeFileSync(file,JSON.stringify(asset));assert.throws(()=>stage(root,out),/checksum/);
  asset.path='../outside.webp';fs.writeFileSync(file,JSON.stringify(asset));assert.throws(()=>stage(root,out),/Invalid photo asset path/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
