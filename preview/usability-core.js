(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.EditingUX=api;})(globalThis,()=>{
 'use strict';
 function snapPosition(start,length,clips,excluded,playhead,tolerance,edge='move'){
  const points=[0,playhead,...clips.filter(c=>c.id!==excluded).flatMap(c=>[c.start,c.start+c.duration])];
  let best=tolerance,delta=0,target=null;
  const edges=edge==='right'?[start+length]:edge==='left'?[start]:[start,start+length];
  for(const point of points)for(const value of edges){const d=point-value;if(Math.abs(d)<best&&start+d>=0){best=Math.abs(d);delta=d;target=point;}}
  return {start:start+delta,target};
 }
 function fitZoom(width,duration){return Math.max(.01,Math.min(200,(width-48)/Math.max(1,duration)));}
 return {snapPosition,fitZoom};
});
