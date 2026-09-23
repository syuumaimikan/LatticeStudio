'use strict';
window.PixelEngine = {
 async init(){
  if(this.ready)return this.ready;
  return this.ready=(async()=>{try{const r=await fetch('pixels.wasm');if(!r.ok)throw Error('WASM unavailable');this.wasm=(await WebAssembly.instantiate(await r.arrayBuffer())).instance.exports;return true;}catch(e){this.error=e.message;return false;}})();
 },
 rgb(ctx,w,h){
  const rgba=ctx.getImageData(0,0,w,h).data, m=this.wasm;
  new Uint8Array(m.memory.buffer,m.input_ptr(),rgba.length).set(rgba);
  const length=m.rgba_to_rgb(w*h);if(!length)throw Error('WASMの画像サイズ上限を超えました。');
  return new Uint8Array(m.memory.buffer,m.output_ptr(),length);
 }
};
PixelEngine.init();
