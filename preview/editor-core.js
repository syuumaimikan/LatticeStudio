/* Pure timeline model shared by the UI, renderer, and Node regression tests. */
(function (root) {
  'use strict';
  const PARAMS = {
    x: { label: '位置 X', min: -7680, max: 7680, initial: 0 },
    y: { label: '位置 Y', min: -4320, max: 4320, initial: 0 },
    z: { label: '奥行き Z', min: -1500, max: 1500, initial: 0 },
    scale: { label: 'スケール / ズーム', min: 1, max: 800, initial: 100 },
    rotation: { label: '回転 Z', min: -3600, max: 3600, initial: 0 },
    rotationX: { label: '回転 X', min: -3600, max: 3600, initial: 0 },
    rotationY: { label: '回転 Y', min: -3600, max: 3600, initial: 0 },
    opacity: { label: '不透明度', min: 0, max: 100, initial: 100 },
  };
  const DEFAULT_SHADER = `// uv: 0〜1 の座標 / color: 元の色
// u_time: クリップ内の秒数 / u_resolution: ピクセル寸法
// sampleSource(uv): 元画像のサンプリング
vec4 effect(vec2 uv, vec4 color) {
    return color;
}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const snap = seconds => Math.round(seconds * 30) / 30;
  const active = (clip, time) => time >= clip.start && time < clip.start + clip.duration;
  const localTime = (clip, time) => clamp(time - clip.start, 0, clip.duration);
  const sorted = project => project.clips.map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.track - b.c.track || a.c.start - b.c.start || a.i - b.i).map(v => v.c);

  function bezierAt(x, curve = [.25,.1,.25,1]) {
    if(x<=0)return 0;if(x>=1)return 1;
    const [x1,y1,x2,y2]=curve;
    const axis=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
    let lo=0,hi=1;
    for(let i=0;i<30;i++){const t=(lo+hi)/2;if(axis(t,x1,x2)<x)lo=t;else hi=t;}
    return axis((lo+hi)/2,y1,y2);
  }
  function valueAt(clip, prop, t) {
    const keys = clip.keys?.[prop] || [];
    if (!keys.length) return clip[prop] ?? PARAMS[prop]?.initial ?? 0;
    if (t <= keys[0].time) return keys[0].value;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t <= b.time) {
        let ratio = clamp((t - a.time) / (b.time - a.time), 0, 1);
        if (a.easing === 'hold') ratio = t < b.time ? 0 : 1;
        if (a.easing === 'bezier') ratio = bezierAt(ratio,a.curve);
        if (a.easing === 'smooth') ratio = ratio * ratio * (3 - 2 * ratio);
        return a.value + (b.value - a.value) * ratio;
      }
    }
    return keys[keys.length - 1].value;
  }

  function evaluate(clip, time) {
    const result = { ...clip };
    for (const prop of Object.keys(PARAMS)) result[prop] = valueAt(clip, prop, localTime(clip, time));
    return result;
  }

  function setKey(clip, prop, time, value, easing = 'linear') {
    if (!PARAMS[prop]) throw Error('対応していないパラメーターです。');
    clip.keys ||= {};
    const keys = clip.keys[prop] ||= [];
    const t = clamp(snap(time), 0, clip.duration);
    const existing = keys.find(k => Math.abs(k.time - t) < 1 / 60);
    if (existing) Object.assign(existing, { value, easing });
    else keys.push({ time: t, value, easing });
    keys.sort((a, b) => a.time - b.time);
  }

  function changeValue(clip, prop, time, value, autoKey, easing) {
    const bounds = PARAMS[prop];
    value = clamp(value, bounds.min, bounds.max);
    const keys = clip.keys?.[prop] || [];
    if (keys.length || autoKey) {
      if (!keys.length && time > 1 / 60) setKey(clip, prop, 0, clip[prop], easing);
      setKey(clip, prop, time, value, easing);
    } else clip[prop] = value;
  }

  function splitClip(clip, offset, newId) {
    if (offset < 1 / 30 || clip.duration - offset < 1 / 30) throw Error('クリップの内側で分割してください。');
    const left = clone(clip), right = clone(clip);
    left.duration = offset;
    right.id = newId;
    right.start += offset;
    right.duration -= offset;
    right.sourceIn += offset;
    // Keep the complete animation curve in its original time domain. Smooth
    // interpolation must not be re-fitted at the split boundary.
    for (const prop of Object.keys(PARAMS)) {
      const keys = clip.keys?.[prop];
      if (keys?.length) right.keys[prop] = keys.map(k => ({ ...k, time: k.time - offset }));
    }
    right.shaderOffset = (clip.shaderOffset || 0) + offset;
    return [left, right];
  }

  function createClip(id, kind, start, track, asset = null) {
    return { id, kind, name: '', asset, start, track, duration: 5, sourceIn: 0,
      x: 0, y: 0, z: 0, scale: 100, rotation: 0, opacity: 100, volume: 100,
      effects: {}, effectName: '', keys: {}, color: '#b0efcf', width: 1200, height: 700,
      shape: 'rectangle', text: 'テキスト', fontSize: 180, align: 'center',
      maskTarget: '', shader: null, shaderOffset: 0 };
  }

  function migrate(input) {
    const p = clone(input);
    if (![1, 2].includes(p.version) || !Array.isArray(p.clips)) throw Error('プロジェクト形式が不正です。');
    p.version = 2;
    p.trackCount = Math.max(6, p.trackCount || 6, ...p.clips.map(c => c.track + 1));
    p.clips = p.clips.map(c => ({ ...createClip(c.id, 'media', c.start, c.track, c.asset), ...c }));
    return p;
  }

  const api = { PARAMS, DEFAULT_SHADER, clone, clamp, snap, active, localTime, sorted,
    bezierAt, valueAt, evaluate, setKey, changeValue, splitClip, createClip, migrate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Lattice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
