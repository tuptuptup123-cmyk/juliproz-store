const {test}=require('node:test'),assert=require('node:assert/strict');
const {monthOf,shiftMonth,dayState,totals}=require('../admin-schedule.js');
test('calendar month navigation handles year boundaries and leap February',()=>{
 assert.equal(monthOf('2026-10-31'),'2026-10-01');assert.equal(shiftMonth('2026-12-01',1),'2027-01-01');assert.equal(shiftMonth('2026-01-01',-1),'2025-12-01');assert.equal(shiftMonth('2028-01-01',1),'2028-02-01');
});
test('daily status distinguishes future work, missed duty and revoked staff',()=>{
 const d={manager_id:'a',active:true,uploaded:3,target:10,day:'2026-10-15'};
 assert.equal(dayState(d,'2026-10-15'),'today');assert.equal(dayState(d,'2026-10-16'),'missed');assert.equal(dayState(d,'2026-10-14'),'planned');assert.equal(dayState({...d,uploaded:12},'2026-10-15'),'done');assert.equal(dayState({...d,active:false},'2026-10-15'),'inactive');assert.equal(dayState({...d,manager_id:null},'2026-10-15'),'free');
});
test('monthly report keeps out-of-duty uploads separate from completed duty and system imports',()=>{
 const rows=totals({today:'2026-10-15',members:[{user_id:'a',display_name:'Анна'},{user_id:'b',display_name:'Борис'}],counts:[{day:'2026-10-15',actor_id:'a',label:'Анна',count:11,deleted_count:1},{day:'2026-10-15',actor_id:'b',label:'Борис',count:3,deleted_count:0},{day:'2026-10-15',actor_id:null,label:'Система',count:20,deleted_count:0}],days:[{day:'2026-10-15',manager_id:'a',manager_label:'Анна',uploaded:11,target:10},{day:'2026-10-16',manager_id:'b',manager_label:'Борис',uploaded:0,target:10}]});
 assert.deepEqual(rows.find(r=>r.id==='a'),{id:'a',name:'Анна',uploaded:11,deleted:1,duties:1,completed:1});assert.equal(rows.find(r=>r.id==='b').completed,0);assert.equal(rows.find(r=>r.id===null).duties,0);
});
