const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('SALE labels are larger on catalogue without adding percentages',()=>{
 const css=fs.readFileSync(path.join(root,'style.css'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(css,/\.product h3 \.card-sale-badge\{font-size:10px;padding:3px 7px\}/);

 assert.ok(app.includes('class="card-sale-badge">SALE</span>'));
 assert.ok(!app.includes('class="detail-sale-badge"'));
 assert.ok(app.includes('{showPercentage:false}'));
});
test('leggings are offered in the editable category suggestions',()=>{
 assert.ok(fs.readFileSync(path.join(root,'admin.html'),'utf8').includes('<option>Леггинсы</option>'));
});
