'use strict';
let preferences={theme:'dark',language:'ja'};
function setWorkspaceTab(mode){for(const[id,key]of [['workspace','edit'],['pluginsToggle','plugins'],['shaderToggle','shader']]){const button=$('#'+id);button.classList.toggle('active',mode===key);button.setAttribute('aria-pressed',String(mode===key));}}
$('#workspace').onclick=()=>{$('#pluginPanel').hidden=true;setWorkspaceTab('edit');};
$('#pluginsToggle').onclick=()=>{$('#pluginPanel').hidden=!$('#pluginPanel').hidden;setWorkspaceTab($('#pluginPanel').hidden?'edit':'plugins');};
$('#addEffect').onclick=()=>{$('#pluginPanel').hidden=false;setWorkspaceTab('plugins');};
$('#shaderToggle').onclick=shaderGraphDialog;
$('#dialog').addEventListener('close',()=>setWorkspaceTab($('#pluginPanel').hidden?'edit':'plugins'));
setWorkspaceTab('edit');
const graphButton=el('button','wide','シェーダーグラフ');graphButton.onclick=shaderGraphDialog;$('#editShader').after(graphButton);
function applyPreferences(value){preferences=value;document.documentElement.dataset.theme=value.theme;document.documentElement.lang=value.language;window.translateUI?.();}
fetch('/api/preferences').then(r=>r.ok?r.json():preferences).then(applyPreferences).catch(()=>{});
function projectSettings(isNew=false){if(exporting)return;const box=showDialog(isNew?'新規プロジェクト':'プロジェクト設定','サイズを変更しても素材の位置や大きさの数値は維持します。編集画面と書き出しの基準サイズを設定します。');
 const name=el('input'),width=el('input'),height=el('input'),tracks=el('input'),preset=el('select');
 const field=(label,input)=>{const row=el('label','settingfield',label);input.setAttribute('aria-label',label);row.append(input);box.append(row);};
 name.value=isNew?'新規プロジェクト':project.name;name.maxLength=200;field('プロジェクト名',name);
 for(const[label,value]of [['4K UHD','3840,2160'],['フルHD','1920,1080'],['縦長','1080,1920'],['正方形','1080,1080'],['カスタム','']])preset.append(new Option(label,value));preset.value='';field('サイズプリセット',preset);
 for(const n of [width,height,tracks]){n.type='number';n.step=n===tracks?1:2;n.min=n===tracks?1:128;n.max=n===tracks?128:4096;}
 width.value=isNew?1920:project.width||3840;height.value=isNew?1080:project.height||2160;tracks.value=isNew?6:project.trackCount;field('幅（px）',width);field('高さ（px）',height);field('レイヤー数（1〜128）',tracks);preset.onchange=()=>{if(preset.value)[width.value,height.value]=preset.value.split(',');};
 const save=el('button','primary',isNew?'作成':'変更を適用');save.onclick=async()=>{const w=+width.value,h=+height.value,count=+tracks.value;if(!width.checkValidity()||!height.checkValidity()||!tracks.checkValidity()||w*h>3840*2160)return toast('サイズとレイヤー数を確認してください。');if(!isNew&&project.clips.some(c=>c.track>=count))return toast('素材があるレイヤーは削除できません。素材を移動してください。');save.disabled=true;try{if(isNew){await saveLocal();await api('/api/projects/save',{project});}checkpoint();stop();if(isNew){project={version:2,clips:[],masterEq:{}};selected=null;selectedKey=null;time=0;}Object.assign(project,{name:name.value.trim()||'新規プロジェクト',width:w,height:h,trackCount:count});$('#projectName').value=project.name;changed();setView();await saveLocal();$('#dialog').close();}catch(e){toast(e.message);}finally{save.disabled=false;}};box.append(el('p','muted','30 fps · 幅・高さは偶数、総画素数は4K UHD以下。レイヤー数を減らす場合は空のレイヤーのみ削除できます。'),save);
}
$('#newProject').onclick=()=>projectSettings(true);
const projectButton=el('button','','プロジェクト設定');projectButton.onclick=()=>projectSettings();$('#newProject').before(projectButton);
const settingsButton=el('button','','⚙ 設定');settingsButton.id='settings';$('#help').before(settingsButton);
settingsButton.onclick=()=>{const box=showDialog('設定','テーマと言語は次回起動時にも保持されます。');const theme=el('select'),language=el('select');theme.setAttribute('aria-label','UIテーマ');language.setAttribute('aria-label','UI言語');theme.append(new Option('ダーク','dark'),new Option('ライト','light'));language.append(new Option('日本語','ja'),new Option('English','en'));theme.value=preferences.theme;language.value=preferences.language;box.append(el('label','','UIテーマ'),theme,el('label','','UI言語'),language);const save=el('button','primary','設定を保存');save.onclick=async()=>{try{const next={theme:theme.value,language:language.value};await api('/api/preferences',next);applyPreferences(next);$('#dialog').close();}catch(e){toast(e.message);}};const projectLink=el('button','wide','サイズ・レイヤー数を変更');projectLink.onclick=()=>projectSettings();box.append(save,projectLink);};
const dimensionFrame=renderFrame;renderFrame=function(){const w=project.width||3840,h=project.height||2160,canvas=$('#scene'),pw=Math.round(Math.min(960,w)),ph=Math.round(pw*h/w);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;fitViewport();}$('#composition').style.aspectRatio=w+'/'+h;const pill=$('.projectbar .pill');pill.textContent=w+' × '+h;$('.projectbar .muted').textContent='30 fps';dimensionFrame();};
const newShapes={ellipse:'楕円',diamond:'ひし形',hexagon:'六角形',arrow:'矢印',heart:'ハート',ring:'リング',line:'直線',grid:'グリッド',checker:'市松模様',gradient:'グラデーション'};
for(const[k,label]of Object.entries(newShapes)){const b=el('button','',label);b.onclick=()=>{addBuiltin(k);if(selection()){selection().name=label;if(k==='line'){selection().height=16;selection().width=1200;}changed();}};$('#builtins').append(b);}
const counter=el('button','','タイムコード');counter.onclick=()=>{addBuiltin('text');const c=selection();if(c){c.name='タイムコード';c.builtin='timecode';changed();}};$('#builtins').append(counter);
const subtitle=el('button','','字幕');subtitle.onclick=()=>{addBuiltin('text');const c=selection();if(c){c.name='字幕';c.text='ここに字幕を入力';c.y=(project.height||2160)*.36;c.fontSize=96;changed();}};$('#builtins').append(subtitle);
const extraInspector=renderInspector;renderInspector=function(){extraInspector();const c=selection(),select=$('#contentControls select[aria-label="図形"]');if(select){for(const[k,v]of Object.entries(newShapes))select.append(new Option(v,k));select.value=c.shape;}};
renderFrame();

const panViewButton=el('button','','✥');panViewButton.id='panView';panViewButton.title='視点移動モード（出力カメラは変更しません）';panViewButton.setAttribute('aria-label','視点移動モード');panViewButton.setAttribute('aria-pressed','false');panViewButton.onclick=()=>{viewPanMode=!viewPanMode;panViewButton.classList.toggle('active',viewPanMode);panViewButton.setAttribute('aria-pressed',String(viewPanMode));$('#viewport').style.cursor=viewPanMode?'grab':'';};$('#resetView').before(panViewButton);
