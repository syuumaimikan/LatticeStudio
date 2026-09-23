'use strict';
// Built-in presets serialize into the project; no installation is needed.
window.ExtraPlugins = [
 {id:'color-vivid',name:'鮮やか',category:'カラー',description:'彩度とコントラストを上げ、色をくっきり見せます。',effects:{brightness:0.02,contrast:1.12,saturation:1.5}},
 {id:'color-pastel',name:'パステル',category:'カラー',description:'淡い色と柔らかい陰影。背景や日常映像に。',effects:{brightness:0.1,contrast:0.8,saturation:0.65}},
 {id:'color-noir',name:'ノワール',category:'カラー',description:'強いコントラストの白黒表現。',effects:{brightness:-0.05,contrast:1.7,saturation:0}},
 {id:'color-lowkey',name:'ローキー',category:'カラー',description:'明るさを抑えて、落ち着いた雰囲気に。',effects:{brightness:-0.2,contrast:1.15,saturation:0.8}},
 {id:'color-highkey',name:'ハイキー',category:'カラー',description:'明るく軽やかなトーンに整えます。',effects:{brightness:0.22,contrast:0.9,saturation:1.05}},
 {id:'color-muted',name:'くすみカラー',category:'カラー',description:'彩度を抑えた控えめな色調。',effects:{brightness:0.03,contrast:0.95,saturation:0.45}},
 {id:'shader-sepia',name:'セピア',category:'色変換',description:'古い写真のような茶色の色調。',code:'vec4 effect(vec2 uv,vec4 c){vec3 s=vec3(dot(c.rgb,vec3(.393,.769,.189)),dot(c.rgb,vec3(.349,.686,.168)),dot(c.rgb,vec3(.272,.534,.131)));return vec4(clamp(s,0.0,1.0),c.a);}'},
 {id:'shader-cool',name:'クールブルー',category:'色変換',description:'青みを加えて、冷たい空気感を表現。',code:'vec4 effect(vec2 uv,vec4 c){return vec4(clamp(c.rgb*vec3(.83,.96,1.16),0.0,1.0),c.a);}'},
 {id:'shader-amber',name:'アンバー',category:'色変換',description:'赤と黄を強め、暖かな光を表現。',code:'vec4 effect(vec2 uv,vec4 c){return vec4(clamp(c.rgb*vec3(1.15,1.02,.78),0.0,1.0),c.a);}'},
 {id:'shader-invert',name:'ネガ反転',category:'色変換',description:'RGBを反転してネガフィルム風に。',code:'vec4 effect(vec2 uv,vec4 c){return vec4(1.0-c.rgb,c.a);}'},
 {id:'shader-vignette',name:'ビネット',category:'映像効果',description:'画面の周囲を暗くし、中央を強調。',code:'vec4 effect(vec2 uv,vec4 c){float v=1.0-.65*smoothstep(.2,.7,length(uv-.5));return vec4(c.rgb*v,c.a);}'},
 {id:'shader-poster',name:'ポスタリゼーション',category:'映像効果',description:'色を6段階に分け、イラストのように。',code:'vec4 effect(vec2 uv,vec4 c){return vec4(floor(c.rgb*5.0+.5)/5.0,c.a);}'},
 {id:'shader-pixel',name:'モザイク',category:'映像効果',description:'画面を80列のブロックに分割します。',code:'vec4 effect(vec2 uv,vec4 c){vec2 grid=vec2(80.0,max(1.0,80.0*u_resolution.y/u_resolution.x));vec2 p=(floor(uv*grid)+.5)/grid;return sampleSource(clamp(p,0.0,1.0));}'},
 {id:'shader-scan',name:'走査線',category:'映像効果',description:'横方向のラインでレトロモニター風に。',code:'vec4 effect(vec2 uv,vec4 c){float line=.78+.22*step(.35,fract(uv.y*180.0));return vec4(c.rgb*line,c.a);}'},
 {id:'shader-wave',name:'波紋ウェーブ',category:'アニメーション',description:'時間とともに映像が横へ揺れる効果。',code:'vec4 effect(vec2 uv,vec4 c){vec2 p=uv;p.x+=sin(uv.y*28.0+u_time*3.0)*.012;return sampleSource(clamp(p,0.0,1.0));}'},
 {id:'shader-pulse',name:'光のパルス',category:'アニメーション',description:'2秒周期でゆっくり明るさを変化。',code:'vec4 effect(vec2 uv,vec4 c){float light=.85+.15*cos(u_time*3.14159265);return vec4(c.rgb*light,c.a);}'}
];
