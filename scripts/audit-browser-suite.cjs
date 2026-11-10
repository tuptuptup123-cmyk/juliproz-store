'use strict';
const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const group=Number(process.env.QA_GROUP||0),groups=4;
const files=fs.readdirSync('tests').filter(f=>f.endsWith('.browser.cjs')).sort().filter((_,i)=>i%groups===group);
const failed=[];
for(const file of files){
 console.log('AUDIT START',file);
 const r=spawnSync(process.execPath,['--require',require.resolve('../tests/system-chrome.cjs'),'tests/'+file],{stdio:'inherit',env:process.env,timeout:150000});
 if(r.status!==0){failed.push(file);console.error('AUDIT FAIL',file,r.error?.message||r.status)}else console.log('AUDIT PASS',file);
}
console.log(JSON.stringify({group,checked:files.length,failed}));process.exitCode=failed.length?1:0;
