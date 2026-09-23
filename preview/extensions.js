function addPluginMaterial(p){
 if(exporting||!reserveClip())return;
 try{if(p.template.shader?.enabled)renderer.shader.compile(p.template.shader.code);const c=Object.assign(C.createClip(crypto.randomUUID(),p.template.kind||'shape',C.snap(time),selection()?.track??0),C.clone(p.template),{name:p.name});project.clips.push(c);selected=c.id;selectedKey=null;changed();revealTrack(c.track);}catch(e){toast(e.message);}
}
function applyPluginEffect(p){
 const c=selection();if(!c||exporting)return toast('効果を適用する素材を選択してください。');
 if(p.values.shader&&['camera','mask'].includes(c.kind))return toast('カメラ・クリッピング素材にシェーダーは適用できません。');
 try{if(p.values.shader?.enabled)renderer.shader.compile(p.values.shader.code);checkpoint();for(const[k,v]of Object.entries(p.values)){if(k==='keys')c.keys={...c.keys,...C.clone(v)};else c[k]=C.clone(v);}c.effectName=p.name;changed();}catch(e){toast(e.message);}
}
const packAssets=el('div','extension-assets');$('#builtins').after(packAssets);
const extensionRender=renderPlugins;renderPlugins=function(){extensionRender();packAssets.replaceChildren();for(const pack of plugins.filter(p=>p.version===2)){const label=el('div','sectionlabel',pack.name),items=el('div','builtins');for(const material of pack.materials){const b=el('button','',material.name);b.onclick=()=>addPluginMaterial(material);items.append(b);}if(pack.materials.length)packAssets.append(label,items);}};

function saveSelectionPlugin(material){const c=selection();if(!c)return toast('保存する素材を選択してください。');if(material&&c.kind==='media')return toast('素材テンプレートには図形・テキスト・カメラ・クリッピングを選択してください。');const box=showDialog(material?'素材プラグインを作成':'効果プラグインを作成','選択素材の設定を、再利用できるJSONプラグインとして保存します。');const name=el('input');name.value=c.name||'マイプラグイン';name.maxLength=80;name.setAttribute('aria-label','プラグイン名');const save=el('button','primary','プラグインを書き出す');save.onclick=()=>{if(!name.value.trim())return;const fields=material?['kind','duration','x','y','z','scale','rotation','opacity','color','width','height','shape','text','fontSize','align','keys','shader','effects','eq']:['effects','shader','keys','eq'];const values={};for(const k of fields)if(c[k]!==undefined&&c[k]!==null)values[k]=C.clone(c[k]);const entry={name:name.value.trim(),[material?'template':'values']:values},pack={version:2,name:name.value.trim(),materials:material?[entry]:[],effects:material?[]:[entry]};download(JSON.stringify(pack,null,2),name.value.trim()+'.plugin.json');$('#dialog').close();};box.append(name,save);}
for(const [label,material]of [['素材をプラグイン化',true],['効果をプラグイン化',false]]){const b=el('button','',label);b.onclick=()=>saveSelectionPlugin(material);$('#pluginPanel .paneltitle').append(b);}
