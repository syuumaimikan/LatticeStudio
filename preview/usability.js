'use strict';
// Workspace controls share the editor's existing undo, save and render pipeline.
let snapEnabled=true,lastClipClick={id:null,at:0};
function finishClipClick(id){const now=performance.now();if(lastClipClick.id===id&&now-lastClipClick.at<400){lastClipClick={id:null,at:0};switchTimeline(true);}else{lastClipClick={id,at:now};renderTimeline();}}
const actionButton=(id,text,title,run)=>{const b=el('button','',text);b.id=id;b.title=title;b.onclick=run;return b;};
function revealSelection(){const c=selection();if(!c)return;revealTrack(c.track);const sc=$('#timelineScroll');sc.scrollLeft=Math.max(0,c.start*zoom-50);}
function fitTimeline(){zoom=EditingUX.fitZoom($('#timelineScroll').clientWidth,duration());$('#zoom').value=zoom;renderTimeline();$('#timelineScroll').scrollLeft=0;}
function duplicateClip(){const c=selection();if(!c||!reserveClip())return;const copy=C.clone(c);copy.id=crypto.randomUUID();copy.name=clipName(c).slice(0,190)+' のコピー';copy.start=C.snap(c.start+c.duration);project.clips.push(copy);selected=copy.id;selectedKey=null;time=copy.start;changed();revealSelection();toast('素材を複製しました。Ctrl+Zで取り消せます。');}
function moveLayer(direction){const c=selection();if(!c||exporting)return;const next=c.track+direction;if(next<0||next>=128)return;if(next>=project.trackCount){checkpoint();project.trackCount=next+1;}else checkpoint();c.track=next;changed();revealTrack(next);}
function centerClip(){const c=selection();if(!c||exporting)return;checkpoint();for(const prop of ['x','y'])C.changeValue(c,prop,C.localTime(c,time),0,$('#autoKey').checked,$('#keyEasing').value);changed();}
function seekSelection(){const c=selection();if(!c)return;stop();time=c.start;renderFrame();revealSelection();}
function quickHelp(){const box=showDialog('キーボードで、すばやく編集','入力欄の編集中は、文字入力を優先します。');const rows=[['Space','再生 / 停止'],['← / →','1フレーム移動'],['Shift + ← / →','10フレーム移動'],['Ctrl + D','選択素材を複製'],['Ctrl + Z / Ctrl + Shift + Z','元に戻す / やり直し'],['S','再生位置で分割'],['Delete','選択素材・キーを削除'],['F','タイムライン全体表示'],['Home / End','映像の先頭 / 最後'],['Ctrl + S / Ctrl + O','保存 / 開く']];const table=el('div','shortcutlist');for(const[key,label]of rows){const row=el('div');row.append(el('kbd','',key),el('span','',label));table.append(row);}box.append(table,el('p','muted','タイムラインはCtrl＋ホイールで拡大・縮小。吸着中もAltを押せば一時解除できます。上端をドラッグするとタイムラインの高さを調整できます。'));}
const toolbar=$('.timelinehead');
$('#split').before(actionButton('duplicate','複製','素材を複製（Ctrl+D）',duplicateClip));
const fit=actionButton('fitTimeline','全体表示','映像全体を画面に収める（F）',fitTimeline);
const snapButton=actionButton('snapToggle','吸着 ON','素材の端・再生位置に吸着（Altで一時解除）',()=>{snapEnabled=!snapEnabled;snapButton.classList.toggle('active',snapEnabled);snapButton.setAttribute('aria-pressed',String(snapEnabled));snapButton.textContent='吸着 '+(snapEnabled?'ON':'OFF');});snapButton.classList.add('active');snapButton.setAttribute('aria-pressed','true');
toolbar.querySelector('.zoom').before(snapButton,fit);$('#zoom').min='.01';$('#zoom').step='any';
$('#help').before(actionButton('shortcuts','⌨','キーボードショートカット',quickHelp));
const guide=el('div','snapguide');guide.hidden=true;$('#trackArea').append(guide);
function showSnapGuide(t){guide.hidden=t===null;if(t!==null)guide.style.left=t*zoom+'px';}
// Put the frequently edited content first; secondary settings fold away.
const controls=$('#controls');
const contentGroup=el('details','propertygroup');contentGroup.open=true;contentGroup.append(el('summary','','素材の内容'),$('#contentControls'));
const transformGroup=el('details','propertygroup');transformGroup.open=true;transformGroup.append(el('summary','','位置・サイズ・アニメーション'),$('.keyoptions'),$('#transformControls'));
const timingGroup=el('details','propertygroup');timingGroup.append(el('summary','','タイミング・レイヤー・音量'));
for(const n of [...controls.querySelectorAll('[data-timing],#clipTrack,#volume')])timingGroup.append(n.closest('label'));
const effectGroup=el('details','propertygroup');effectGroup.append(el('summary','','エフェクト・シェーダー'));for(const id of ['appliedEffect','clearEffect','addEffect','shaderInfo','editShader'])effectGroup.append($('#'+id));
const actions=el('div','objectactions');actions.append(actionButton('centerClip','中央に配置','XとYを中央に配置',centerClip),actionButton('frontClip','前へ ↑','1つ上のレイヤーへ',()=>moveLayer(1)),actionButton('backClip','後ろへ ↓','1つ下のレイヤーへ',()=>moveLayer(-1)));
controls.replaceChildren(actions,contentGroup,transformGroup,timingGroup,effectGroup);$('.inspecttab').remove();
const emptyInspector=el('div','emptyinspector');emptyInspector.append(el('span','','↖'),el('b','','素材を選択してください'),el('p','','タイムラインの素材をクリックすると、文字・色・大きさをここで調整できます。'));controls.before(emptyInspector);
const selectionNotice=el('button','selectionnotice','選択素材が表示時間の外にあります。先頭へ移動 →');selectionNotice.onclick=seekSelection;$('#selectionName').after(selectionNotice);
const oldInspector=renderInspector;renderInspector=function(){oldInspector();const c=selection();controls.hidden=!c;emptyInspector.hidden=!!c;$('#duplicate').disabled=!c||exporting;$('#frontClip').disabled=!c||c.track>=127||exporting;$('#backClip').disabled=!c||c.track===0||exporting;$('#centerClip').disabled=!c||exporting;$('#split').disabled=!c||exporting||time<=c.start||time>=c.start+c.duration;};
const oldFrame=renderFrame;renderFrame=function(){oldFrame();const c=selection();selectionNotice.hidden=!c||time>=c.start&&time<c.start+c.duration;$('#split').disabled=!c||exporting||time<=c.start||time>=c.start+c.duration;};
const oldTimeline=renderTimeline;renderTimeline=function(){if(!selection())showKeys=false;oldTimeline();$('#keyTab').disabled=!selection();$('#duplicate').disabled=!selection()||exporting;$('#split').disabled=!selection()||exporting||time<=selection().start||time>=selection().start+selection().duration;$('#keyHint').textContent=showKeys?'◆をドラッグで時刻変更 ／ 空白をダブルクリックで追加':'左右にドラッグで時間移動 · 上下でレイヤー移動 · 右クリックで操作';};
// The right click menu uses the same actions and undo history as the toolbar.
const menu=el('div','clipmenu');menu.hidden=true;menu.setAttribute('role','menu');document.body.append(menu);
function closeMenu(){menu.hidden=true;}
function openClipMenu(event,id){event.preventDefault();if(exporting)return;select(id);menu.replaceChildren();for(const[label,action,disabled]of [['素材の先頭へ',seekSelection,false],['複製　Ctrl+D',duplicateClip,false],['前のレイヤーへ',()=>moveLayer(1),selection().track>=127],['後ろのレイヤーへ',()=>moveLayer(-1),selection().track===0],['キーフレームを編集',()=>switchTimeline(true),false],['再生位置で分割　S',split,time<=selection().start||time>=selection().start+selection().duration],['削除　Delete',removeClip,false]]){const b=el('button','',label);b.setAttribute('role','menuitem');b.disabled=disabled;b.onclick=()=>{closeMenu();action();};menu.append(b);}menu.hidden=false;menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-240))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button').focus();}
$('#tracks').addEventListener('contextmenu',e=>{const clip=e.target.closest('.clip');if(clip)openClipMenu(e,clip.dataset.id);});

document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))closeMenu();},true);
document.addEventListener('keydown',e=>{if(menu.hidden)return;if(e.key==='Escape'){e.preventDefault();closeMenu();$('#timelineScroll').focus();}if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const list=[...menu.querySelectorAll('button:not(:disabled)')],index=list.indexOf(document.activeElement);list[(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length].focus();}},true);
// Resize without moving or selecting the text in either panel.
const resize=el('div','timelineResize');resize.tabIndex=0;resize.setAttribute('role','separator');resize.setAttribute('aria-label','タイムラインの高さ');resize.setAttribute('aria-orientation','horizontal');resize.title='ドラッグで高さを変更 · ダブルクリックで標準に戻す';$('.timeline').prepend(resize);
function timelineHeight(height){const h=C.clamp(height,210,Math.max(210,innerHeight-340));$('#app').style.setProperty('--timeline-height',h+'px');resize.setAttribute('aria-valuemin','210');resize.setAttribute('aria-valuemax',String(Math.max(210,innerHeight-340)));resize.setAttribute('aria-valuenow',Math.round(h));fitViewport();}
resize.onpointerdown=e=>{if(e.button!==0||exporting)return;const start=e.clientY,h=$('.timeline').offsetHeight;beginDrag(e,resize,p=>timelineHeight(h+start-p.clientY));};resize.ondblclick=()=>timelineHeight(300);resize.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();timelineHeight($('.timeline').offsetHeight+(e.key==='ArrowUp'?20:-20));}};
window.addEventListener('resize',()=>timelineHeight($('.timeline').offsetHeight));
$('#timelineScroll').tabIndex=0;
$('#timelineScroll').addEventListener('wheel',e=>{if(!e.ctrlKey||exporting)return;e.preventDefault();const sc=$('#timelineScroll'),x=e.clientX-sc.getBoundingClientRect().left,at=(sc.scrollLeft+x)/zoom;zoom=C.clamp(zoom*Math.exp(-e.deltaY*.003),.01,200);$('#zoom').value=zoom;renderTimeline();sc.scrollLeft=at*zoom-x;},{passive:false});
document.addEventListener('keydown',e=>{if(e.isComposing||e.target.matches('input,textarea,select')||$('#dialog').open||exporting||!menu.hidden)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateClip();}else if(!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='f'){e.preventDefault();fitTimeline();}else if(['Home','End'].includes(e.key)){e.preventDefault();stop();time=e.key==='Home'?0:duration();renderFrame();}else if(e.key==='Escape'){select(null);}});
renderInspector();renderTimeline();renderFrame();timelineHeight(300);
