const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
test('EQ initializes on playback, applies clip/master gains and reconnects replaced media',async()=>{
 let sources=0;const node=()=>({connect(){},disconnect(){this.disconnected=true;},gain:{setTargetAtTime(v){this.value=v;}},frequency:{},Q:{}});
 class AudioContext{constructor(){this.destination={};this.currentTime=0;}createBiquadFilter(){return node();}createMediaElementSource(){sources++;return node();}async resume(){}}
 const media={},ctx={AudioContext,project:{masterEq:{low:4},clips:[{id:'a',eq:{mid:9}}]},renderer:{sources:new Map([['a',media]])},playing:false,exporting:false,togglePlay(){},renderFrame(){},toast(){}};
 vm.createContext(ctx);const code=fs.readFileSync('preview/audio-editor.js','utf8').split('const eqButton=')[0];vm.runInContext(code+';this.mixer=AudioMixer;',ctx);
 vm.runInContext('togglePlay()',ctx);await new Promise(setImmediate);
 assert.equal(ctx.mixer.master[0].gain.value,4);assert.equal(ctx.mixer.chains.get('a').filters[1].gain.value,9);
 ctx.project.clips[0].eq={enabled:false,mid:9};ctx.mixer.update();assert.equal(ctx.mixer.chains.get('a').filters[1].gain.value,0);
 const old=ctx.mixer.chains.get('a');ctx.renderer.sources.set('a',{});ctx.mixer.update();assert.equal(sources,2);assert.equal(old.source.disconnected,true);
});
test('main transport invokes current playback handler',()=>{const code=fs.readFileSync('preview/app.js','utf8');const binding=code.match(/\$\('#play'\)\.onclick=[^;]+;/)[0];const button={},ctx={$:()=>button,togglePlay:()=>{throw Error('stale handler');}};vm.createContext(ctx);vm.runInContext(binding,ctx);let called=false;ctx.togglePlay=()=>called=true;button.onclick();assert.equal(called,true);});

