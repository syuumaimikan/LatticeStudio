(()=>{
 const session=crypto.randomUUID(),channel=new BroadcastChannel('lattice-panels-'+session),active=new Map(),ids=new WeakMap();let serial=0;
 const choices={media:['.media','メディア'],inspector:['.inspector','インスペクター'],plugins:['#pluginPanel','プラグイン']};
 function restore(kind){const data=active.get(kind);if(!data)return;data.root.classList.remove('undocked-panel');data.placeholder.remove();active.delete(kind);channel.postMessage({type:'close',kind});window.PanelLayout.refresh();}
 function detach(kind){
  if(active.has(kind))return;const [selector,label]=choices[kind],root=$(selector),placeholder=el('div','detached-placeholder',label+'は別ウィンドウで編集中');const back=el('button','wide','ここに戻す');back.onclick=()=>restore(kind);placeholder.append(back);root.after(placeholder);
  const data={root,placeholder,last:'',nodes:new Map(),heartbeat:Date.now()};active.set(kind,data);root.classList.add('undocked-panel');
  const url=location.origin+'/panel.html?session='+session+'&panel='+kind;
  if(window.pywebview?.api?.open_panel)window.pywebview.api.open_panel(session,kind).catch(e=>{restore(kind);toast(String(e));});else{const child=window.open(url,'lattice-'+session+kind,'popup,width=440,height=760');if(!child){restore(kind);toast('ポップアップを許可してから再度お試しください。');}}
 }
 const button=el('button','','▥ レイアウト');button.onclick=()=>{const box=showDialog('レイアウトをカスタマイズ','メディア・インスペクター・プラグインを独立したウィンドウにできます。ウィンドウの位置とサイズはOSの操作で変更できます。');const swap=el('button','wide','左右のパネルを入れ替える');swap.onclick=()=>window.PanelLayout.swap();box.append(swap);for(const[k,[,name]]of Object.entries(choices)){const b=el('button','wide',name+(active.has(k)?'を戻す':'を別ウィンドウにする'));b.onclick=()=>{active.has(k)?restore(k):detach(k);$('#dialog').close();};box.append(b);}const all=el('button','wide','すべてのパネルを戻す');all.onclick=()=>{for(const k of [...active.keys()])restore(k);$('#dialog').close();};box.append(all);};$('#settings').before(button);
 channel.onmessage=({data:m})=>{const p=active.get(m.kind);if(!p)return;if(m.type==='hello'){p.heartbeat=Date.now();p.last='';}if(m.type==='heartbeat')p.heartbeat=Date.now();if(m.type==='dock')restore(m.kind);if(m.type==='action'){
  const target=p.root.querySelectorAll('button,input,select,textarea,summary')[Number(m.id)];if(!target||!p.root.contains(target)||target.disabled||exporting||m.selection!==selected)return;
  if(m.event==='click'){if(target.id==='import'||target.id==='installPlugin'){toast('素材・プラグインの読み込みはメインウィンドウに戻して行ってください。');return;}target.click();}
  else if(['input','change'].includes(m.event)&&target.matches('input,select,textarea')){if(target.type==='checkbox')target.checked=!!m.checked;else target.value=String(m.value??'');target.dispatchEvent(new Event(m.event,{bubbles:true}));}
  p.last='';
 }};
 setInterval(()=>{for(const[k,p]of active){if(Date.now()-p.heartbeat>30000){restore(k);continue;}const clone=p.root.cloneNode(true);clone.hidden=false;clone.classList.remove('undocked-panel');p.nodes.clear();const originals=p.root.querySelectorAll('button,input,select,textarea,summary'),copies=clone.querySelectorAll('button,input,select,textarea,summary');originals.forEach((node,i)=>{const id=String(i);p.nodes.set(id,node);copies[i].dataset.remoteId=id;if(node.matches('input')){copies[i].setAttribute('value',node.value);copies[i].toggleAttribute('checked',node.checked);}if(node.matches('textarea'))copies[i].textContent=node.value;if(node.matches('select'))[...copies[i].options].forEach((v,j)=>v.toggleAttribute('selected',j===node.selectedIndex));});const html=clone.outerHTML,theme=document.documentElement.dataset.theme||'dark';const signature=html+theme;if(signature!==p.last){p.last=signature;channel.postMessage({type:'render',kind:k,html,theme,selection:selected});}}},250);
 window.addEventListener('beforeunload',()=>channel.postMessage({type:'shutdown'}));
})();
