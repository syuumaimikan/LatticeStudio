const test=require('node:test');
const assert=require('node:assert/strict');
const UX=require('../preview/usability-core.js');
test('snap aligns a moving clip end to another clip start',()=>{
 const result=UX.snapPosition(2.94,2,[{id:'other',start:5,duration:2}], 'moving',20,.1);
 assert.ok(Math.abs(result.start-3)<1e-9);assert.equal(result.target,5);
});
test('snap ignores the dragged clip and respects tolerance',()=>{
 assert.equal(UX.snapPosition(4.95,2,[{id:'self',start:5,duration:2}], 'self',20,.1).target,null);
 assert.equal(UX.snapPosition(4.8,2,[], 'self',5,.1).target,null);
});
test('right trim snaps only its end, left trim only its start',()=>{
 assert.ok(Math.abs(UX.snapPosition(1,3.95,[], 'self',5,.1,'right').start-1.05)<1e-9);
 assert.equal(UX.snapPosition(2.05,3,[], 'self',2,.1,'left').start,2);
});
test('long projects fit the available timeline width',()=>{
 const z=UX.fitZoom(1100,7200);assert.ok(z*7200<=1100);assert.ok(z<1);
 assert.equal(UX.fitZoom(1100,0),200);
});
