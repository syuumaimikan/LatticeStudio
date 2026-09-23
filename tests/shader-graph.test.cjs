const test=require('node:test'),assert=require('node:assert/strict'),G=require('../preview/shader-graph-core.js');
test('shader graph emits source, color operation, and output in dependency order',()=>{
 const g=G.initial();g.nodes.push({id:'tint',type:'tint',color:'#80ff00'});g.links=[{from:'source',to:'tint',slot:0},{from:'tint',to:'output',slot:0}];
 const code=G.compile(g);assert.ok(code.includes('vec3(0.5020,1.0000,0.0000)'));assert.ok(code.indexOf('sampleSource')<code.indexOf('vec3'));
});
test('shader graph rejects cycles, missing connections and bad parameters',()=>{
 const g=G.initial();g.nodes.push({id:'a',type:'invert'});g.links=[{from:'a',to:'a',slot:0},{from:'a',to:'output',slot:0}];assert.throws(()=>G.compile(g),/循環/);
 g.links=[];assert.throws(()=>G.compile(g),/入力/);
 g.nodes[2]={id:'a',type:'exposure',value:Infinity};g.links=[{from:'source',to:'a',slot:0},{from:'a',to:'output',slot:0}];assert.throws(()=>G.compile(g),/範囲/);
});
