const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('WASM preserves RGB channels and rejects frames above 4K',async()=>{
 const {instance:{exports:m}}=await WebAssembly.instantiate(fs.readFileSync(path.join(__dirname,'../preview/pixels.wasm')));
 new Uint8Array(m.memory.buffer,m.input_ptr(),12).set([255,0,0,255,0,255,0,128,0,0,255,0]);
 assert.equal(m.rgba_to_rgb(3),9);
 assert.deepEqual(Array.from(new Uint8Array(m.memory.buffer,m.output_ptr(),9)),[255,0,0,0,255,0,0,0,255]);
 assert.equal(m.rgba_to_rgb(3840*2160+1),0);
});
