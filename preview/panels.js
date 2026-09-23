/* Docked drawers: view preferences never change project data. */
(()=>{
 const main=document.querySelector('main'),key='lattice-panel-layout-v1';
 let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
 const state={},panels={};
 for(const [side,selector,label,initial] of [['left','.media','メディアライブラリ',246],['right','.inspector','インスペクター',264]]){
  const panel=document.querySelector(selector),dock=document.createElement('div');dock.className='paneldock '+side;
  panel.before(dock);dock.append(panel);panel.id=panel.id||side+'Sidebar';
  state[side]={open:saved[side]?.open!==false,width:Math.max(200,Math.min(440,Number(saved[side]?.width)||initial))};
  const toggle=document.createElement('button');toggle.className='drawer-toggle';toggle.setAttribute('aria-controls',panel.id);dock.append(toggle);
  const handle=document.createElement('div');handle.className='panel-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',label+'の幅');dock.append(handle);
  panels[side]={panel,dock,toggle,handle,label};
  toggle.onclick=()=>{state[side].open=!state[side].open;apply();save();};
  handle.onpointerdown=e=>{if(e.button!==0)return;const start=e.clientX,width=panels[side].dock.clientWidth;beginDrag(e,handle,ev=>{state[side].width=Math.max(200,Math.min(440,width+(ev.clientX-start)*(side==='left'?1:-1)));apply();},save);};
  handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();state[side].width=e.key==='Home'?initial:Math.max(200,Math.min(440,state[side].width+(e.key==='ArrowRight'?20:-20)*(side==='left'?1:-1)));apply();save();};
  handle.ondblclick=()=>{state[side].width=initial;apply();save();};
 }
 function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
 function apply(){
  const available=Math.max(64,main.clientWidth-360),requested=['left','right'].map(s=>state[s].open?state[s].width:32);
  let extra=Math.max(0,requested[0]+requested[1]-available);
  for(let i=0;i<2;i++){const reduce=Math.min(extra,Math.max(0,requested[i]-160));requested[i]-=reduce;extra-=reduce;}
  main.style.gridTemplateColumns=requested[0]+'px minmax(0,1fr) '+requested[1]+'px';
  for(const [i,side]of ['left','right'].entries()){
   const p=panels[side],open=state[side].open;p.panel.hidden=!open;p.dock.classList.toggle('collapsed',!open);p.toggle.textContent=side==='left'?(open?'‹':'›'):(open?'›':'‹');p.toggle.setAttribute('aria-expanded',String(open));p.toggle.setAttribute('aria-controls',p.panel.id);p.handle.setAttribute('aria-label',p.label+'の幅');
   const label=p.label+(open?'を閉じる':'を開く');p.toggle.title=label;p.toggle.setAttribute('aria-label',label);p.handle.hidden=!open;p.handle.setAttribute('aria-valuemin','160');p.handle.setAttribute('aria-valuemax','440');p.handle.setAttribute('aria-valuenow',String(Math.round(requested[i])));
  }
 }
 window.PanelLayout={swap(){const a=panels.left.panel,b=panels.right.panel;panels.left.dock.prepend(b);panels.right.dock.prepend(a);panels.left.panel=b;panels.right.panel=a;[panels.left.label,panels.right.label]=[panels.right.label,panels.left.label];saved.swapped=!saved.swapped;state.swapped=saved.swapped;apply();save();},refresh:apply};if(saved.swapped){saved.swapped=false;window.PanelLayout.swap();}new ResizeObserver(apply).observe(main);apply();
})();
