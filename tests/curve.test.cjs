const test=require('node:test'),assert=require('node:assert/strict'),C=require('../preview/editor-core.js');
test('Bezier accelerates and decelerates with correct time inversion',()=>{
 assert.ok(Math.abs(C.bezierAt(.5,[0,0,1,1])-.5)<1e-6);
 assert.ok(C.bezierAt(.5,[.42,0,1,1])<.4);
 assert.ok(C.bezierAt(.5,[0,0,.58,1])>.6);
});
test('Bezier split and serialization preserve the full animation',()=>{
 const c=C.createClip('a','shape',0,0);c.duration=4;c.keys.scale=[{time:0,value:100,easing:'bezier',curve:[.42,0,1,1]},{time:4,value:400,easing:'linear'}];
 const [a,b]=C.splitClip(JSON.parse(JSON.stringify(c)),1.5,'b');
 for(let t=0;t<4;t+=.05)assert.ok(Math.abs(C.valueAt(c,'scale',t)-(t<1.5?C.valueAt(a,'scale',t):C.valueAt(b,'scale',t-1.5)))<1e-6);
 assert.equal(C.valueAt(c,'scale',4),400);
});
