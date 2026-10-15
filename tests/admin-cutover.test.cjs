const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('legacy admin removes credentials and never forwards URL tokens',()=>{
 const removed=[],navigation=[],history=[];
 vm.runInNewContext(fs.readFileSync(path.join(root,'admin-redirect.js'),'utf8'),{localStorage:{removeItem:k=>removed.push(['local',k])},sessionStorage:{removeItem:k=>removed.push(['tab',k])},history:{replaceState:(...args)=>history.push(args)},location:{search:'?next=https://evil.invalid',hash:'#access_token=synthetic',replace:url=>navigation.push(url)}});
 assert.deepEqual(removed,[['local','jpAdminSessionV1'],['tab','jpAdminSessionV1']]);assert.deepEqual(navigation,['https://admin.juliproz.com/admin.html']);assert.equal(history[0][2],'/admin.html');
});
test('legacy admin navigation survives unavailable browser storage',()=>{
 let next;const blocked={removeItem(){throw Error('unavailable')}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'admin-redirect.js'),'utf8'),{localStorage:blocked,sessionStorage:blocked,history:{replaceState(){throw Error('unavailable')}},location:{replace:url=>next=url}});assert.equal(next,'https://admin.juliproz.com/admin.html');
});
test('public build serves a transition instead of privileged admin code',()=>{
 execFileSync(process.execPath,['scripts/build-public.cjs'],{cwd:root});const out=path.join(root,'dist');
 const html=fs.readFileSync(path.join(out,'admin.html'),'utf8');assert.match(html,/src="admin-redirect.js"/);assert.doesNotMatch(html,/id="login"|src="admin.js/);
 for(const file of ['admin.js','admin-workspace.js','admin-schedule.js','admin-selects.js','admin.css','photo-worker.js'])assert.equal(fs.existsSync(path.join(out,file)),false,file);
 assert.ok(fs.existsSync(path.join(out,'app.js')));assert.ok(fs.existsSync(path.join(out,'admin-redirect.js')));
});
