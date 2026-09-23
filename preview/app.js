'use strict';
const $ = selector => document.querySelector(selector);
const el = (tag, className, text) => { const node=document.createElement(tag); if(className)node.className=className;if(text!==undefined)node.textContent=text;return node; };
const C=Lattice;
let project={version:2,name:'無題の映像',trackCount:6,clips:[]};
let assets=[],plugins=[],token='',selected=null,selectedKey=null;
let time=0,playing=false,lastTick=0,zoom=45,spatial=true,orbitX=12,orbitY=-18,viewZoom=1;
let undoStack=[],redoStack=[],saveTimer,toastTimer,saving=Promise.resolve();
let showKeys=false,exporting=false,exportJob=null,exportAbort=null,dragging=false,refreshBusy=false;
let lastAssetSignature='',lastPluginSignature='';
const renderer=new SceneRenderer($('#scene'),message=>toast(message));
const selection=()=>project.clips.find(c=>c.id===selected);
const assetFor=c=>assets.find(a=>a.id===c.asset);
const duration=()=>Math.max(0,...project.clips.map(c=>c.start+c.duration));
const clipName=c=>c.name||(c.kind==='media'?assetFor(c)?.name:({shape:'図形',text:'テキスト',camera:'カメラ制御',mask:'クリッピング'})[c.kind])||'素材';
const tc=t=>{const f=Math.max(0,Math.round(t*30));return [Math.floor(f/108000),Math.floor(f/1800)%60,Math.floor(f/30)%60,f%30].map(v=>String(v).padStart(2,'0')).join(':');};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path,body,signal){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Lattice-Token':token},body:JSON.stringify(body),signal});const result=await r.json();if(!r.ok)throw Error(result.error||'処理に失敗しました。');return result;}
function checkpoint(){undoStack.push(JSON.stringify(project));if(undoStack.length>80)undoStack.shift();redoStack=[];}
function changed(){reconcileMasks();renderTimeline();renderInspector();renderer.sync(project,assets,$('#quality').value);renderFrame();scheduleSave();}
function reconcileMasks(){for(const c of project.clips.filter(c=>c.kind==='mask'&&c.maskTarget)){const target=project.clips.find(v=>v.id===c.maskTarget);if(!target||target.track>=c.track||['mask','camera'].includes(target.kind))c.maskTarget='';}}
function scheduleSave(){$('#saveState').textContent='保存待ち…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveLocal().catch(()=>{}),650);}
function saveLocal(){clearTimeout(saveTimer);const snapshot=JSON.stringify(project);saving=saving.catch(()=>{}).then(()=>api('/api/project',JSON.parse(snapshot))).then(()=>{if(snapshot===JSON.stringify(project))$('#saveState').textContent='✓ 自動保存済み';}).catch(e=>{$('#saveState').textContent='保存に失敗';toast(e.message);throw e;});return saving;}
function history(redo=false){if(exporting)return;const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;stop();to.push(JSON.stringify(project));project=JSON.parse(from.pop());selected=null;selectedKey=null;time=Math.min(time,duration());$('#projectName').value=project.name;changed();}
function select(id,rebuild=true){selected=id;selectedKey=null;renderInspector();if(rebuild)renderTimeline();else document.querySelectorAll('.clip').forEach(n=>n.classList.toggle('selected',n.dataset.id===id));renderFrame();}
function renderAssets(){const root=$('#assets');root.replaceChildren();$('#assetCount').textContent=assets.length;const query=$('#search').value.toLowerCase();for(const a of assets.filter(a=>a.name.toLowerCase().includes(query))){const n=el('button','asset');n.title='クリックしてタイムラインに追加';n.append(el('span','assetthumb',a.kind==='video'?'▣':'♫'));const text=el('span','assettext');text.append(el('strong','',a.name),el('small','',`${a.width?a.width+' × '+a.height:'音声'} · ${a.duration.toFixed(1)}秒${a.proxy?' · 軽量版あり':''}`));n.append(text);n.onclick=()=>addMedia(a);root.append(n);}}
function reserveClip(){if(exporting)return false;if(project.clips.length>=100){toast('最大100クリップまでです。');return false;}checkpoint();return true;}
function addMedia(a){if(!reserveClip())return;const track=selection()?.track??0;const start=Math.max(time,...project.clips.filter(c=>c.track===track).map(c=>c.start+c.duration));const c=C.createClip(crypto.randomUUID(),'media',start,track,a.id);c.duration=a.duration;project.clips.push(c);selected=c.id;time=start;changed();revealTrack(track);}
function addBuiltin(type){if(!reserveClip())return;const names={rectangle:'四角形',circle:'円',triangle:'三角形',star:'星',background:'背景',text:'テキスト',camera:'カメラ制御',mask:'クリッピング'};let track=selection()?.track??0;if(selection()||type==='mask'||type==='camera')track=Math.min(project.trackCount-1,track+1);const c=C.createClip(crypto.randomUUID(),['text','camera','mask'].includes(type)?type:'shape',C.snap(time),track);c.name=names[type];if(c.kind==='shape')c.shape=type==='background'?'rectangle':type;if(type==='background'){c.width=3840;c.height=2160;c.color='#253d32';}if(type==='circle'||type==='star')c.height=c.width=900;if(type==='mask'){const target=selection();c.shape='circle';c.width=c.height=1400;if(target&&target.track<c.track&&!['camera','mask'].includes(target.kind))c.maskTarget=target.id;}project.clips.push(c);selected=c.id;selectedKey=null;changed();revealTrack(track);}
function rowLabel(text,small,height=46){const label=el('div','tracklabel');label.style.height=height+'px';label.append(el('b','',text),el('small','',small));return label;}
function renderTimeline(){
 const scroll=$('#timelineScroll'),scrollTop=scroll.scrollTop,scrollLeft=scroll.scrollLeft;
 const total=Math.max(duration()+Math.min(5,48/zoom),scroll.clientWidth/zoom);$('#trackArea').style.width=total*zoom+'px';$('#ruler').replaceChildren();
 const step=[1,2,5,10,30,60,120,300,600,1800,3600,10800].find(v=>v*zoom>=65)||21600;
 for(let t=0;t<total;t+=step){const tick=el('span','',t>=60?Math.floor(t/60)+':'+String(t%60).padStart(2,'0'):t+'s');tick.style.left=t*zoom+'px';$('#ruler').append(tick);}
 $('#layerTab').classList.toggle('active',!showKeys);$('#keyTab').classList.toggle('active',showKeys);$('#layerTab').setAttribute('aria-selected',String(!showKeys));$('#keyTab').setAttribute('aria-selected',String(showKeys));$('#keyRowsToggle').classList.toggle('active',showKeys);$('.timeline').classList.toggle('keymode',showKeys);
 const root=$('#tracks'),labels=$('#trackLabels');root.replaceChildren();labels.replaceChildren();labels.append(rowLabel('時間 / 秒','上が前面',28));
 for(let track=project.trackCount-1;track>=0;track--){
  if(showKeys && selection()?.track!==track)continue;
  labels.append(rowLabel('L'+(track+1),track===0?'最背面':track===project.trackCount-1?'最前面':'レイヤー'));
  const row=el('div','track');row.dataset.track=track;row.style.backgroundSize=step*zoom+'px 100%';row.onpointerdown=e=>{if(e.target===row)scrub(e,row);};
  for(const c of project.clips.filter(c=>c.track===track&&(!showKeys||c.id===selected))){
   const n=el('button','clip kind-'+c.kind+(c.id===selected?' selected':''));n.dataset.id=c.id;n.title=`${clipName(c)} — 左右で時間、上下でレイヤーを移動。端でトリム`;n.style.left=c.start*zoom+'px';n.style.width=Math.max(8,c.duration*zoom)+'px';
   n.append(el('span','cliptitle',clipName(c)),el('small','',`${c.duration.toFixed(2)}秒${Object.values(c.keys||{}).some(k=>k.length)?' · ◇ アニメーション':''}${c.shader?.enabled?' · GLSL':''}`));
   const left=el('span','trimhandle left'),right=el('span','trimhandle right');left.dataset.trim='left';right.dataset.trim='right';n.append(left,right);n.onpointerdown=e=>dragClip(e,c,n);row.append(n);
  }
  root.append(row);const c=selection();
  if(showKeys&&c?.track===track)for(const [prop,spec]of Object.entries(C.PARAMS)){
   const label=rowLabel('◇',spec.label,27);label.classList.add('keylabel');const add=el('button','','+');add.title=spec.label+'のキーを追加';add.onclick=()=>addKey(prop);label.append(add);labels.append(label);
   const lane=el('div','keylane');lane.dataset.prop=prop;lane.style.backgroundSize=step*zoom+'px 100%';const region=el('div','keyregion');region.style.left=c.start*zoom+'px';region.style.width=c.duration*zoom+'px';lane.append(region);
   lane.ondblclick=e=>{if(exporting||e.target.closest('.keypoint'))return;time=C.clamp(C.snap((e.clientX-lane.getBoundingClientRect().left)/zoom),c.start,c.start+c.duration);addKey(prop);};
   for(const key of c.keys?.[prop]||[]){if(key.time<0||key.time>c.duration)continue;const p=el('button','keypoint'+(selectedKey?.prop===prop&&Math.abs(selectedKey.time-key.time)<1e-6?' chosen':''),'◆');p.title=`${spec.label} ${key.value.toFixed(2)} / ${key.time.toFixed(3)}秒`;p.style.left=(c.start+key.time)*zoom+'px';p.onpointerdown=e=>dragKey(e,c,prop,key,p);p.oncontextmenu=e=>{e.preventDefault();selectedKey={prop,time:key.time};deleteKey();};lane.append(p);}
   root.append(lane);
  }
 }
 $('#trackArea').style.height=(28+[...root.children].reduce((n,row)=>n+(row.classList.contains('keylane')?32:46),0))+'px';scroll.scrollTop=scrollTop;scroll.scrollLeft=scrollLeft;labels.scrollTop=scrollTop;
 $('#undo').disabled=!undoStack.length||exporting;$('#redo').disabled=!redoStack.length||exporting;$('#total').textContent='/ '+tc(duration());$('#playhead').style.left=time*zoom+'px';$('#keyHint').textContent=selection()?'◆をドラッグで時刻変更 ／ 空白をダブルクリックで追加':'素材を選択 → キーフレームタブでアニメーション編集';$('#deleteKey').disabled=!selectedKey;
}
function switchTimeline(keys){showKeys=keys;selectedKey=null;renderTimeline();$('#timelineScroll').scrollTop=0;$('#trackLabels').scrollTop=0;if(keys&&!selection())toast('先にレイヤー編集で素材を選択してください。');}
function revealTrack(track){const row=$(`.track[data-track="${track}"]`);if(row)$('#timelineScroll').scrollTop=Math.max(0,row.offsetTop-28);$('#trackLabels').scrollTop=$('#timelineScroll').scrollTop;}
function beginDrag(event,node,move,finish){event.preventDefault();event.stopPropagation();window.getSelection()?.removeAllRanges();dragging=true;document.body.classList.add('dragging');node.setPointerCapture(event.pointerId);const end=()=>{node.removeEventListener('pointermove',onMove);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',end);node.removeEventListener('lostpointercapture',end);dragging=false;document.body.classList.remove('dragging');finish?.();};const onMove=e=>{e.preventDefault();move(e);};node.addEventListener('pointermove',onMove);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);node.addEventListener('lostpointercapture',end);}
function dragClip(event,c,node){
 if(event.button!==0||exporting)return;stop();select(c.id,false);const x=event.clientX,y=event.clientY,initial=C.clone(c),scrollStart=$('#timelineScroll').scrollLeft,trim=event.target.dataset.trim;let moved=false,nextTrack=c.track;
 beginDrag(event,node,e=>{
  if(!moved&&Math.hypot(e.clientX-x,e.clientY-y)>3){checkpoint();moved=true;}if(!moved)return;
  let delta=C.snap((e.clientX-x+$('#timelineScroll').scrollLeft-scrollStart)/zoom);const source=assetFor(c);showSnapGuide(null);
  if(snapEnabled&&!e.altKey){const edge=trim==='right'?'right':trim==='left'?'left':'move',candidate=edge==='right'?initial.start:Math.max(0,initial.start+delta),length=edge==='right'?initial.duration+delta:initial.duration;const snapped=EditingUX.snapPosition(candidate,length,project.clips,c.id,time,8/zoom,edge);delta+=C.snap(snapped.start-candidate);showSnapGuide(snapped.target);}
  if(trim==='right'){c.duration=Math.max(1/30,C.snap(initial.duration+delta));if(source)c.duration=Math.min(c.duration,source.duration-c.sourceIn);}
  else if(trim==='left'){const change=C.clamp(delta,-Math.min(initial.start,initial.sourceIn),initial.duration-1/30);c.start=initial.start+change;c.sourceIn=initial.sourceIn+change;c.duration=initial.duration-change;c.keys=C.clone(initial.keys);for(const keys of Object.values(c.keys))for(const k of keys)k.time-=change;c.shaderOffset=(initial.shaderOffset||0)+change;}
  else{c.start=Math.max(0,C.snap(initial.start+delta));const row=[...document.querySelectorAll('.track')].find(n=>{const r=n.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<r.bottom;});if(row)nextTrack=Number(row.dataset.track);document.querySelectorAll('.track').forEach(n=>n.classList.toggle('droptrack',+n.dataset.track===nextTrack));node.style.transform=`translateY(${e.clientY-y}px)`;}
  node.style.left=c.start*zoom+'px';node.style.width=Math.max(8,c.duration*zoom)+'px';if(e.clientX>$('#timelineScroll').getBoundingClientRect().right-25)$('#timelineScroll').scrollLeft+=8;renderFrame();
 },()=>{showSnapGuide(null);if(moved){c.track=nextTrack;changed();}else finishClipClick(c.id);});
}
function dragKey(event,c,prop,key,node){if(event.button!==0||exporting)return;stop();selectedKey={prop,time:key.time};time=c.start+key.time;$('#keyEasing').value=key.easing||'linear';const x=event.clientX,original=key.time;let moved=false;beginDrag(event,node,e=>{if(!moved&&Math.abs(e.clientX-x)>3){checkpoint();moved=true;}if(!moved)return;const t=C.clamp(C.snap(original+(e.clientX-x)/zoom),0,c.duration);if(c.keys[prop].some(k=>k!==key&&Math.abs(k.time-t)<1/60))return;key.time=t;selectedKey.time=t;c.keys[prop].sort((a,b)=>a.time-b.time);time=c.start+t;node.style.left=time*zoom+'px';renderFrame();},()=>{if(moved)changed();else{renderTimeline();renderInspector();renderFrame();}});renderFrame();}
function scrub(event,node){if(event.button!==0||exporting)return;stop();const seek=e=>{time=C.clamp(C.snap((e.clientX-$('#ruler').getBoundingClientRect().left)/zoom),0,duration());renderFrame();};seek(event);beginDrag(event,node,seek);}
function addKey(prop){const c=selection();if(!c||exporting)return;checkpoint();const local=C.localTime(c,time),value=C.valueAt(c,prop,local);C.setKey(c,prop,local,value,$('#keyEasing').value);selectedKey={prop,time:C.clamp(C.snap(local),0,c.duration)};changed();}
function deleteKey(){const c=selection();if(!c||!selectedKey||exporting)return;const prop=selectedKey.prop,keys=c.keys[prop]||[],at=keys.findIndex(k=>Math.abs(k.time-selectedKey.time)<1e-6);if(at<0)return;checkpoint();const current=C.valueAt(c,prop,C.localTime(c,time));keys.splice(at,1);if(!keys.length)c[prop]=current;selectedKey=null;changed();}
function keyStep(direction){const c=selection();if(!c)return;const moments=[...new Set(Object.values(c.keys||{}).flat().map(k=>c.start+k.time))].filter(t=>t>=c.start&&t<=c.start+c.duration).sort((a,b)=>a-b);const target=direction>0?moments.find(t=>t>time+.001):moments.reverse().find(t=>t<time-.001);if(target!==undefined){stop();time=target;renderFrame();}}
function buildTransformControls(){
 const root=$('#transformControls');
 for(const [prop,spec]of Object.entries(C.PARAMS)){
  const row=el('label','field animatedfield');row.append(el('span','fieldname',spec.label));const input=el('input');input.type='number';input.min=spec.min;input.max=spec.max;input.step='any';input.dataset.prop=prop;input.setAttribute('aria-label',spec.label);
  let inputCheckpoint=false;input.onfocus=()=>{inputCheckpoint=false;};
  input.oninput=()=>{const c=selection(),value=Number(input.value);if(!c||exporting)return;if(!input.checkValidity()||!Number.isFinite(value)){return;}if(input.value===''||Math.abs(C.valueAt(c,prop,C.localTime(c,time))-value)<1e-8)return;if(!inputCheckpoint){checkpoint();inputCheckpoint=true;}C.changeValue(c,prop,C.localTime(c,time),value,$('#autoKey').checked,$('#keyEasing').value);changed();};
  const key=el('button','keyadd','◇');key.type='button';key.dataset.key=prop;key.title=spec.label+'にキーフレームを追加';key.onclick=e=>{e.preventDefault();addKey(prop);};row.append(input,key);root.append(row);
 }
}
function renderAnimatedFields(){
 const c=selection();for(const input of document.querySelectorAll('input[data-prop]')){input.disabled=!c||exporting;if(document.activeElement!==input)input.value=c?Number(C.valueAt(c,input.dataset.prop,C.localTime(c,time)).toFixed(3)):C.PARAMS[input.dataset.prop].initial;input.classList.toggle('animated',!!c?.keys?.[input.dataset.prop]?.length);}
 for(const button of document.querySelectorAll('[data-key]')){button.disabled=!c||exporting;const at=c?.keys?.[button.dataset.key]?.some(k=>Math.abs(k.time-C.localTime(c,time))<1/60);button.textContent=at?'◆':'◇';button.classList.toggle('atkey',!!at);}
}
function contentField(label,type,value,update,options={}){
 const row=el('label','field contentfield');row.append(el('span','fieldname',label));const input=el(type==='textarea'?'textarea':type==='select'?'select':'input');
 if(type==='select')for(const[v,text]of options.choices)input.append(new Option(text,v));else if(type!=='textarea')input.type=type;
 if(options.min!==undefined)input.min=options.min;if(options.max!==undefined)input.max=options.max;if(type==='number')input.step='any';
 if(type==='textarea')input.maxLength=5000;if(type==='text')input.maxLength=200;
 input.value=value;input.setAttribute('aria-label',label);input.disabled=exporting;
 let lastValue=String(value),editing=false,composing=false;
 input.onfocus=()=>{editing=false;};
 const commit=()=>{
  if(exporting||input.value===lastValue)return;
  if(type==='number'&&(input.value===''||!input.checkValidity()||!Number.isFinite(Number(input.value))))return;
  if(!editing){checkpoint();editing=true;}
  lastValue=input.value;update(type==='number'?Number(input.value):input.value);
  // Keep the active DOM input, selection and IME composition intact.
  $('#selectionName').textContent=selection()?clipName(selection()):'クリップ未選択';
  renderTimeline();renderFrame();if(!composing)scheduleSave();
 };
 input.oninput=commit;input.onchange=()=>{commit();editing=false;};
 input.addEventListener('compositionstart',()=>{composing=true;});
 input.addEventListener('compositionend',()=>{composing=false;commit();scheduleSave();});
 row.append(input);$('#contentControls').append(row);
}
function renderInspector(){
 const c=selection();$('#selectionName').textContent=c?clipName(c):'クリップ未選択';renderAnimatedFields();$('#contentControls').replaceChildren();
 if(c){
  contentField('素材名','text',c.name,v=>c.name=v);
  if(['shape','mask'].includes(c.kind))contentField('図形','select',c.shape,v=>c.shape=v,{choices:[['rectangle','四角形'],['circle','円 / 楕円'],['triangle','三角形'],['star','星']]});
  if(['shape','text'].includes(c.kind))contentField('色','color',c.color,v=>c.color=v);
  if(['shape','mask'].includes(c.kind)){contentField('幅','number',c.width,v=>c.width=v,{min:1,max:3840});contentField('高さ','number',c.height,v=>c.height=v,{min:1,max:2160});}
  if(c.kind==='text'){contentField('テキスト内容','textarea',c.text,v=>c.text=v);contentField('文字サイズ','number',c.fontSize,v=>c.fontSize=v,{min:8,max:800});contentField('文字揃え','select',c.align,v=>c.align=v,{choices:[['left','左揃え'],['center','中央'],['right','右揃え']]});}
  if(c.kind==='mask')contentField('切り抜き対象','select',c.maskTarget,v=>c.maskTarget=v,{choices:[['','直下の表示素材（自動）'],...project.clips.filter(v=>v.track<c.track&&!['mask','camera'].includes(v.kind)).map(v=>[v.id,`L${v.track+1} · ${clipName(v)}`])]});
  if(c.kind==='camera')$('#contentControls').append(el('p','inspectorhelp','スケールでズーム、X/Yでパン、回転で画角を操作します。有効なカメラのうち最上位のレイヤーを使います。'));
 }
 for(const input of document.querySelectorAll('[data-timing]')){input.disabled=!c||exporting;input.value=c?Number(c[input.dataset.timing].toFixed(6)):0;}
 $('#clipTrack').replaceChildren();for(let i=project.trackCount-1;i>=0;i--)$('#clipTrack').append(new Option(`L${i+1}${i===0?' · 最背面':''}`,i));$('#clipTrack').disabled=!c||exporting;$('#clipTrack').value=c?.track??0;
 $('#volume').disabled=!c||c.kind!=='media'||exporting;$('#volume').value=c?.volume??100;$('#appliedEffect').textContent=c?.effectName||'エフェクトなし';$('#shaderInfo').textContent=c?.shader?`${c.shader.name||'GLSL'} · ${c.shader.enabled?'適用中':'無効'}`:'GLSL · 未適用';
 $('#editShader').disabled=!c||['camera','mask'].includes(c.kind)||exporting;$('#split').disabled=!c||exporting;$('#delete').disabled=!c||exporting;$('#clearEffect').disabled=!c||exporting;
}
function renderFrame(){
 $('#tc').textContent=tc(time);$('#playhead').style.left=time*zoom+'px';if(document.activeElement!==$('#timeInput'))$('#timeInput').value=Number(time.toFixed(3));$('#empty').style.display=project.clips.length?'none':'flex';renderer.draw(project,time,{playing,selected,guides:true});$('#playbackStatus').textContent=exporting?'書き出し中':playing?'再生中 · '+($('#quality').value==='proxy'?'軽量版優先':'元画質'):'停止中';renderAnimatedFields();
}
function fitViewport(){const v=$('#viewport');$('#composition').style.width=Math.max(40,Math.min(v.clientWidth*(spatial?.7:.8),v.clientHeight*.78*(project.width||3840)/(project.height||2160)))+'px';}
function setView(){
 fitViewport();
 $('#viewport').classList.toggle('spatial',spatial);$('#mode3d').classList.toggle('active',spatial);$('#mode2d').classList.toggle('active',!spatial);$('#composition').style.transform=`${spatial?`rotateX(${orbitX}deg) rotateY(${orbitY}deg)`:''} scale(${viewZoom})`;$('#viewZoomLabel').textContent=Math.round(viewZoom*100)+'%';$('#viewLabel').textContent=spatial?'/ 3D 空間':'/ 出力画面';$('.viewportlabel').firstChild.textContent=spatial?'空間編集 ':'出力プレビュー ';$('.viewportlabel span').textContent=spatial?'レイヤー優先':`${project.width||3840} × ${project.height||2160}`;$('.viewhint').textContent=spatial?'背景ドラッグで視点回転 · ホイールで拡大縮小 · Alt＋ドラッグで素材移動':'素材をドラッグで移動 · ホイールは編集表示の拡大縮小';renderFrame();
}
function stop(){playing=false;$('#play').textContent='▶';renderer.pause();renderFrame();}
function togglePlay(){if(exporting)return;if(!duration())return toast('素材を追加してください。');if(playing)return stop();if(time>=duration())time=0;playing=true;lastTick=performance.now();$('#play').textContent='Ⅱ';requestAnimationFrame(tick);}
function tick(now){if(!playing)return;time=Math.min(duration(),time+(now-lastTick)/1000);lastTick=now;renderFrame();if(time>=duration())stop();else requestAnimationFrame(tick);}
function split(){const c=selection();if(!c||exporting)return;try{const halves=C.splitClip(c,time-c.start,crypto.randomUUID());checkpoint();project.clips.splice(project.clips.indexOf(c),1,...halves);selected=halves[1].id;selectedKey=null;changed();}catch(e){toast(e.message);}}
function removeClip(){if(!selection()||exporting)return;checkpoint();stop();project.clips=project.clips.filter(c=>c.id!==selected);selected=null;selectedKey=null;time=Math.min(time,duration());changed();}
async function importFiles(files){
 if(exporting)return;$('#import').disabled=true;
 try{for(const file of files){$('#jobStatus').textContent='読み込み中 · '+file.name;
  const result=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/import');xhr.setRequestHeader('X-Lattice-Token',token);xhr.setRequestHeader('X-Filename',encodeURIComponent(file.name));xhr.upload.onprogress=e=>{if(e.lengthComputable)$('#jobStatus').textContent=`読み込み ${Math.round(e.loaded/e.total*100)}% · ${file.name}`;};xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText);xhr.status===200?resolve(data):reject(Error(data.error));}catch{reject(Error('読み込みに失敗しました。'));}};xhr.onerror=()=>reject(Error('サーバーに接続できません。'));xhr.send(file);});
  if(!assets.some(a=>a.id===result.asset.id))assets.push(result.asset);renderAssets();if(!project.clips.length)addMedia(result.asset);toast(file.name+' を読み込みました。');
 }}catch(e){toast(e.message);}finally{$('#import').disabled=false;$('#fileInput').value='';refreshState();}
}
function renderPlugins(){
 const root=$('#plugins');root.replaceChildren();
 const list=[...plugins,...(window.ExtraPlugins||[])];
 const tools=el('div','pluginfilters'),search=el('input'),category=el('select');search.placeholder='エフェクトを検索';search.setAttribute('aria-label','エフェクトを検索');category.setAttribute('aria-label','エフェクトの分類');category.append(new Option('すべて',''),...['カラー','色変換','映像効果','アニメーション','追加プラグイン'].map(v=>new Option(v,v)));tools.append(search,category);root.append(tools);const grid=el('div','plugincards');root.append(grid);
 const draw=()=>{grid.replaceChildren();const query=search.value.toLowerCase();const found=list.filter(p=>{const group=p.category||(p.id==='warm'||p.id==='mono'||p.id==='soft'?'カラー':'追加プラグイン');return (!category.value||group===category.value)&&(p.name+' '+p.description+' '+(window.uiText?window.uiText(p.name)+' '+window.uiText(p.description):'')).toLowerCase().includes(query);});
 for(const p of found){const card=el('div','plugin');card.append(el('strong','',p.name),el('p','',p.description));const button=el('button','',p.code?'シェーダーを適用':'カラーを適用');button.onclick=()=>{const c=selection();if(!c||['camera','mask'].includes(c.kind))return toast('映像・図形・テキストを選択してください。');if(exporting)return;
 try{if(p.code)renderer.shader.compile(p.code);checkpoint();if(p.code){c.shader={enabled:true,code:p.code,name:p.name};}else{c.effects=C.clone(p.effects);c.effectName=p.name;}changed();toast(p.name+' を適用しました。Ctrl+Zで取り消せます。');}catch(e){toast(e.message);}};card.append(button);grid.append(card);}
 if(!found.length)grid.append(el('p','muted','一致するエフェクトはありません。'));};search.oninput=category.onchange=draw;draw();
}

function showDialog(title,paragraph=''){$('#dialog').classList.remove('shaderdialog','curvedialog','graphdialog');$('#dialogContent').replaceChildren(el('h2','',title),el('p','',paragraph));if(!$('#dialog').open)$('#dialog').showModal();return $('#dialogContent');}
function download(data,name,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type})),link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function loadProject(input){const next=C.migrate(input);clearTimeout(saveTimer);await saving.catch(()=>{});await api('/api/project',next);checkpoint();stop();project=next;selected=null;selectedKey=null;time=0;$('#projectName').value=project.name;changed();$('#dialog').close();toast('プロジェクトを読み込みました。');}
function saveDialog(){
 if(exporting)return;const box=showDialog('プロジェクトを保存','素材の位置、キーフレーム、カメラ、テキスト、クリッピング、シェーダーをまとめて保存します。');
 const name=el('input','projectfilename');name.value=project.name;name.maxLength=200;name.setAttribute('aria-label','保存するプロジェクト名');box.append(name);
 const local=el('button','primary','このPCに名前を付けて保存');local.onclick=async()=>{local.disabled=true;try{checkpoint();project.name=name.value.trim()||'無題の映像';$('#projectName').value=project.name;await saveLocal();await api('/api/projects/save',{project});$('#dialog').close();toast('保存しました。「開く」の保存済み一覧から復元できます。');}catch(e){toast(e.message);}finally{local.disabled=false;}};
 const file=el('button','wide','プロジェクトファイルをダウンロード');file.onclick=()=>download(JSON.stringify({...project,name:name.value.trim()||project.name},null,2),(name.value||'プロジェクト')+'.lattice.json');
 box.append(local,file,el('p','muted','動画・音声本体は .lattice-local/media に保持します。別のPCへ移すときは .lattice-local フォルダーもコピーしてください。'));
}
async function openDialog(){
 if(exporting)return;const box=showDialog('プロジェクトを開く','現在の編集内容は先に自動保存します。');const file=el('button','wide','ファイルから読み込む (.lattice.json)');file.onclick=()=>$('#projectInput').click();box.append(file);
 try{await saveLocal();const response=await fetch('/api/projects');const saved=await response.json();if(!saved.length)box.append(el('p','muted','名前を付けて保存したプロジェクトはありません。'));for(const p of saved){const button=el('button','projectentry',`${p.name} · ${p.clips}素材 · ${new Date(p.modified*1000).toLocaleString('ja-JP')}`);button.onclick=async()=>{try{await loadProject(await api('/api/projects/load',{id:p.id}));}catch(e){toast(e.message);}};box.append(button);}}catch(e){toast(e.message);}
}
function shaderDialog(){
 const c=selection();if(!c||['camera','mask'].includes(c.kind))return toast('映像・図形・テキストのクリップを選択してください。');if(exporting)return;
 const box=showDialog('カスタムシェーダー',clipName(c)+' に適用するGLSLフラグメント関数。保存・MP4書き出しにも反映されます。');$('#dialog').classList.add('shaderdialog');
 const presets=el('select');presets.setAttribute('aria-label','シェーダーのサンプル');
 const examples={original:C.DEFAULT_SHADER,invert:'vec4 effect(vec2 uv, vec4 color) {\n    return vec4(1.0 - color.rgb, color.a);\n}',wave:'vec4 effect(vec2 uv, vec4 color) {\n    uv.x += sin(uv.y * 30.0 + u_time * 3.0) * 0.018;\n    return sampleSource(uv);\n}',vignette:'vec4 effect(vec2 uv, vec4 color) {\n    float edge = 1.0 - smoothstep(0.2, 0.7, distance(uv, vec2(0.5)));\n    return vec4(color.rgb * (0.4 + edge * 0.6), color.a);\n}'};
 for(const[value,label]of [['original','サンプル：そのまま'],['invert','サンプル：色反転'],['wave','サンプル：波紋アニメーション'],['vignette','サンプル：ビネット']])presets.append(new Option(label,value));
 const code=el('textarea','shadercode');code.id='shaderCode';code.spellcheck=false;code.maxLength=32000;code.value=c.shader?.code||C.DEFAULT_SHADER;code.setAttribute('aria-label','GLSLソースコード');
 const errors=el('pre','shadererrors');errors.id='shaderErrors';errors.textContent='未コンパイル';const preview=el('canvas','shaderpreview');preview.width=480;preview.height=270;
 const description=el('p','muted','effect(vec2 uv, vec4 color) を定義。sampleSource(uv)、u_time（秒）、u_resolution が使えます。コンパイル失敗時は適用中のコードを保持します。');
 const actions=el('div','shaderactions'),test=el('button','wide','コンパイルしてプレビュー'),apply=el('button','primary','選択素材に適用'),disable=el('button','wide','シェーダーを解除');
 const compile=()=>{try{renderer.shader.compile(code.value);const candidate=C.clone(project);candidate.clips.find(v=>v.id===c.id).shader={enabled:true,code:code.value};const temp=renderer.canvas,ctx=renderer.ctx;try{renderer.canvas=preview;renderer.ctx=preview.getContext('2d');renderer.draw(candidate,time,{strict:true});}finally{renderer.canvas=temp;renderer.ctx=ctx;renderFrame();}errors.textContent='✓ コンパイル成功';errors.classList.remove('error');return true;}catch(e){errors.textContent=e.message;errors.classList.add('error');return false;}};
 presets.onchange=()=>{code.value=examples[presets.value];compile();};test.onclick=compile;apply.onclick=()=>{if(!compile())return;checkpoint();c.shader={enabled:true,code:code.value};changed();$('#dialog').close();toast('カスタムシェーダーを適用しました。');};disable.onclick=()=>{checkpoint();c.shader=null;changed();$('#dialog').close();};actions.append(test,apply,disable);box.append(presets,code,description,preview,errors,actions);compile();
}
async function exportMovie(quality,settings={}){
 const snapshot=C.clone(project),oldTime=time,controller=new AbortController();exportAbort=controller;let session=null,output=null;
 exporting=true;stop();document.body.classList.add('exporting');$('#export').disabled=true;
 const box=showDialog('映像を書き出しています','共通レンダラーでアニメーション・文字・クリッピング・シェーダーを元画質から描画します。このタブを開いたままお待ちください。');
 const progress=el('progress');progress.max=1;progress.value=0;const status=el('p','','準備中…');const cancel=el('button','wide','書き出しを中止');cancel.onclick=()=>controller.abort();box.append(progress,status,cancel);$('#dialog .dialogclose').disabled=true;renderInspector();
 try{
  const accelerated=settings.acceleration!==false && await PixelEngine.init();session=await api('/api/render/start',{project:snapshot,quality,...settings,pixelFormat:accelerated?'rgb24':'png'},controller.signal);const canvas=document.createElement('canvas');canvas.width=session.width;canvas.height=session.height;output=new SceneRenderer(canvas,message=>{status.textContent=message;});output.sync(snapshot,assets,'original');await document.fonts.ready;
  for(let frame=0;frame<session.frames;frame++){
   if(controller.signal.aborted)throw Error('書き出しを中止しました。');const at=frame/30;await output.seekExact(snapshot,at,controller.signal);output.draw(snapshot,at,{strict:true,framing:settings.framing||'contain'});
   const png=accelerated?PixelEngine.rgb(output.ctx,canvas.width,canvas.height):await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('画像の生成に失敗しました。')),'image/png'));
   const response=await fetch(`/api/render/frame/${session.id}/${frame}`,{method:'POST',headers:{'X-Lattice-Token':token,'Content-Type':accelerated?'application/octet-stream':'image/png'},body:png,signal:controller.signal});if(!response.ok)throw Error((await response.json()).error);
   progress.value=(frame+1)/session.frames;status.textContent=`${session.encoder} · ${accelerated?'WASM':'PNG'} · ${frame+1} / ${session.frames} フレーム · ${Math.round(progress.value*100)}%`;
  }
  const result=await api('/api/render/finish',{id:session.id});session=null;exportJob=result.job;$('#dialog').close();toast('映像の描画が完了しました。音声を合成しています。');
 }catch(e){if(session)await api('/api/render/cancel',{id:session.id}).catch(()=>{});$('#dialog').close();toast(controller.signal.aborted?'書き出しを中止しました。':e.message);}
 finally{output?.dispose();exporting=false;exportAbort=null;document.body.classList.remove('exporting');$('#dialog .dialogclose').disabled=false;$('#export').disabled=!!exportJob;time=oldTime;renderInspector();renderFrame();}
}
async function exportDialog(){
 if(!duration())return toast('素材を追加してください。');stop();
 const box=showDialog('映像を書き出す',`${project.name} · ${duration().toFixed(2)}秒 · MP4 / H.264 / 30fps`);
 let saved={};try{const r=await fetch('/api/export-settings');if(r.ok)saved=await r.json();}catch{}
 const quality=el('select'),encoder=el('select'),preset=el('select'),acceleration=el('input');
 const field=(name,input)=>{const label=el('label','field',name);input.setAttribute('aria-label',name);label.append(input);box.append(label);};
 quality.append(new Option('4K UHD · 3840 × 2160','4k'),new Option('フルHD · 1920 × 1080','1080p'),new Option('HD · 1280 × 720','720p'),new Option('縦長 · 1080 × 1920','portrait'),new Option('正方形 · 1080 × 1080','square'),new Option('カスタムサイズ','custom'));quality.value=saved.quality||'custom';field('解像度',quality);
 const width=el('input'),height=el('input'),framing=el('select');for(const input of [width,height]){input.type='number';input.min=128;input.max=4096;input.step=2;}width.value=saved.width||project.width||3840;height.value=saved.height||project.height||2160;field('幅（px）',width);field('高さ（px）',height);
 const sizePreset={'4k':[3840,2160],'1080p':[1920,1080],'720p':[1280,720],'portrait':[1080,1920],'square':[1080,1080]};const updateSize=()=>{const size=sizePreset[quality.value];width.disabled=height.disabled=!!size;if(size){width.value=size[0];height.value=size[1];}};quality.onchange=updateSize;updateSize();
 framing.append(new Option('全体を収める（余白あり）','contain'),new Option('画面を埋める（中央で切り抜き）','cover'));framing.value=saved.framing||'contain';field('縦横比が異なる場合',framing);box.append(el('p','muted','プロジェクトと異なる縦横比では上記の設定を適用します。幅・高さは128〜4096の偶数、総画素数は4K UHD以下。'));
 encoder.append(new Option('自動（利用可能なGPUを優先）','auto'));field('エンコーダー',encoder);
 preset.append(new Option('標準','balanced'),new Option('速度優先','fast'),new Option('画質優先','quality'));preset.value=saved.encodingQuality||'balanced';field('画質・速度',preset);
 const gpuMode=el('select');gpuMode.append(new Option('標準','normal'),new Option('最大品質（GPU高負荷を許可）','maximum'));gpuMode.value=saved.gpuMode||'normal';field('GPUの使用方針',gpuMode);box.append(el('p','muted','最大品質はGPUの解析・圧縮を強化します。GPU使用率100%を保証するものではありません。CPUは選択できません。'));
 acceleration.type='checkbox';acceleration.checked=saved.acceleration!==false;field('WebAssemblyで高速転送',acceleration);
 const note=el('p','muted','GPUを実際に試験しています…');box.append(note);
 const button=el('button','primary','MP4 書き出しを開始');button.disabled=true;box.append(button);
 try{const r=await fetch('/api/encoders');if(!r.ok)throw Error('エンコーダー情報を取得できません。サーバーを最新版で起動してください。');const list=await r.json();for(const item of list){const option=new Option(item.label+(item.available?'':' · 使用不可'),item.id);option.disabled=!item.available;encoder.append(option);}encoder.value=list.some(e=>e.id===saved.encoder&&e.available)?saved.encoder:'auto';button.disabled=!list.some(e=>e.available);note.textContent='GPUは映像圧縮に使用します。描画・素材のシークは別処理です。WASMが利用できない場合はPNG転送に切り替えます。';}catch(e){note.textContent=e.message;}
 button.onclick=async()=>{const settings={encoder:encoder.value,encodingQuality:preset.value,acceleration:acceleration.checked,width:Number(width.value),height:Number(height.value),framing:framing.value,gpuMode:gpuMode.value};if(!width.checkValidity()||!height.checkValidity()||settings.width*settings.height>3840*2160)return toast('出力サイズの範囲を確認してください。');try{await api('/api/export-settings',{...settings,quality:quality.value});await exportMovie(quality.value,settings);}catch(e){toast(e.message);}};
}

async function refreshState(initial=false){
 if(refreshBusy)return;refreshBusy=true;
 try{const response=await fetch('/api/state');if(!response.ok)throw Error('接続できません。');const state=await response.json();token=state.token;assets=state.assets;plugins=state.plugins;$('#connection').textContent=state.ffmpeg?'ローカルエンジン接続済み':'FFmpeg が必要です';
  if(initial&&state.project){project=C.migrate(state.project);$('#projectName').value=project.name;$('#saveState').textContent='✓ 復元しました';}if(initial){renderTimeline();renderInspector();}
  const as=JSON.stringify(assets),ps=JSON.stringify(plugins);if(as!==lastAssetSignature){lastAssetSignature=as;renderAssets();renderer.sync(project,assets,$('#quality').value);}if(ps!==lastPluginSignature){lastPluginSignature=ps;renderPlugins();}if(initial)renderer.sync(project,assets,$('#quality').value);if(!dragging&&!playing&&!exporting)renderFrame();
  const jobs=state.jobs.filter(j=>['running','queued','rendering'].includes(j.status));$('#jobStatus').textContent=jobs.length?`${jobs[0].kind} · ${Math.round(jobs[0].progress*100)}%`:'バックグラウンド処理なし';
  if(exportJob){const job=state.jobs.find(j=>j.id===exportJob);if(job?.status==='done'){exportJob=null;$('#export').disabled=false;const box=showDialog('書き出しが完了しました','キーフレームとシェーダーを反映したMP4を生成しました。');const a=el('a','','↓ MP4 をダウンロード');a.href=job.result;a.download=project.name+'.mp4';box.append(a);}else if(job?.status==='error'){exportJob=null;$('#export').disabled=false;showDialog('書き出しに失敗しました',job.error);}}
 }catch(e){$('#connection').textContent='未接続 · サーバーを確認してください';if(initial)toast(e.message);}finally{refreshBusy=false;}
}
buildTransformControls();
$('#import').onclick=$('#emptyImport').onclick=()=>$('#fileInput').click();$('#fileInput').onchange=e=>importFiles(e.target.files);$('#search').oninput=renderAssets;
for(const button of document.querySelectorAll('[data-builtin]'))button.onclick=()=>addBuiltin(button.dataset.builtin);
$('#play').onclick=togglePlay;$('#begin').onclick=()=>{stop();time=0;renderFrame();};$('#end').onclick=()=>{stop();time=Math.max(0,duration()-1/30);renderFrame();};
$('#mode2d').onclick=()=>{spatial=false;setView();};$('#mode3d').onclick=()=>{spatial=true;setView();};$('#grid').onclick=()=>{$('#viewport').classList.toggle('nogrid');$('#grid').classList.toggle('active');};
$('#resetView').onclick=()=>{orbitX=12;orbitY=-18;viewZoom=1;setView();};$('#viewZoomIn').onclick=()=>{viewZoom=C.clamp(viewZoom*1.2,.2,4);setView();};$('#viewZoomOut').onclick=()=>{viewZoom=C.clamp(viewZoom/1.2,.2,4);setView();};
$('#quality').onchange=()=>{renderer.sync(project,assets,$('#quality').value);renderFrame();};
$('#viewport').addEventListener('wheel',e=>{if(exporting)return;e.preventDefault();viewZoom=C.clamp(viewZoom*Math.exp(-e.deltaY*.001),.2,4);setView();},{passive:false});
$('#viewport').onpointerdown=e=>{
 if(e.button!==0||exporting||e.target.closest('button'))return;
 const canvas=$('#scene'),rect=canvas.getBoundingClientRect();const hit=renderer.pick((e.clientX-rect.left)/rect.width*canvas.width,(e.clientY-rect.top)/rect.height*canvas.height);
 if(hit&&(!spatial||e.altKey)){
  stop();select(hit,false);const c=selection(),x=e.clientX,y=e.clientY,at=C.localTime(c,time),ox=C.valueAt(c,'x',at),oy=C.valueAt(c,'y',at),camera=renderer.camera(project,time);let moved=false;
  beginDrag(e,$('#viewport'),ev=>{if(!moved&&Math.hypot(ev.clientX-x,ev.clientY-y)>3){checkpoint();moved=true;}if(!moved)return;const dx=(ev.clientX-x)/rect.width*(project.width||3840)/(camera.scale/100),dy=(ev.clientY-y)/rect.height*(project.height||2160)/(camera.scale/100),angle=camera.rotation*Math.PI/180;C.changeValue(c,'x',at,ox+dx*Math.cos(angle)-dy*Math.sin(angle),$('#autoKey').checked,$('#keyEasing').value);C.changeValue(c,'y',at,oy+dx*Math.sin(angle)+dy*Math.cos(angle),$('#autoKey').checked,$('#keyEasing').value);renderFrame();},()=>{if(moved)changed();else renderTimeline();});
 }else if(spatial){const x=e.clientX,y=e.clientY,rx=orbitX,ry=orbitY;beginDrag(e,$('#viewport'),ev=>{orbitX=rx-(ev.clientY-y)*.15;orbitY=ry+(ev.clientX-x)*.15;setView();});}
};
$('#ruler').onpointerdown=e=>scrub(e,$('#ruler'));$('#timelineScroll').onscroll=()=>$('#trackLabels').scrollTop=$('#timelineScroll').scrollTop;
$('#trackLabels').addEventListener('wheel',e=>{e.preventDefault();$('#timelineScroll').scrollTop+=e.deltaY;},{passive:false});
$('#undo').onclick=()=>history();$('#redo').onclick=()=>history(true);$('#split').onclick=split;$('#delete').onclick=removeClip;$('#zoom').oninput=e=>{zoom=+e.target.value;renderTimeline();};$('#timeInput').oninput=e=>{const next=Number(e.target.value)||0;stop();time=C.clamp(C.snap(next),0,duration());renderFrame();};
$('#addTrack').onclick=()=>{if(exporting)return;if(project.trackCount>=128)return toast('最大128レイヤーです。');checkpoint();project.trackCount++;changed();};$('#keyRowsToggle').onclick=()=>switchTimeline(!showKeys);$('#layerTab').onclick=()=>switchTimeline(false);$('#keyTab').onclick=()=>switchTimeline(true);
$('#previousKey').onclick=()=>keyStep(-1);$('#nextKey').onclick=()=>keyStep(1);$('#deleteKey').onclick=deleteKey;
$('#keyEasing').onchange=()=>{const c=selection(),key=c?.keys?.[selectedKey?.prop]?.find(k=>Math.abs(k.time-selectedKey.time)<1e-6);if(key){checkpoint();key.easing=$('#keyEasing').value;changed();}};
for(const input of document.querySelectorAll('[data-timing]'))input.onchange=()=>{const c=selection();if(!c||exporting)return;const prop=input.dataset.timing,value=C.snap(Number(input.value)),asset=assetFor(c);if(!Number.isFinite(value)||value<0||(prop==='duration'&&value<1/30))return renderInspector();const source=prop==='sourceIn'?value:c.sourceIn,length=prop==='duration'?value:c.duration;if(asset&&source+length>asset.duration+.001){toast('素材の長さを超えています。');return renderInspector();}checkpoint();c[prop]=value;changed();};
$('#clipTrack').onchange=e=>{const c=selection();if(!c||exporting)return;checkpoint();c.track=+e.target.value;changed();revealTrack(c.track);};let volumeEditing=false;$('#volume').onfocus=()=>volumeEditing=false;$('#volume').oninput=e=>{const c=selection();if(!c||e.target.value===''||!e.target.checkValidity())return;if(!volumeEditing){checkpoint();volumeEditing=true;}c.volume=+e.target.value;renderFrame();scheduleSave();};
$('#projectName').onchange=e=>{if(exporting)return;checkpoint();project.name=e.target.value.trim().slice(0,200)||'無題の映像';scheduleSave();};$('#save').onclick=saveDialog;$('#open').onclick=openDialog;
$('#projectInput').onchange=async e=>{try{if(e.target.files.length)await loadProject(JSON.parse(await e.target.files[0].text()));}catch(error){toast(error.message);}finally{e.target.value='';}};
$('#newProject').onclick=async()=>{if(exporting)return;try{await saveLocal();await api('/api/projects/save',{project});checkpoint();stop();project={version:2,name:'新規プロジェクト',trackCount:6,clips:[]};selected=null;selectedKey=null;time=0;$('#projectName').value=project.name;changed();toast('前のプロジェクトを保存して新規作成しました。');}catch(error){toast(error.message);}};
$('#pluginsToggle').onclick=()=>{$('#pluginPanel').hidden=!$('#pluginPanel').hidden;};$('#workspace').onclick=()=>$('#pluginPanel').hidden=true;$('#addEffect').onclick=()=>$('#pluginPanel').hidden=false;
$('#clearEffect').onclick=()=>{const c=selection();if(!c)return;checkpoint();c.effects={};c.effectName='';changed();};$('#installPlugin').onclick=()=>$('#pluginInput').click();$('#pluginInput').onchange=async e=>{try{await api('/api/plugin',JSON.parse(await e.target.files[0].text()));await refreshState();toast('プラグインを読み込みました。');}catch(error){toast(error.message);}finally{e.target.value='';}};
$('#shaderToggle').onclick=$('#editShader').onclick=shaderDialog;$('#export').onclick=exportDialog;$('#dialog').addEventListener('cancel',e=>{if(exporting)e.preventDefault();});
$('#help').onclick=()=>{
 const box=showDialog('拡張編集の操作ガイド','すべての素材を時間とレイヤーで管理します。');const list=el('ol');
 for(const text of ['素材を左右にドラッグで時刻変更、上下でレイヤー移動。上のレイヤーほど前面です。クリップの左右端をドラッグするとトリムできます。','素材を選び「キーフレーム」タブに切り替えると位置・スケール等のキーを編集できます。◇で追加、◆をドラッグで時刻変更。数値は右のインスペクターで変更します。','自動キーをオンにすると現在時刻にキーを作成します。すでにキーがある項目は数値変更でその時刻のキーを追加・更新します。補間は直線・なめらか・瞬間移動。','カメラ制御素材のスケールで出力のズーム、X/Yでパン。3D画面のホイールは編集用視点だけのズームです。','クリッピング素材は直下の表示素材を図形で切り抜きます。対象を指定することもできます。クリッピングは対象より上に置いてください。','シェーダーをGLSLで編集し、コンパイル結果を確認して適用。保存とMP4書き出しにも反映されます。','Ctrl+Sで保存、Ctrl+Oで開く。新規作成前には前のプロジェクトを名前付き保存します。'])list.append(el('li','',text));
 box.append(list,el('p','muted','Space：再生 / 停止 · S：分割 · Delete：選択キーまたは素材を削除 · Ctrl+Z：元に戻す · Ctrl+Shift+Z：やり直し'));
};
document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||e.target.closest('[role=menu]')||e.target.matches('input,textarea,select')||$('#dialog').open||exporting)return;if(e.code==='Space'){e.preventDefault();togglePlay();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveDialog();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();openDialog();}else if(e.key==='Delete'){selectedKey?deleteKey():removeClip();}else if(e.key.toLowerCase()==='s')split();else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stop();time=C.clamp(C.snap(time+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1)/30),0,duration());renderFrame();}});
for(const name of ['dragenter','dragover'])document.addEventListener(name,e=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();$('.media').classList.add('dropover');});document.addEventListener('drop',e=>{e.preventDefault();$('.media').classList.remove('dropover');if(e.dataTransfer.files.length)importFiles(e.dataTransfer.files);});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('.media').classList.remove('dropover');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!exporting)stop();});window.addEventListener('beforeunload',e=>{if(exporting||['保存待ち…','Saving…'].includes($('#saveState').textContent)){e.preventDefault();e.returnValue='';}});
new ResizeObserver(fitViewport).observe($('#viewport'));
setView();refreshState(true);setInterval(()=>refreshState(),2500);
renderer.onInvalidate=()=>{if(!playing&&!exporting&&!dragging)renderFrame();};
