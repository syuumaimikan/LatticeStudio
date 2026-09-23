(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ShaderGraph=api;})(globalThis,()=>{
 const types={source:'素材',tint:'色を乗せる',invert:'反転',gray:'白黒',exposure:'露出',poster:'階調',mix:'ミックス',output:'出力'};
 function compile(graph){
  if(!graph||!Array.isArray(graph.nodes)||graph.nodes.length>32||!Array.isArray(graph.links))throw Error('ノードは32個までです。');
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));if(nodes.size!==graph.nodes.length)throw Error('ノードIDが重複しています。');
  const outputs=graph.nodes.filter(n=>n.type==='output');if(outputs.length!==1)throw Error('出力ノードを1つ用意してください。');
  const visited=new Set(),visiting=new Set(),lines=[],names=new Map();
  function visit(id){const n=nodes.get(id);if(!n||!types[n.type])throw Error('未対応のノードです。');if(visiting.has(id))throw Error('循環接続は使用できません。');if(visited.has(id))return names.get(id);visiting.add(id);
   const input=slot=>{const links=graph.links.filter(l=>l.to===id&&l.slot===slot);if(links.length!==1)throw Error(types[n.type]+'の入力を接続してください。');return visit(links[0].from);};
   let expression;const num=(fallback,min,max)=>{const v=Number(n.value??fallback);if(!Number.isFinite(v)||v<min||v>max)throw Error('ノードの値が範囲外です。');return v.toFixed(4);};
   if(n.type==='source')expression='sampleSource(uv)';
   else if(n.type==='output')expression=input(0);
   else {const a=input(0);switch(n.type){case 'tint':{if(!/^#[0-9a-fA-F]{6}$/.test(n.color||''))throw Error('色が不正です。');const rgb=[1,3,5].map(i=>(parseInt(n.color.slice(i,i+2),16)/255).toFixed(4));expression=`vec4(${a}.rgb*vec3(${rgb.join(',')}),${a}.a)`;break;}
    case 'invert':expression=`vec4(1.0-${a}.rgb,${a}.a)`;break;
    case 'gray':expression=`vec4(vec3(dot(${a}.rgb,vec3(.2126,.7152,.0722))),${a}.a)`;break;
    case 'exposure':expression=`vec4(clamp(${a}.rgb*exp2(${num(0,-4,4)}),0.0,1.0),${a}.a)`;break;
    case 'poster':expression=`vec4(floor(${a}.rgb*${num(6,2,32)})/${num(6,2,32)},${a}.a)`;break;
    case 'mix':expression=`mix(${a},${input(1)},${num(.5,0,1)})`;break;
   }}
   const name='n'+lines.length;lines.push(`vec4 ${name}=${expression};`);names.set(id,name);visiting.delete(id);visited.add(id);return name;
  }
  const end=visit(outputs[0].id);return `vec4 effect(vec2 uv,vec4 color){\n${lines.join('\n')}\nreturn ${end};\n}`;
 }
 function initial(){return {nodes:[{id:'source',type:'source',x:30,y:90},{id:'output',type:'output',x:540,y:90}],links:[{from:'source',to:'output',slot:0}]};}
 return {types,compile,initial};
});
