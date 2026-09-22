const qs=s=>document.querySelector(s);let playing=false,frame=14,sec=8;
qs('#mode3d').onclick=()=>{qs('.stage').classList.add('spatial');qs('#mode3d').classList.add('active');qs('#mode2d').classList.remove('active')};
qs('#mode2d').onclick=()=>{qs('.stage').classList.remove('spatial');qs('#mode2d').classList.add('active');qs('#mode3d').classList.remove('active')};
qs('#grid').onclick=()=>qs('.stage').classList.toggle('grid');
qs('#play').onclick=()=>{playing=!playing;qs('#play').textContent=playing?'❚❚':'▶'};
setInterval(()=>{if(!playing)return;frame++;if(frame>=60){frame=0;sec++}qs('#tc').textContent=`00:00:${String(sec).padStart(2,'0')}:${String(frame).padStart(2,'0')}`;qs('#playhead').style.left=(42+(sec-8)*1.4+frame/60*1.4)+'%'},1000/60);
const c=qs('#wave'),x=c.getContext('2d');x.strokeStyle='#b8ffe1';x.lineWidth=1;x.beginPath();for(let i=0;i<c.width;i++){const a=Math.sin(i*.08)*8+Math.sin(i*.019)*5;const y=14+a*Math.sin(i*.31);i?x.lineTo(i,y):x.moveTo(i,y)}x.stroke();
