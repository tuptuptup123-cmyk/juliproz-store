'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/should-build-telegram.cjs'),'utf8');
function decision(files,previous='a'.repeat(40),gitFails=false){
 const stop={},process={env:{VERCEL_GIT_PREVIOUS_SHA:previous},exit(code){stop.code=code;throw stop}};
 try{vm.runInNewContext(source,{__dirname:path.join(root,'scripts'),process,require(name){
  if(name==='node:path')return path;
  if(name==='node:child_process')return {execFileSync(){if(gitFails)throw Error('history unavailable');return files.join('\n')}};
  throw Error('Unexpected dependency');
 }})}catch(error){if(error!==stop)throw error}
 return stop.code;
}
test('Telegram rebuilds for shared error handling, transitive auth code and dependency changes',()=>{
 for(const file of ['runtime-errors.js','server/telegram-init-data.cjs','package.json','package-lock.json'])assert.equal(decision([file]),1,file);
 assert.equal(decision(['admin-finance.js','docs/operations-2026-10-18.md']),0);
});
test('Telegram rebuilds when previous revision cannot be established',()=>{
 assert.equal(decision([],''),1);
 assert.equal(decision([],undefined,true),1);
});
