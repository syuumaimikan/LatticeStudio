'use strict';

class ShaderEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.programs = new Map();
    if (!this.gl) return;
    const gl = this.gl;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  compile(source) {
    if (!this.gl || this.gl.isContextLost()) throw Error('WebGLを利用できません。ブラウザーのGPU設定を確認してください。');
    if (this.programs.has(source)) return this.programs.get(source);
    const gl = this.gl;
    const shaders = [];
    const program = gl.createProgram();
    try {
      for (const [type, text] of [
        [gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 v_uv; void main(){v_uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'],
        [gl.FRAGMENT_SHADER, `precision highp float;
uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_resolution;
varying vec2 v_uv;
vec4 sampleSource(vec2 uv){return texture2D(u_texture,uv);}
#line 1
${source}
void main(){vec4 c=sampleSource(v_uv);gl_FragColor=effect(v_uv,c);}`],
      ]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, text);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      const result = { program, position: gl.getAttribLocation(program, 'position'),
        time: gl.getUniformLocation(program, 'u_time'), resolution: gl.getUniformLocation(program, 'u_resolution'),
        texture: gl.getUniformLocation(program, 'u_texture') };
      if (this.programs.size >= 24) {
        const first = this.programs.keys().next().value;
        gl.deleteProgram(this.programs.get(first).program);
        this.programs.delete(first);
      }
      this.programs.set(source, result);
      return result;
    } catch (error) { gl.deleteProgram(program); throw error; }
    finally { for (const shader of shaders) gl.deleteShader(shader); }
  }

  render(source, code, time, width, height) {
    const gl = this.gl, p = this.compile(code);
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (width > maxSize || height > maxSize) throw Error('シェーダーの描画サイズがGPUの上限を超えています。');
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(p.position);
    gl.vertexAttribPointer(p.position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(p.texture, 0);
    gl.uniform1f(p.time, time);
    gl.uniform2f(p.resolution, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  dispose() {
    if (!this.gl) return;
    for (const p of this.programs.values()) this.gl.deleteProgram(p.program);
    this.gl.deleteTexture(this.texture); this.gl.deleteBuffer(this.buffer);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

class SceneRenderer {
  constructor(canvas, onError = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sources = new Map();
    this.shader = new ShaderEngine();
    this.scratch = document.createElement('canvas');
    this.onError = onError;
    this.errors = new Set();
    this.hitRegions = [];
  }

  report(error) {
    if (!this.errors.has(error.message)) { this.errors.add(error.message); this.onError(error.message); }
  }

  sync(project, assets, quality = 'proxy') {
    this.assets = new Map(assets.map(a => [a.id, a]));
    const wanted = new Set(project.clips.filter(c => c.kind === 'media').map(c => c.id));
    for (const [id, v] of this.sources) if (!wanted.has(id)) {
      v.pause(); v.removeAttribute('src'); v.load(); this.sources.delete(id);
    }
    for (const c of project.clips) {
      if (c.kind !== 'media') continue;
      const a = this.assets.get(c.asset);
      if (!a) continue;
      let media = this.sources.get(c.id);
      if (!media) {
        media = document.createElement(a.kind === 'video' ? 'video' : 'audio');
        media.preload = 'metadata'; media.playsInline = true;
        media.addEventListener('loadeddata', () => this.onInvalidate?.());
        media.addEventListener('seeked', () => this.onInvalidate?.());
        media.addEventListener('error', () => this.report(Error(a.name + ' を再生できません。プロキシ生成完了後に軽量版を選択してください。')));
        this.sources.set(c.id, media);
      }
      const url = quality === 'proxy' && a.proxy ? a.proxy : a.url;
      if (media.dataset.source !== url) { media.pause(); media.src = url; media.dataset.source = url; media.load(); }
    }
  }

  pause() { for (const media of this.sources.values()) media.pause(); }

  async seekExact(project, time, signal) {
    await Promise.all(project.clips.filter(c => c.kind === 'media' && Lattice.active(c, time)).map(async c => {
      const media = this.sources.get(c.id);
      if (!media) throw Error('書き出し用の素材が見つかりません。');
      media.pause();
      const awaitEvent = (event, ready) => new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(Error('書き出しを中止しました。'));
        if (ready()) return resolve();
        const cleanup = () => { clearTimeout(timer); media.removeEventListener(event, done); media.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
        const done = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(Error('元画質の素材をデコードできません。H.264 MP4に変換して再読み込みしてください。')); };
        const abort = () => { cleanup(); reject(Error('書き出しを中止しました。')); };
        const timer = setTimeout(fail, 120000);
        media.addEventListener(event, done, { once: true }); media.addEventListener('error', fail, { once: true });
        signal?.addEventListener('abort', abort, { once: true });
      });
      await awaitEvent('loadeddata', () => media.readyState >= 2);
      const target = Math.min(media.duration - .001, c.sourceIn + time - c.start);
      if (Math.abs(media.currentTime - target) > .0001) {
        media.currentTime = Math.max(0, target);
        await awaitEvent('seeked', () => !media.seeking && media.readyState >= 2);
      }
    }));
  }

  camera(project, time) {
    const cameras = Lattice.sorted(project).filter(c => c.kind === 'camera' && Lattice.active(c, time));
    return cameras.length ? Lattice.evaluate(cameras[cameras.length - 1], time) : { x:0,y:0,z:0,rotation:0,scale:100 };
  }

  geometry(c, camera) {
    let dx = c.x - camera.x, dy = c.y - camera.y, dz = c.z - camera.z;
    let cx = 0, cy = 0;
    if (camera.rotationX) {
      cx = -camera.rotationX * Math.PI / 180;
      const cos = Math.cos(cx), sin = Math.sin(cx);
      const y = dy * cos - dz * sin, z = dy * sin + dz * cos;
      dy = y; dz = z;
    }
    if (camera.rotationY) {
      cy = -camera.rotationY * Math.PI / 180;
      const cos = Math.cos(cy), sin = Math.sin(cy);
      const x = dx * cos + dz * sin, z = -dx * sin + dz * cos;
      dx = x; dz = z;
    }
    const depth = 2000 / Math.max(100, 2000 - dz);
    return { x:dx, y:dy, scale:c.scale / 100 * depth,
      rotation:c.rotation * Math.PI / 180,
      matrix: [Math.cos(cy), 0, Math.sin(cx) * Math.sin(cy), Math.cos(cx)]
    };
  }

  transform(ctx, c, camera) {
    const g = this.geometry(c, camera);
    ctx.translate(g.x, g.y);
    ctx.transform(g.matrix[0], g.matrix[1], g.matrix[2], g.matrix[3], 0, 0);
    ctx.rotate(g.rotation); ctx.scale(g.scale, g.scale);
  }

  path(ctx, c) {
    const w=c.width, h=c.height;
    ctx.beginPath();
    if (c.shape === 'circle'||c.shape==='ellipse') ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
    else if (c.shape === 'triangle') { ctx.moveTo(0,-h/2); ctx.lineTo(w/2,h/2); ctx.lineTo(-w/2,h/2); ctx.closePath(); }
    else if (c.shape === 'star') {
      for (let i=0;i<10;i++) { const angle=i*Math.PI/5-Math.PI/2, radius=i%2?.43:1; const x=Math.cos(angle)*w/2*radius,y=Math.sin(angle)*h/2*radius; i?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.closePath();
    } else if(c.shape==='diamond'){ctx.moveTo(0,-h/2);ctx.lineTo(w/2,0);ctx.lineTo(0,h/2);ctx.lineTo(-w/2,0);ctx.closePath();}
    else if(c.shape==='hexagon'){for(let i=0;i<6;i++){const a=i*Math.PI/3;i?ctx.lineTo(Math.cos(a)*w/2,Math.sin(a)*h/2):ctx.moveTo(Math.cos(a)*w/2,Math.sin(a)*h/2);}ctx.closePath();}
    else if(c.shape==='arrow'){ctx.moveTo(-w/2,-h/6);ctx.lineTo(0,-h/6);ctx.lineTo(0,-h/2);ctx.lineTo(w/2,0);ctx.lineTo(0,h/2);ctx.lineTo(0,h/6);ctx.lineTo(-w/2,h/6);ctx.closePath();}
    else if(c.shape==='heart'){ctx.moveTo(0,h/2);ctx.bezierCurveTo(-w,-h/8,-w/3,-h*.8,0,-h/4);ctx.bezierCurveTo(w/3,-h*.8,w,-h/8,0,h/2);ctx.closePath();}
    else if(c.shape==='ring'){ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);ctx.moveTo(w*.35,0);ctx.ellipse(0,0,w*.35,h*.35,0,0,Math.PI*2,true);}
    else ctx.rect(-w/2,-h/2,w,h);
  }

  source(c, time, outputScale) {
    if (c.kind === 'media') return this.sources.get(c.id);
    if (c.kind === 'camera') {
      const sw = Math.max(2, Math.round(200*outputScale)), sh = Math.max(2, Math.round(150*outputScale));
      if (this.scratch.width!==sw||this.scratch.height!==sh) { this.scratch.width=sw;this.scratch.height=sh; }
      const ctx=this.scratch.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,sw,sh);
      ctx.scale(outputScale,outputScale);
      ctx.strokeStyle='#ffffff';ctx.lineWidth=4;ctx.lineJoin='round';
      ctx.strokeRect(20,20,100,110);
      ctx.beginPath();ctx.moveTo(120,50);ctx.lineTo(170,20);ctx.lineTo(170,130);ctx.lineTo(120,100);ctx.stroke();
      return this.scratch;
    }
    const w = c.kind === 'text' ? (this.sceneWidth||3840) : c.width;
    const h = c.kind === 'text' ? (this.sceneHeight||2160) : c.height;
    const sw = Math.max(2, Math.round(w*outputScale)), sh = Math.max(2,Math.round(h*outputScale));
    if (this.scratch.width!==sw||this.scratch.height!==sh) { this.scratch.width=sw;this.scratch.height=sh; }
    const ctx=this.scratch.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,sw,sh);
    ctx.scale(outputScale,outputScale);ctx.translate(w/2,h/2);ctx.fillStyle=c.color;
    if (c.kind==='text') {
      ctx.font=`600 ${c.fontSize}px "Yu Gothic UI", "Meiryo", sans-serif`;
      ctx.textAlign=c.align||'center';ctx.textBaseline='middle';
      const content=c.builtin==='timecode'?new Date(Math.max(0,time)*1000).toISOString().slice(11,23):c.text;
      const lines=content.split('\n'), lineHeight=c.fontSize*1.3;
      lines.forEach((line,i)=>ctx.fillText(line,c.align==='left'?-w*.47:c.align==='right'?w*.47:0,(i-(lines.length-1)/2)*lineHeight,w*.94));
    } else if(c.shape==='grid'||c.shape==='checker'){
      const size=Math.max(16,Math.min(w,h)/12);ctx.strokeStyle=c.color;ctx.lineWidth=Math.max(1,2/outputScale);
      for(let y=-h/2,row=0;y<h/2;y+=size,row++)for(let x=-w/2,col=0;x<w/2;x+=size,col++){if(c.shape==='checker'){if((row+col)%2===0)ctx.fillRect(x,y,size,size);}else ctx.strokeRect(x,y,size,size);}
    } else {if(c.shape==='gradient'){const gradient=ctx.createLinearGradient(-w/2,0,w/2,0);gradient.addColorStop(0,c.color);gradient.addColorStop(1,'#000000');ctx.fillStyle=gradient;}this.path(ctx,c);ctx.fill(); }
    return this.scratch;
  }

  draw(project, time, { playing=false, strict=false, selected=null, guides=false, framing="contain", spatial=false, orbitX=0, orbitY=0, viewPanX=0, viewPanY=0, viewZoom=1 }={}) {
    const sceneWidth=project.width||3840,sceneHeight=project.height||2160;this.sceneWidth=sceneWidth;this.sceneHeight=sceneHeight;
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,ratio=(framing==='cover'?Math.max:Math.min)(w/sceneWidth,h/sceneHeight);
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.filter='none';ctx.fillStyle='#080d0b';ctx.fillRect(0,0,w,h);
    const projectCamera=this.camera(project,time);
    const camera = (!strict && spatial) ? {x: -viewPanX*10, y: -viewPanY*10, z: -2000 * (1 - 1/viewZoom), rotation:0, rotationX:orbitX, rotationY:orbitY, scale:100/viewZoom} : projectCamera;
    const ordered=Lattice.sorted(project).filter(c=>Lattice.active(c,time));
    const masks=ordered.filter(c=>c.kind==='mask');
    const cameraScale=camera.scale/100;
    this.hitRegions=[];
    for (const c of project.clips) {
      const media=this.sources.get(c.id);
      if (!media) continue;
      media.volume=c.volume/100;
      if (!Lattice.active(c,time)) { media.pause();continue; }
      if (!strict) {
        const target=c.sourceIn+time-c.start;
        if (media.readyState>=2&&!media.seeking&&Math.abs(media.currentTime-target)>(playing?.18:.018)) media.currentTime=Math.max(0,Math.min(media.duration-.001,target));
        if (playing&&media.paused&&!media.seeking) media.play().catch(()=>{});
        else if (!playing) media.pause();
      }
    }
    ctx.save();ctx.translate((w-sceneWidth*ratio)/2,(h-sceneHeight*ratio)/2);ctx.scale(ratio,ratio);ctx.beginPath();ctx.rect(0,0,sceneWidth,sceneHeight);ctx.clip();ctx.translate(sceneWidth/2,sceneHeight/2);ctx.rotate(-camera.rotation*Math.PI/180);ctx.scale(cameraScale,cameraScale);
    const cameraMatrix=ctx.getTransform();
    for (const clip of ordered) {
      const isCamera = clip.kind === 'camera';
      const isModel = clip.kind === 'model';
      if ((isCamera && !spatial) || clip.kind === 'mask' || this.assets?.get(clip.asset)?.kind==='audio') continue;
      const c=Lattice.evaluate(clip,time), geometry=this.geometry(c,camera);
      ctx.save();
      for (const maskClip of masks) {
        const target=maskClip.maskTarget || [...ordered].reverse().find(v=>v.track<maskClip.track&&!['camera','mask'].includes(v.kind))?.id;
        if (target!==c.id) continue;
        const mask=Lattice.evaluate(maskClip,time), before=ctx.getTransform();
        this.transform(ctx,mask,camera);this.path(ctx,mask);ctx.clip();ctx.setTransform(before);
      }
      
      if (!isModel) this.transform(ctx,c,camera);
      
      try {
        let src = null;
        if (isModel) {
            const asset = this.assets?.get(c.asset);
            if (asset && window.modelRenderer) {
                src = window.modelRenderer.render(asset.url, c, camera, Math.max(2, Math.round(sceneWidth * ratio)), Math.max(2, Math.round(sceneHeight * ratio)), ratio);
            }
        } else {
            src = this.source(c,time,ratio);
        }
        if (!src || (c.kind==='media' && src.readyState<2)) {ctx.restore();continue;}
        
        let width = isModel ? sceneWidth : c.kind==='text'?sceneWidth:c.kind==='media'?this.assets.get(c.asset).width:c.kind==='camera'?200:c.width;
        let height = isModel ? sceneHeight : c.kind==='text'?sceneHeight:c.kind==='media'?this.assets.get(c.asset).height:c.kind==='camera'?150:c.height;
        if (c.kind==='media') {const fit=Math.min(sceneWidth/width,sceneHeight/height);width*=fit;height*=fit;}
        
        if (isModel) {
            ctx.save();
            ctx.setTransform(1,0,0,1,(w-sceneWidth*ratio)/2,(h-sceneHeight*ratio)/2);
            ctx.globalAlpha=c.opacity/100;
            if (c.shader?.enabled) src=this.shader.render(src,c.shader.code,time-c.start+(c.shaderOffset||0),Math.max(2,Math.round(width*ratio)),Math.max(2,Math.round(height*ratio)));
            const effects=c.effects||{};
            ctx.filter=`brightness(${1+(effects.brightness||0)}) contrast(${effects.contrast??1}) saturate(${effects.saturation??1})`;
            ctx.drawImage(src, 0, 0, Math.round(sceneWidth*ratio), Math.round(sceneHeight*ratio));
            ctx.restore();
            
            ctx.save();
            this.transform(ctx, c, camera);
            const matrix=ctx.getTransform();
            this.hitRegions.push({id:c.id,inverse:matrix.inverse(),width:1000,height:1000});
            ctx.restore();
            if (guides&&selected===c.id) {ctx.strokeStyle='#d0ffdf';ctx.lineWidth=2/(ratio*geometry.scale*cameraScale);ctx.strokeRect(-1000/2,-1000/2,1000,1000);}
        } else {
            if (c.shader?.enabled) src=this.shader.render(src,c.shader.code,time-c.start+(c.shaderOffset||0),Math.max(2,Math.round(width*ratio)),Math.max(2,Math.round(height*ratio)));
            ctx.globalAlpha=c.opacity/100;
            const effects=c.effects||{};
            ctx.filter=`brightness(${1+(effects.brightness||0)}) contrast(${effects.contrast??1}) saturate(${effects.saturation??1})`;
            ctx.drawImage(src,-width/2,-height/2,width,height);
            ctx.filter='none';ctx.globalAlpha=1;
            const matrix=ctx.getTransform();
            this.hitRegions.push({id:c.id,inverse:matrix.inverse(),width,height});
            if (guides&&selected===c.id) {ctx.strokeStyle='#d0ffdf';ctx.lineWidth=2/(ratio*geometry.scale*cameraScale);ctx.strokeRect(-width/2,-height/2,width,height);}
        }
      } catch (error) { if (strict) {ctx.restore();ctx.restore();throw error;}this.report(error); }
      ctx.restore();
    }
    if (guides) for (const clip of masks) if (clip.id===selected) {
      ctx.save();this.transform(ctx,Lattice.evaluate(clip,time),camera);this.path(ctx,clip);ctx.strokeStyle='#f2c688';ctx.lineWidth=3/ratio;ctx.setLineDash([20,15]);ctx.stroke();ctx.restore();
    }
    ctx.restore();
  }

  pick(x,y) {
    for (const r of [...this.hitRegions].reverse()) {
      const p=new DOMPoint(x,y).matrixTransform(r.inverse);
      if (Math.abs(p.x)<=r.width/2&&Math.abs(p.y)<=r.height/2) return r.id;
    }
    return null;
  }

  dispose() { this.pause();for (const v of this.sources.values()){v.removeAttribute('src');v.load();}this.sources.clear();this.shader.dispose(); }
}
