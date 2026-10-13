const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,IDLE,MAX}=require('../admin-session.js');
const reply=(now,max=now+MAX,idle=now+IDLE)=>({server_now:new Date(now).toISOString(),expires_at:new Date(max).toISOString(),idle_expires_at:new Date(idle).toISOString()});
test('idle clock warns before expiry and background checks never extend it',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const start=now;
 for(let i=0;i<28;i++){now+=60000;assert.equal(clock.state().expired,false);assert.equal(clock.due(),false)}
 assert.equal(clock.state().warning,true);now=start+IDLE;assert.equal(clock.state().expired,true);assert.equal(clock.activity(),false);
 assert.equal(clock.accept(reply(now),now),false,'late heartbeat cannot revive an expired session');
});
test('activity needs server acknowledgement and absolute expiry never moves',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const start=now;
 for(let i=0;i<28;i++){now+=25*60000;assert.equal(clock.activity(),true);assert.equal(clock.due(),true);const sent=clock.sent();clock.accept(reply(now,start+MAX),sent);assert.equal(clock.state().expired,false);assert.equal(clock.due(),false)}
 now=start+MAX-60000;clock.activity();clock.accept(reply(now,start+MAX,start+MAX),clock.sent());assert.equal(clock.state().absolute,true);assert.equal(clock.state().warning,true);
 now=start+MAX;assert.equal(clock.state().expired,true);
});
test('server deadlines account for network transit and reject malformed or widened limits',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const sent=clock.sent(),server=now;
 now+=10000;clock.accept(reply(server,server+MAX,server+IDLE),sent);assert.equal(clock.state().remaining,IDLE-10000);
 assert.throws(()=>clock.accept({},sent));assert.throws(()=>clock.accept(reply(server,server+MAX+1),sent));
 now=sent+IDLE;assert.equal(clock.state().expired,true);clock.clear();clock.start();assert.equal(clock.state().expired,false);
});
test('queued input becomes stale during sleep and cannot generate a delayed heartbeat',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();clock.activity();const sent=clock.sent();now+=1;clock.activity();clock.accept(reply(sent),sent);
 now+=29*60000;assert.equal(clock.due(),false);assert.equal(clock.state().warning,true);
 now=sent+IDLE;assert.equal(clock.state().expired,true);
});
test('reload restores deadlines without extending them and rejects expired or widened snapshots',()=>{
 let now=1_800_000_000_000;const before=create(()=>now);before.start();const saved=before.snapshot();now+=10*60000;
 const after=create(()=>now);after.start(saved);assert.deepEqual(after.snapshot(),saved);assert.equal(after.state().remaining,20*60000);
 for(const invalid of [{...saved,idle:NaN},{...saved,absolute:now+MAX+1},{...saved,idle:now+IDLE+1},{absolute:now+1,idle:now+2}])assert.throws(()=>create(()=>now).start(invalid));
 now=saved.idle;assert.throws(()=>create(()=>now).start(saved));
});
