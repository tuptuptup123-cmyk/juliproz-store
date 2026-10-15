const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,MAX}=require('../admin-session.js');
const DAY=86400000;
const reply=(now,max)=>({server_now:new Date(now).toISOString(),expires_at:new Date(max).toISOString(),idle_expires_at:new Date(max).toISOString()});
test('30 days without activity stay signed in; the exact boundary expires',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const start=now;
 assert.equal(MAX,30*DAY);
 for(const elapsed of [30*60000,12*3600000,DAY,29*DAY]){now=start+elapsed;assert.equal(clock.state().expired,false);assert.equal(clock.state().warning,false);assert.equal(clock.due(),false)}
 now=start+MAX-120000;assert.equal(clock.state().warning,true);assert.equal(clock.state().absolute,true);
 now=start+MAX;assert.equal(clock.state().expired,true);assert.equal(clock.activity(),false);
 assert.equal(clock.accept(reply(now,now+MAX),now),false,'late heartbeat cannot revive expired login');
});
test('activity and token refresh never move the original 30-day deadline',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const deadline=now+MAX;
 for(let i=0;i<29;i++){now+=DAY;clock.activity();const sent=clock.sent();clock.accept(reply(now,deadline),sent);assert.equal(clock.snapshot().absolute,deadline);assert.equal(clock.state().expired,false)}
 now=deadline;assert.equal(clock.state().expired,true);
});
test('server deadlines account for transit and cannot widen the client deadline',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const sent=clock.sent();
 now+=10000;clock.accept(reply(sent,sent+MAX),sent);assert.equal(clock.state().remaining,MAX-10000);
 assert.throws(()=>clock.accept({},sent));assert.throws(()=>clock.accept(reply(sent,sent+MAX+1),sent));
 clock.accept(reply(now,now+MAX),now);assert.equal(clock.snapshot().absolute,sent+MAX);
});
test('reopening after 29 days preserves the deadline; expired or forged snapshots fail',()=>{
 let now=1_800_000_000_000;const before=create(()=>now);before.start();const saved=before.snapshot();now+=29*DAY;
 const after=create(()=>now);after.start(saved);assert.deepEqual(after.snapshot(),saved);assert.equal(after.state().remaining,DAY);
 for(const invalid of [{...saved,idle:NaN},{...saved,absolute:now+MAX+1},{...saved,idle:now+MAX+1},{absolute:now+1,idle:now+2}])assert.throws(()=>create(()=>now).start(invalid));
 now=saved.absolute;assert.throws(()=>create(()=>now).start(saved));
});
test('queued activity before sleep does not generate background heartbeats on wake',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();clock.activity();now+=DAY;assert.equal(clock.due(),false);assert.equal(clock.state().expired,false);
});
