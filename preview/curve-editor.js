'use strict';
const curveButton=el('button','','曲線編集');curveButton.id='curveEditor';curveButton.title='スケール・位置などの変化をグラフで編集';$('#keyTab').after(curveButton);
$('#keyEasing').append(new Option('ベジェ曲線','bezier'));
curveButton.onclick=()=>{
 const clip=selection();if(!clip||exporting)return toast('曲線を編集する素材を選択してください。');stop();
 const box=showDialog('アニメーション曲線','横軸は素材内の時間、縦軸は値。●を動かしてキーを編集し、選択キーから次のキーまでの曲線をハンドルで調整します。');$('#dialog').classList.add('curvedialog');
 const bar=el('div','curvebar'),param=el('select'),preset=el('select'),add=el('button','','現在位置にキー'),init=el('button','','開始・終了にキー'),remove=el('button','','選択キーを削除');
 param.setAttribute('aria-label','曲線のパラメーター');for(const[p,s]of Object.entries(C.PARAMS))param.append(new Option(s.label,p));param.value='scale';
 preset.setAttribute('aria-label','曲線の種類');for(const[v,n]of [['linear','直線'],['smooth','なめらか'],['hold','瞬間移動'],['ease-in','ゆっくり開始'],['ease-out','ゆっくり終了'],['ease-in-out','ゆっくり開始・終了'],['bezier','自由なベジェ曲線']])preset.append(new Option(n,v));
 bar.append(param,preset,init,add,remove);box.append(bar);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 330');svg.setAttribute('class','curvegraph');svg.setAttribute('aria-label','キーフレーム曲線グラフ');box.append(svg);
 const values=el('div','curvebar'),seconds=el('input'),amount=el('input'),status=el('p','muted');seconds.type=amount.type='number';seconds.step='0.0333333333';amount.step='any';seconds.setAttribute('aria-label','キーの時刻（秒）');amount.setAttribute('aria-label','キーの値');values.append(el('span','','時刻（秒）'),seconds,el('span','','値'),amount);box.append(values,status);
 let chosen=null,view=null;const keys=()=>clip.keys[param.value]||[];
 function node(tag,attrs,text){const n=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);return n;}
 function refreshScene(){renderTimeline();renderInspector();renderFrame();scheduleSave();}
 function draw(frozen=false){
  const points=keys(),spec=C.PARAMS[param.value];if(!points.includes(chosen))chosen=points[0]||null;
  if(!frozen||!view){const vals=[clip[param.value],...points.map(k=>k.value)];let lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.2,Math.abs(hi)*.15,1);view={lo:lo-pad,hi:hi+pad};}
  const X=t=>58+t/clip.duration*712,Y=v=>285-(v-view.lo)/(view.hi-view.lo)*250;
  svg.replaceChildren();for(let i=0;i<=5;i++){const y=35+i*50,v=view.hi-i*(view.hi-view.lo)/5;node('line',{x1:58,y1:y,x2:770,y2:y,stroke:'#30483a'});node('text',{x:51,y:y+4,'text-anchor':'end',fill:'#a6bcad','font-size':11},String(Math.round(v*100)/100));const t=i*clip.duration/5,x=X(t);node('line',{x1:x,y1:35,x2:x,y2:285,stroke:'#263c30'});node('text',{x,y:310,'text-anchor':'middle',fill:'#a6bcad','font-size':11},t.toFixed(2)+'s');}
  let path='';for(let i=0;i<=300;i++){const t=i/300*clip.duration;path+=(i?'L':'M')+X(t)+','+Y(C.valueAt(clip,param.value,t));}node('path',{d:path,fill:'none',stroke:'#b0efcf','stroke-width':2.5});
  const at=C.clamp(time-clip.start,0,clip.duration);node('line',{x1:X(at),x2:X(at),y1:35,y2:285,stroke:'#ffe09a','stroke-dasharray':'4 4'});
  const next=points[points.indexOf(chosen)+1];preset.disabled=!chosen||!next;remove.disabled=!chosen;seconds.disabled=amount.disabled=!chosen;init.disabled=points.length>0;
  if(chosen){if(document.activeElement!==seconds)seconds.value=Number(chosen.time.toFixed(4));if(document.activeElement!==amount)amount.value=Number(chosen.value.toFixed(3));preset.value=chosen.easing||'linear';}
  status.textContent=points.length<2?'開始・終了にキーを追加し、終了キーの値を変更すると変化を作れます。':!next?'最後のキーです。曲線の形を変えるには1つ前のキーを選択してください。':'ハンドルをドラッグすると加速・減速が変わります。変更は自動保存され、この画面を閉じてCtrl+Zで取り消せます。';
  function drag(e,apply){if(e.button!==0)return;e.preventDefault();checkpoint();const rect=svg.getBoundingClientRect();const convert=ev=>({x:(ev.clientX-rect.left)/rect.width*800,y:(ev.clientY-rect.top)/rect.height*330});svg.setPointerCapture(e.pointerId);const move=ev=>{apply(convert(ev));draw(true);renderFrame();};const end=()=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',end);refreshScene();draw();};svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);}
  if(chosen&&next&&chosen.easing==='bezier'){
   const curve=chosen.curve||[.25,.1,.25,1],dx=X(next.time)-X(chosen.time),dy=Y(next.value)-Y(chosen.value);
   for(let i=0;i<2;i++){const cx=X(chosen.time)+dx*curve[i*2],cy=Y(chosen.value)+dy*curve[i*2+1];node('line',{x1:i?X(next.time):X(chosen.time),y1:i?Y(next.value):Y(chosen.value),x2:cx,y2:cy,stroke:'#eeaf78'});const h=node('circle',{cx,cy,r:7,fill:'#eeaf78',class:'curvehandle'});h.onpointerdown=e=>drag(e,p=>{chosen.curve=[...curve];chosen.curve[i*2]=C.clamp((p.x-X(chosen.time))/dx,0,1);if(Math.abs(dy)>.001)chosen.curve[i*2+1]=C.clamp((p.y-Y(chosen.value))/dy,0,1);});}
  }
  for(const key of points){if(key.time<0||key.time>clip.duration)continue;const dot=node('circle',{cx:X(key.time),cy:Y(key.value),r:6,fill:key===chosen?'#ffe09a':'#b0efcf',stroke:'#13291b','stroke-width':2,class:'curvepoint'});dot.onpointerdown=e=>{chosen=key;time=clip.start+key.time;drag(e,p=>{const i=points.indexOf(key),lo=Math.max(0,(points[i-1]?.time??-1)+1/30),hi=Math.min(clip.duration,(points[i+1]?.time??clip.duration+1)-1/30);key.time=C.clamp(C.snap((p.x-58)/712*clip.duration),lo,hi);key.value=C.clamp(view.lo+(285-p.y)/250*(view.hi-view.lo),spec.min,spec.max);time=clip.start+key.time;});draw(true);renderFrame();};}
 }
 param.onchange=()=>{chosen=null;view=null;draw();};
 preset.onchange=()=>{if(!chosen)return;checkpoint();const curves={'ease-in':[.42,0,1,1],'ease-out':[0,0,.58,1],'ease-in-out':[.42,0,.58,1]};chosen.easing=curves[preset.value]?'bezier':preset.value;if(chosen.easing==='bezier')chosen.curve=curves[preset.value]||chosen.curve||[.25,.1,.25,1];refreshScene();draw();};
 init.onclick=()=>{if(keys().length)return;checkpoint();C.setKey(clip,param.value,0,clip[param.value]);C.setKey(clip,param.value,clip.duration,clip[param.value]);chosen=keys()[1];refreshScene();draw();};
 add.onclick=()=>{checkpoint();const t=C.localTime(clip,time),value=C.valueAt(clip,param.value,t);C.setKey(clip,param.value,t,value);chosen=keys().find(k=>Math.abs(k.time-t)<1/60);refreshScene();draw();};
 remove.onclick=()=>{if(!chosen)return;checkpoint();const points=keys();if(points.length===1)clip[param.value]=chosen.value;points.splice(points.indexOf(chosen),1);chosen=null;refreshScene();draw();};
 let numberEditing=false;seconds.onfocus=amount.onfocus=()=>numberEditing=false;
 seconds.oninput=amount.oninput=()=>{if(!chosen||seconds.value===''||amount.value==='')return;const t=Number(seconds.value),v=Number(amount.value),spec=C.PARAMS[param.value];if(!Number.isFinite(t)||!Number.isFinite(v)||t<0||t>clip.duration||v<spec.min||v>spec.max||keys().some(k=>k!==chosen&&Math.abs(k.time-C.snap(t))<1/60))return;if(!numberEditing){checkpoint();numberEditing=true;}chosen.time=C.snap(t);chosen.value=v;keys().sort((a,b)=>a.time-b.time);time=clip.start+chosen.time;refreshScene();draw();};
 draw();
};
