const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,MAX}=require('../admin-session.js');
const reply=(now,max=now+MAX)=>({server_now:new Date(now).toISOString(),expires_at:new Date(max).toISOString(),idle_expires_at:null});
test('session stays active without input for a week and expires exactly at seven days',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const start=now;
 for(const elapsed of [30*60000,12*3600000,6*86400000]){now=start+elapsed;assert.equal(clock.state().expired,false);assert.equal(clock.state().warning,false)}
 now=start+MAX-120000;assert.equal(clock.state().warning,true);
 now=start+MAX;assert.equal(clock.state().expired,true);assert.equal(clock.accept(reply(now),now),false);
});
test('server checks and token refresh never extend the original sign-in deadline',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const deadline=clock.deadline();
 for(let i=0;i<6;i++){now+=86400000;clock.accept(reply(now),now);assert.equal(clock.deadline(),deadline)}
 now=deadline;assert.equal(clock.state().expired,true);
});
test('server deadline includes network transit and rejects malformed or widened limits',()=>{
 let now=1_800_000_000_000;const clock=create(()=>now);clock.start();const sent=now;
 now+=10000;clock.accept(reply(sent),sent);assert.equal(clock.state().remaining,MAX-10000);
 assert.throws(()=>clock.accept({},sent));assert.throws(()=>clock.accept(reply(sent,sent+MAX+1),sent));
 clock.accept(reply(now,now+60000),now);assert.equal(clock.state().remaining,60000);
});
test('restoring a browser session retains its original deadline and never resets the week',()=>{
 let now=1_800_000_000_000;const first=create(()=>now);first.start();const saved=first.deadline();
 now+=6*86400000;const reopened=create(()=>now);reopened.start(saved);assert.equal(reopened.state().remaining,86400000);
 now=saved;assert.equal(reopened.state().expired,true);reopened.clear();reopened.start();assert.equal(reopened.state().remaining,MAX);
 assert.throws(()=>reopened.start(NaN));assert.throws(()=>reopened.start(now+MAX+1));
});
