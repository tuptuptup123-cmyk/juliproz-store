// Fetch pinned, hash-verified public runtime assets at build time, not user photos.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'vendor/photo-editor');
const hashes={
 'ort.min.js':'be6e560b64c03c99252eedc0e1989e9e51e44d9f191e7655c9bf011bf9f576c8',
 'ort-wasm-simd-threaded.mjs':'745eb7c0ce6f18a6aa521971b2877babc7ffb27eecb58ab3bc6e5ef4692672e8',
 'ort-wasm-simd-threaded.wasm':'207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea',
 'u2netp.onnx':'309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function download(url,expected){const res=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!res.ok)throw Error('Photo runtime download failed: '+res.status);const data=Buffer.from(await res.arrayBuffer());if(hash(data)!==expected)throw Error('Photo runtime checksum mismatch');return data}
async function valid(name){try{return hash(await fs.readFile(path.join(dest,name)))===hashes[name]}catch{return false}}
(async()=>{
 await fs.mkdir(dest,{recursive:true});
 const runtime=Object.keys(hashes).filter(n=>n!=='u2netp.onnx');
 if(!(await Promise.all(runtime.map(valid))).every(Boolean)){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'juli-photo-'));
  try{
   const archive=path.join(temp,'ort.tgz');await fs.writeFile(archive,await download('https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.20.1.tgz','0a38facf0672dfaaeaf352e8a9f44533732b60b4af93b9dd507fe7c2d2be437b'));
   execFileSync('tar',['-xzf',archive,'-C',temp,...runtime.map(n=>'package/dist/'+n)]);
   for(const name of runtime){const data=await fs.readFile(path.join(temp,'package/dist',name));if(hash(data)!==hashes[name])throw Error('Photo runtime checksum mismatch');await fs.writeFile(path.join(dest,name),data)}
  }finally{await fs.rm(temp,{recursive:true,force:true})}
 }
 if(!await valid('u2netp.onnx'))await fs.writeFile(path.join(dest,'u2netp.onnx'),await download('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',hashes['u2netp.onnx']));
 console.log('Photo editor runtime ready (verified ONNX Runtime 1.20.1 + U2NetP).');
})().catch(error=>{console.error(error.message);process.exitCode=1});
