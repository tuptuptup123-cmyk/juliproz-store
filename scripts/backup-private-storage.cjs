'use strict';
// Read-only Storage export. No credentials or plaintext object names are written.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const PROJECT='qhgzzhgxwpcctafpzjid',ORIGIN=`https://${PROJECT}.supabase.co`,BUCKET='product-photos';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function seal(data,key){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([Buffer.from('JPBK1'),iv,c.update(data),c.final(),c.getAuthTag()])}
function unseal(data,key){if(data.length<33||data.subarray(0,5).toString()!=='JPBK1')throw Error('Invalid encrypted file');const c=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(5,17));c.setAuthTag(data.subarray(-16));return Buffer.concat([c.update(data.subarray(17,-16)),c.final()])}
function objectName(prefix,name){if(typeof name!=='string'||!name||name.includes('/')||name.includes('\\')||name==='.'||name==='..'||/[\x00-\x1f]/.test(name))throw Error('Unsafe Storage entry');return prefix?prefix+'/'+name:name}
function derive(passphrase,salt){if(typeof passphrase!=='string'||passphrase.length<24)throw Error('Set JULIPROZ_BACKUP_PASSPHRASE (at least 24 characters)');return crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})}
async function inventory(request){
 const objects=[],folders=[''];
 while(folders.length){const prefix=folders.shift();let offset=0;
  for(;;){const rows=await request('/storage/v1/object/list/'+BUCKET,{method:'POST',body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})});
   if(!Array.isArray(rows))throw Error('Invalid Storage listing');
   for(const row of rows){const name=objectName(prefix,row.name);if(row.id===null)folders.push(name);else if(typeof row.id==='string')objects.push({name,id:row.id,size:Number(row.metadata?.size),updated_at:row.updated_at});else throw Error('Missing object identity');}
   if(rows.length<100)break;offset+=rows.length;
  }
 }
 if(new Set(objects.map(x=>x.name)).size!==objects.length)throw Error('Duplicate Storage object');
 return objects.sort((a,b)=>a.name.localeCompare(b.name));
}
function fingerprint(rows){return JSON.stringify(rows.map(({name,id,size,updated_at})=>({name,id,size,updated_at})))}
async function exportStorage(directory,{key,passphrase,request}={}){
 if(!request){if(!key)throw Error('Set SUPABASE_BACKUP_KEY through the operator secret environment');request=async(route,options={})=>{const r=await fetch(ORIGIN+route,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Storage request failed with HTTP '+r.status);return options.bytes?Buffer.from(await r.arrayBuffer()):r.json()}}
 const salt=crypto.randomBytes(32),encryptionKey=derive(passphrase,salt),before=await inventory(request);
 if(before.some(x=>!Number.isSafeInteger(x.size)||x.size<0))throw Error('Object sizes missing from inventory');
 // Exclusive directory prevents overwriting a previous backup; failed exports stay incomplete.
 await fs.mkdir(directory,{mode:0o700});await fs.mkdir(path.join(directory,'objects'),{mode:0o700});
 const entries=[];
 try{for(const item of before){const data=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+item.name.split('/').map(encodeURIComponent).join('/'),{bytes:true});if(data.length!==item.size)throw Error('Object size changed during backup');const file=hash(Buffer.from(item.name))+'.enc',encrypted=seal(data,encryptionKey);await fs.writeFile(path.join(directory,'objects',file),encrypted,{mode:0o600,flag:'wx'});entries.push({...item,file,sha256:hash(data),encrypted_sha256:hash(encrypted)});}
  if(fingerprint(before)!==fingerprint(await inventory(request)))throw Error('Storage changed during backup; retry into a new directory');
  const manifest=seal(Buffer.from(JSON.stringify({project:PROJECT,bucket:BUCKET,objects:entries})),encryptionKey);await fs.writeFile(path.join(directory,'manifest.enc'),manifest,{mode:0o600,flag:'wx'});
  const metadata={format:'juliproz-storage-encrypted-v1',project:PROJECT,bucket:BUCKET,created_at:new Date().toISOString(),salt:salt.toString('base64'),objects:entries.length,bytes:entries.reduce((n,x)=>n+x.size,0),manifest_sha256:hash(manifest),complete:true};
  await fs.writeFile(path.join(directory,'metadata.json'),JSON.stringify(metadata,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {objects:metadata.objects,bytes:metadata.bytes,complete:true};
 }finally{encryptionKey.fill(0)}
}
async function verifyStorage(directory,passphrase){
 const meta=JSON.parse(await fs.readFile(path.join(directory,'metadata.json'),'utf8'));
 if(meta.format!=='juliproz-storage-encrypted-v1'||meta.project!==PROJECT||meta.bucket!==BUCKET||meta.complete!==true||!Number.isSafeInteger(meta.objects)||meta.objects<0)throw Error('Invalid backup metadata');
 const key=derive(passphrase,Buffer.from(meta.salt,'base64'));
 try{const encrypted=await fs.readFile(path.join(directory,'manifest.enc'));if(hash(encrypted)!==meta.manifest_sha256)throw Error('Manifest checksum mismatch');const manifest=JSON.parse(unseal(encrypted,key));
  if(manifest.project!==PROJECT||manifest.bucket!==BUCKET||!Array.isArray(manifest.objects)||manifest.objects.length!==meta.objects)throw Error('Manifest mismatch');
  const seen=new Set();let bytes=0;
  for(const item of manifest.objects){const file=hash(Buffer.from(item.name))+'.enc';if(item.file!==file||seen.has(file))throw Error('Invalid or duplicate object file');seen.add(file);const data=await fs.readFile(path.join(directory,'objects',file));if(hash(data)!==item.encrypted_sha256)throw Error('Encrypted object checksum mismatch');const plain=unseal(data,key);if(plain.length!==item.size||hash(plain)!==item.sha256)throw Error('Object checksum mismatch');bytes+=plain.length;}
  if(bytes!==meta.bytes)throw Error('Backup size mismatch');if((await fs.readdir(path.join(directory,'objects'))).length!==seen.size)throw Error('Unexpected object files');
  return {verified:true,objects:seen.size,bytes};
 }finally{key.fill(0)}
}
if(require.main===module){const [command,directory]=process.argv.slice(2);if(!['export','verify'].includes(command)||!directory||!path.isAbsolute(directory)){console.error('Usage: node scripts/backup-private-storage.cjs export|verify /absolute/new-backup-directory');process.exitCode=1}else(command==='export'?exportStorage(directory,{key:process.env.SUPABASE_BACKUP_KEY,passphrase:process.env.JULIPROZ_BACKUP_PASSPHRASE}):verifyStorage(directory,process.env.JULIPROZ_BACKUP_PASSPHRASE)).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Storage backup failed; no complete backup is confirmed. Check operator credentials, inventory stability and destination. Secret values are never logged.');process.exitCode=1})}
module.exports={seal,unseal,objectName,inventory,exportStorage,verifyStorage};
