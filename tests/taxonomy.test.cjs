const assert=require('node:assert/strict'),{test}=require('node:test');
const T=require('../catalog-taxonomy'),S=require('../product-sizes');
test('known spelling aliases and collaboration separators produce one brand option',()=>{
 assert.deepEqual(T.unique(['AMIRI','Amiri','Hermes','Hermès','RIMOWA','Rimowa'].flatMap(T.brandParts)),['Amiri','Hermès','Rimowa']);
 assert.deepEqual(T.brandParts('C.P.company X Palace × C.P. Company'),['C.P. Company','Palace']);
 assert.deepEqual(T.brandParts('ON × LOEWE'),T.brandParts('On x Loewe'));
 assert.deepEqual(T.brandParts('Off-White'),['Off-White']);
});
test('category aliases share a filter without merging distinct clothing types',()=>{
 assert.deepEqual(T.unique(['Кепка','Шапка','Панама','Головной убор'].map(T.category)),['Головной убор']);
 assert.deepEqual(T.unique(['Подвеска','Кольцо','Серьга','Украшения'].map(T.category)),['Украшения']);
 assert.equal(T.category('  аксессуары  '),'Аксессуары');assert.equal(T.category('Лонгслив'),'Лонгсливы');
 assert.notEqual(T.category('Куртки'),T.category('Жилеты'));assert.equal(T.category('Новая категория'),'Новая категория');
});
test('size spelling aliases retain legacy stock counts and fail closed on ambiguity',()=>{
 assert.deepEqual(S.parse('o/s; OS; One Size'),['One Size']);assert.equal(S.stockFor({stock_quantities:{'o/s':4}},'One Size'),4);
 assert.equal(S.stockFor({stock_quantities:{'o/s':4,OS:5}},'One Size'),0);
 assert.deepEqual(S.parse('Длинна: 16 см; Длина: 16 см'),['Длина: 16 см']);
 assert.equal(S.stockFor({stock_quantities:{'Длинна: 16 см':2}},'Длина: 16 см'),2);
});

test('catalog search handles accents, Russian aliases, punctuation and whitespace',()=>{
 assert.equal(T.searchText('  Hermès  '),'hermes');
 assert.equal(T.searchText('Эрмес кроссовки'),'hermes кроссовки');
 assert.equal(T.searchText('C.P. Company'),T.searchText('C P Company'));
 assert.equal(T.searchText('№ 257; Щётка'),'257 щетка');
});
test('decimal comma stock keys match displayed sizes without inventing inventory',()=>{
 const p={size:'37,5; 38',stock_quantities:{'37,5':2,'38':0}};
 assert.equal(S.stockFor(p,S.parse(p.size)[0]),2);
 assert.equal(S.stockUnits(p),2);
 assert.equal(S.stockFor(p,'38'),0);
 assert.equal(S.normalize('37,5'),'37.5');
});
