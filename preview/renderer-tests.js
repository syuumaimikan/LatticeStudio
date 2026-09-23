'use strict';
document.querySelector('#run').onclick=async()=>{
 const result=document.querySelector('#results');result.textContent='検証中…';const lines=[];
 const canvas=document.querySelector('#test'),r=new SceneRenderer(canvas);let count=0;
 const shape=(id,color,track=0)=>({...Lattice.createClip(id,'shape',0,track),color,width:1200,height:1200,duration:.2});
 const project=clips=>({version:2,name:'描画検証',trackCount:6,clips});
 const pixel=(x,y)=>[...r.ctx.getImageData(x,y,1,1).data];
 const check=(value,label)=>{if(!value)throw Error(label);lines.push('PASS '+label);count++;};
 const draw=(clips,time=0)=>{const p=project(clips);r.sync(p,[]);r.draw(p,time,{strict:true});};
 try{
  const back=shape('back','#ff0000'),front=shape('front','#0000ff',1);back.z=1000;front.z=-1000;
  draw([front,back]);check(pixel(480,270)[2]>240,'上位レイヤーはZ値に関係なく前面');
  front.track=0;back.track=2;draw([front,back]);check(pixel(480,270)[0]>240,'レイヤー移動で重なりが逆転');
  const base=shape('base','#ff0000'),mask={...shape('mask','#ffffff',1),kind:'mask',shape:'circle',width:400,height:400,maskTarget:'base'};
  draw([base,mask]);check(pixel(480,270)[0]>240&&pixel(555,270)[0]<20,'円のクリッピングで対象素材だけを切り抜く');
  const camera={...Lattice.createClip('cam','camera',0,4),scale:200,duration:.2};
  draw([base]);const unzoomed=pixel(680,270)[0];draw([base,camera]);check(unzoomed<20&&pixel(680,270)[0]>240,'カメラのスケールで画角が拡大');
  const anim=shape('anim','#00ff00');Lattice.setKey(anim,'x',0,-800);Lattice.setKey(anim,'x',.2,800);draw([anim],.1);check(pixel(480,270)[1]>240,'中間フレームのアニメーションを描画');
  const text={...Lattice.createClip('txt','text',0,0),text:'日本語テキスト',color:'#ffffff',duration:.2};await document.fonts.ready;draw([text]);
  const data=r.ctx.getImageData(200,170,560,200).data;check(data.some((v,i)=>i%4===0&&v>220),'日本語文字の描画');
  base.shader={enabled:true,code:'vec4 effect(vec2 uv, vec4 color){return vec4(1.0-color.rgb,color.a);}'};draw([base]);const inverted=pixel(480,270);check(inverted[0]<10&&inverted[1]>240&&inverted[2]>240,'カスタムGLSLによる色反転');
  let failed=false;try{r.shader.compile('invalid shader');}catch{failed=true;}check(failed,'不正なシェーダーを拒否');draw([base]);check(pixel(480,270)[1]>240,'コンパイル失敗後も元のシェーダーが動作');
  if(location.port==='8766'){
   const state=await(await fetch('/api/state')).json(),p=project([base]);
   const post=async(path,body)=>{const response=await fetch(path,{method:'POST',headers:{'X-Lattice-Token':state.token,'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;};
   const session=await post('/api/render/start',{project:p,quality:'4k'});
   canvas.width=session.width;canvas.height=session.height;
   for(let frame=0;frame<session.frames;frame++){r.draw(p,frame/30,{strict:true});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const response=await fetch(`/api/render/frame/${session.id}/${frame}`,{method:'POST',headers:{'X-Lattice-Token':state.token},body:blob});if(!response.ok)throw Error((await response.json()).error);}
   const done=await post('/api/render/finish',{id:session.id});let job;
   const deadline=Date.now()+30000;
   do{const s=await(await fetch('/api/state')).json();job=s.jobs.find(j=>j.id===done.job);if(['done','error'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,300));}while(Date.now()<deadline);
   check(job.status==='done','カスタムシェーダー付き実4K MP4を生成');lines.push('出力: '+job.result);
  }
  result.textContent=lines.join('\n')+'\n'+count+' tests passed';
 }catch(error){result.textContent=lines.join('\n')+'\nFAIL '+error.message;}finally{r.dispose();}
};
