const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../preview/editor-core.js');
const clip = () => C.createClip('clip','shape',0,0);
test('linear, smooth and hold interpolation',()=>{
 const c=clip();C.setKey(c,'x',0,0);C.setKey(c,'x',2,100);
 assert.equal(C.valueAt(c,'x',1),50);assert.equal(C.valueAt(c,'x',-1),0);assert.equal(C.valueAt(c,'x',5),100);
 c.keys.x[0].easing='smooth';assert.equal(C.valueAt(c,'x',.5),15.625);
 c.keys.x[0].easing='hold';assert.equal(C.valueAt(c,'x',1.99),0);assert.equal(C.valueAt(c,'x',2),100);
});
test('auto-key preserves initial value and replaces same-frame key',()=>{
 const c=clip();c.scale=80;C.changeValue(c,'scale',1,160,true,'linear');
 assert.deepEqual(c.keys.scale.map(k=>k.value),[80,160]);C.setKey(c,'scale',1,200);assert.equal(c.keys.scale.length,2);assert.equal(C.valueAt(c,'scale',.5),140);
});
test('layer ordering takes precedence over depth',()=>{
 const back=clip();back.z=1500;const front=clip();front.id='front';front.track=1;front.z=-1500;
 assert.deepEqual(C.sorted({clips:[front,back]}).map(c=>c.id),['clip','front']);
});
test('split retains smooth trajectory, source offset and shader clock',()=>{
 const c=clip();c.duration=4;c.sourceIn=2;C.setKey(c,'x',0,0,'smooth');C.setKey(c,'x',4,100);
 const [a,b]=C.splitClip(c,1,'right');assert.equal(a.duration,1);assert.equal(b.sourceIn,3);assert.equal(b.shaderOffset,1);
 for(const t of [0,.5,1,2,2.99])assert.equal(C.valueAt(b,'x',t),C.valueAt(c,'x',t+1));
});
test('legacy project migrates without changing original data',()=>{
 const p={version:1,name:'日本語',clips:[{...clip(),kind:undefined,keys:undefined}]};const migrated=C.migrate(p);
 assert.equal(p.version,1);assert.equal(migrated.version,2);assert.equal(migrated.trackCount,6);assert.equal(migrated.clips[0].kind,'media');
});
test('frame snapping and endpoint exclusion',()=>{
 const c=clip();assert.equal(C.snap(.049),1/30);assert.ok(C.active(c,0));assert.ok(!C.active(c,5));
});
