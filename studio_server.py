"""Lattice Studio local editor. Python 3.11+, FFmpeg and FFprobe required."""
from __future__ import annotations
import concurrent.futures
import json
import math
import mimetypes
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote
from studio_audio import validate_eq, Waveforms

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('LATTICE_DATA', str(ROOT / '.lattice-local'))).resolve()
for folder in ('media', 'proxy', 'exports', 'plugins', 'jobs'):
    (DATA / folder).mkdir(parents=True, exist_ok=True)
TOKEN = secrets.token_urlsafe(32)
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=1)
LOCK = threading.RLock()
JOBS = {}
FFMPEG = shutil.which('ffmpeg')
FFPROBE = shutil.which('ffprobe')
FLAGS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def read_json(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


ASSETS = read_json(DATA / 'assets.json', [])
BUILTINS = [
    {'id': 'warm', 'name': '夕暮れの温度', 'description': '暖色と柔らかなコントラスト', 'version': 1, 'effects': {'brightness': 0.03, 'contrast': 1.08, 'saturation': 1.18}},
    {'id': 'mono', 'name': 'モノクローム', 'description': '光と陰影を際立たせる', 'version': 1, 'effects': {'saturation': 0, 'contrast': 1.15}},
    {'id': 'soft', 'name': 'ソフトフィルム', 'description': '落ち着いたフィルム調', 'version': 1, 'effects': {'contrast': 0.88, 'saturation': 0.75, 'brightness': 0.04}},
]


def atomic_json(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def probe(path):
    if not FFPROBE:
        raise ValueError('FFprobe が見つかりません。FFmpeg をインストールしてください。')
    p = subprocess.run([FFPROBE, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)], capture_output=True, timeout=30, **FLAGS)
    if p.returncode:
        raise ValueError('この素材を解析できません。対応する動画または音声ファイルを選択してください。')
    info = json.loads(p.stdout)
    video = next((s for s in info['streams'] if s['codec_type'] == 'video'), None)
    audio = any(s['codec_type'] == 'audio' for s in info['streams'])
    duration = float(info.get('format', {}).get('duration', 0))
    if not math.isfinite(duration) or duration <= 0 or not (video or audio):
        raise ValueError('長さのある動画・音声素材が必要です。静止画は未対応です。')
    return {'duration': duration, 'width': video['width'] if video else 0, 'height': video['height'] if video else 0, 'audio': audio, 'kind': 'video' if video else 'audio'}


def job(kind, work):
    jid = uuid.uuid4().hex
    entry = {'id': jid, 'kind': kind, 'status': 'queued', 'progress': 0}
    JOBS[jid] = entry
    def run():
        entry['status'] = 'running'
        try:
            result = work(entry)
            entry.update(status='done', progress=1, result=result)
        except Exception as e:
            entry.update(status='error', error=str(e))
    POOL.submit(run)
    return jid


def ffmpeg(args, entry, duration):
    if not FFMPEG:
        raise ValueError('FFmpeg が見つかりません。')
    log = DATA / 'jobs' / (entry['id'] + '.log')
    with log.open('w', encoding='utf-8') as err:
        p = subprocess.Popen([FFMPEG, '-hide_banner', '-nostdin', '-y', '-threads', '2', '-filter_complex_threads', '1', '-progress', 'pipe:1', '-nostats', *args], stdout=subprocess.PIPE, stderr=err, text=True, **FLAGS)
        for line in p.stdout:
            if line.startswith('out_time_us='):
                try:
                    entry['progress'] = min(.99, int(line.strip().split('=')[1]) / 1e6 / duration)
                except ValueError:
                    pass
        p.stdout.close()
        if p.wait():
            raise ValueError('変換に失敗しました。' + log.read_text(encoding='utf-8', errors='replace')[-1400:])


def make_proxy(asset):
    if asset['kind'] != 'video':
        return None
    def work(entry):
        target = DATA / 'proxy' / (asset['id'] + '.mp4')
        ffmpeg(['-i', str(DATA / 'media' / asset['file']), '-vf', "scale=w='min(960,iw)':h=-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(target)], entry, asset['duration'])
        with LOCK:
            asset['proxy'] = '/files/proxy/' + target.name
            atomic_json(DATA / 'assets.json', ASSETS)
        return asset['proxy']
    return job('プロキシ生成 · ' + asset['name'], work)


def number(obj, key, default, low, high):
    value = obj.get(key, default)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f'{key} は数値で指定してください。')
    n = float(value)
    if not math.isfinite(n) or not low <= n <= high:
        raise ValueError(f'{key} の値が範囲外です。')
    return n


PARAM_BOUNDS = {'x':(-7680,7680),'y':(-4320,4320),'z':(-1500,1500),
                'scale':(1,800),'rotation':(-3600,3600),'rotationX':(-3600,3600),'rotationY':(-3600,3600),'opacity':(0,100)}


def validate_project(p):
    if not isinstance(p, dict) or p.get('version') not in (1,2) or not isinstance(p.get('clips'), list) or len(p['clips']) > 100:
        raise ValueError('対応していないプロジェクト形式です（最大100クリップ）。')
    if not isinstance(p.get('name'), str) or len(p['name']) > 200:
        raise ValueError('プロジェクト名は200文字以内で指定してください。')
    tracks = number(p, 'trackCount', 6 if p['version']==2 else 4, 1, 128)
    if tracks != int(tracks): raise ValueError('レイヤー数が不正です。')
    from studio_output import output_size
    output_size({'quality':'custom','width':p.get('width',3840),'height':p.get('height',2160)})
    validate_eq(p.get('masterEq',{}))
    known = {a['id']: a for a in ASSETS}
    ids = set()
    for c in p['clips']:
        required = {'id','asset','start','duration','sourceIn','track','x','y','z','scale','rotation','opacity','volume','effects'}
        if not isinstance(c, dict) or not required.issubset(c) or not isinstance(c['id'], str) or not c['id'] or c['id'] in ids:
            raise ValueError('クリップのデータが不正です。')
        ids.add(c['id'])
        kind = c.get('kind','media')
        if kind not in ('media','shape','text','camera','mask'):
            raise ValueError('素材の種類が不正です。')
        if kind=='media' and c.get('asset') not in known:
            raise ValueError('素材が見つかりません。素材フォルダーを含めて元のPCから移してください。')
        number(c, 'start', 0, 0, 86400)
        length = number(c, 'duration', 1, 1 / 60, 86400)
        source = number(c, 'sourceIn', 0, 0, 86400)
        if kind=='media' and source + length > known[c['asset']]['duration'] + .05:
            raise ValueError('クリップが元の素材の長さを超えています。')
        for key, bounds in PARAM_BOUNDS.items():
            number(c,key,100 if key in ('scale','opacity') else 0,*bounds)
        number(c,'volume',100,0,100)
        number(c,'track',0,0,tracks-1)
        if c['track'] != int(c['track']): raise ValueError('レイヤー番号が不正です。')
        validate_effects(c.get('effects', {}))
        validate_eq(c.get('eq',{}))
        keys=c.get('keys',{})
        if not isinstance(keys,dict) or set(keys)-set(PARAM_BOUNDS): raise ValueError('キーフレームのパラメーターが不正です。')
        for prop,points in keys.items():
            if not isinstance(points,list) or len(points)>1000: raise ValueError('キーフレームは1項目1000点までです。')
            previous=-float('inf')
            for point in points:
                if not isinstance(point,dict): raise ValueError('キーフレームが不正です。')
                t=number(point,'time',0,-86400,86400)
                number(point,'value',0,*PARAM_BOUNDS[prop])
                if t<=previous or point.get('easing','linear') not in ('linear','smooth','hold','bezier'):
                    raise ValueError('キーフレームの時刻または補間が不正です。')
                if 'curve' in point:
                    curve=point['curve']
                    if (not isinstance(curve,list) or len(curve)!=4 or
                        any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1 for v in curve)):
                        raise ValueError('曲線の制御点は0〜1の数値4つで指定してください。')
                previous=t
        if kind in ('shape','text','mask'):
            import re
            if not isinstance(c.get('color'),str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',c['color']): raise ValueError('色が不正です。')
            number(c,'width',1200,1,3840);number(c,'height',700,1,2160)
            if c.get('shape','rectangle') not in ('rectangle','circle','triangle','star','ellipse','diamond','hexagon','arrow','heart','ring','line','grid','checker','gradient'): raise ValueError('図形が不正です。')
        if kind=='text':
            if not isinstance(c.get('text'),str) or len(c['text'])>5000: raise ValueError('テキストは5000文字以内です。')
            number(c,'fontSize',180,8,800)
            if c.get('align','center') not in ('left','center','right'): raise ValueError('文字揃えが不正です。')
        shader=c.get('shader')
        if shader is not None:
            if not isinstance(shader,dict) or not isinstance(shader.get('code'),str) or len(shader['code'])>32000 or not isinstance(shader.get('enabled'),bool):
                raise ValueError('シェーダーの形式が不正です（最大32000文字）。')
            if kind in ('camera','mask'): raise ValueError('カメラ・クリッピング素材にシェーダーは適用できません。')
        number(c,'shaderOffset',0,-86400,86400)
    for c in p['clips']:
        if c.get('kind')=='mask' and c.get('maskTarget'):
            target=next((v for v in p['clips'] if v['id']==c['maskTarget']),None)
            if target is None or target.get('kind') in ('camera','mask') or target['track']>=c['track']:
                raise ValueError('クリッピングの対象は下位レイヤーの映像・図形・テキストにしてください。')
    return p


def validate_effects(effects):
    if not isinstance(effects, dict) or set(effects) - {'brightness','contrast','saturation'}:
        raise ValueError('エフェクトの形式が不正です。')
    for key, lo, hi, default in [('brightness',-.5,.5,0), ('contrast',0,2,1), ('saturation',0,3,1)]:
        number(effects,key,default,lo,hi)


def export_project(project, quality):
    validate_project(project)
    if not project['clips']:
        raise ValueError('タイムラインに素材を追加してください。')
    if project['version']==2:
        raise ValueError('このプロジェクトは画面の共通レンダラーから書き出してください。')
    w,h = (3840,2160) if quality == '4k' else (1920,1080)
    fps = 30
    clips = sorted(project['clips'], key=lambda c: (c.get('track',0), c['start']))
    duration = max(c['start'] + c['duration'] for c in clips)
    assets = {a['id']: a for a in ASSETS}
    def work(entry):
        args = []
        for c in clips:
            args += ['-ss',str(c.get('sourceIn',0)), '-t',str(c['duration']), '-i',str(DATA / 'media' / assets[c['asset']]['file'])]
        filters = [f'color=c=black:s={w}x{h}:r={fps}:d={duration}[base]']
        base = 'base'
        audio = []
        for i,c in enumerate(clips):
            a = assets[c['asset']]
            start = c['start']
            if a['kind'] == 'video':
                factor = c.get('scale',100)/100 * 2000/(2000-c.get('z',0))
                # Fit media within the project frame; z changes projected size.
                fit = min(w/a['width'], h/a['height']) * factor
                cw,ch = max(2,round(a['width']*fit/2)*2),max(2,round(a['height']*fit/2)*2)
                if cw > 15360 or ch > 8640:
                    raise ValueError('奥行き・拡大率が大きすぎます。縮小して再試行してください。')
                e=c.get('effects',{})
                angle=c.get('rotation',0)*math.pi/180
                filters.append(f"[{i}:v]setpts=PTS-STARTPTS,fps={fps},scale={cw}:{ch},setsar=1,eq=brightness={e.get('brightness',0)}:contrast={e.get('contrast',1)}:saturation={e.get('saturation',1)},format=rgba,colorchannelmixer=aa={c.get('opacity',100)/100},rotate={angle}:ow=rotw({angle}):oh=roth({angle}):c=none,setpts=PTS+{start}/TB[v{i}]")
                x=c.get('x',0)*w/3840
                y=c.get('y',0)*h/2160
                out=f'b{i}'
                filters.append(f"[{base}][v{i}]overlay=x=(W-w)/2+{x}:y=(H-h)/2+{y}:enable='gte(t,{start})*lt(t,{start+c['duration']})':eof_action=pass:repeatlast=0[{out}]")
                base=out
            if a['audio']:
                delay=round(start*1000)
                filters.append(f"[{i}:a]asetpts=PTS-STARTPTS,aresample=48000,volume={c.get('volume',100)/100},adelay={delay}:all=1[a{i}]")
                audio.append(f'[a{i}]')
        if audio:
            filters.append(''.join(audio)+f'amix=inputs={len(audio)}:normalize=0,alimiter=limit=0.95[aout]')
        script=DATA/'jobs'/(entry['id']+'.ffgraph')
        script.write_text(';\n'.join(filters),encoding='utf-8')
        target=DATA/'exports'/(entry['id']+'.mp4')
        args += ['-filter_complex_script',str(script),'-map',f'[{base}]']
        if audio:
            args += ['-map','[aout]','-c:a','aac','-b:a','192k']
        args += ['-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-t',str(duration),'-movflags','+faststart',str(target)]
        ffmpeg(args,entry,duration)
        return '/files/exports/'+target.name
    return job('MP4 書き出し · '+quality,work)


from studio_features import StudioFeatures
FEATURES = StudioFeatures(DATA, ASSETS, JOBS, POOL, LOCK, FFMPEG, FLAGS, validate_project, atomic_json, ffmpeg, job)
WAVEFORMS = Waveforms(DATA, FFMPEG, FLAGS, POOL)


import importlib.util
import traceback

API_GET_ROUTES = {}
API_POST_ROUTES = {}
PLUGIN_CONTEXT = {
    'DATA': DATA,
    'ASSETS': ASSETS,
    'JOBS': JOBS,
    'FEATURES': FEATURES,
    'WAVEFORMS': WAVEFORMS,
    'API_GET': API_GET_ROUTES,
    'API_POST': API_POST_ROUTES,
    'LOCK': LOCK
}

for py_file in (DATA / 'plugins').glob('*.py'):
    try:
        spec = importlib.util.spec_from_file_location(py_file.stem, py_file)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        if hasattr(mod, 'setup'):
            mod.setup(PLUGIN_CONTEXT)
    except Exception as e:
        print(f"Plugin {py_file.name} failed to load: {traceback.format_exc()}")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_json(self, value, status=200):
        data=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(data)

    def authorized_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}

    def do_GET(self):
        if not self.authorized_host():
            return self.send_json({'error':'アクセスできません。'},403)
        path=unquote(urlparse(self.path).path)
        if path in API_GET_ROUTES:
            return self.send_json(API_GET_ROUTES[path](self))
        if path.startswith('/api/waveform/'):
            asset=next((a for a in ASSETS if a['id']==path.rsplit('/',1)[-1]),None)
            return self.send_json(WAVEFORMS.get(asset) if asset else {'error':'素材がありません。'})
        if path=='/api/preferences':
            return self.send_json(read_json(DATA/'preferences.json',{'theme':'dark','language':'ja'}))
        if path=='/api/export-settings':
            return self.send_json(read_json(DATA/'export-settings.json',{}))
        if path=='/api/encoders':
            from studio_encoding import capabilities
            return self.send_json(capabilities(FFMPEG))
        if path=='/api/projects':
            return self.send_json(FEATURES.list_projects())
        if path=='/api/state':
            with LOCK:
                return self.send_json({'token':TOKEN,'assets':ASSETS,'jobs':list(JOBS.values()),'plugins':BUILTINS+[read_json(p,{}) for p in (DATA/'plugins').glob('*.json')], 'project':read_json(DATA/'project.json',None), 'ffmpeg':bool(FFMPEG and FFPROBE)})
        if path.startswith('/files/'):
            root=DATA
            file=(DATA/path.removeprefix('/files/')).resolve()
            if not file.is_relative_to(root) or file.parent.name not in {'media','proxy','exports'}:
                return self.send_json({'error':'見つかりません。'},404)
        else:
            root=ROOT/'preview'
            file=(root/(path.lstrip('/') or 'index.html')).resolve()
            if not file.is_relative_to(root):
                return self.send_json({'error':'見つかりません。'},404)
        if not file.is_file():
            return self.send_json({'error':'見つかりません。'},404)
        size=file.stat().st_size
        start,end=0,size-1
        partial=self.headers.get('Range','')
        if partial:
            try:
                lo,hi=partial.removeprefix('bytes=').split('-')
                start=int(lo) if lo else max(0,size-int(hi))
                end=min(int(hi),size-1) if hi and lo else size-1
                if start>end or start<0: raise ValueError()
            except ValueError:
                self.send_response(416); self.send_header('Content-Range',f'bytes */{size}'); self.end_headers(); return
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type',mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(end-start+1))
        self.send_header('X-Content-Type-Options','nosniff')
        if partial: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        try:
            with file.open('rb') as f:
                f.seek(start)
                remaining=end-start+1
                while remaining>0:
                    chunk=f.read(min(1024*1024,remaining))
                    if not chunk: break
                    self.wfile.write(chunk); remaining-=len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_POST(self):
        if not self.authorized_host() or self.headers.get('X-Lattice-Token')!=TOKEN:
            return self.send_json({'error':'アプリを再読み込みしてください。'},403)
        path=urlparse(self.path).path
        try:
            if path in API_POST_ROUTES:
                size = int(self.headers.get('Content-Length', '0'))
                return self.send_json(API_POST_ROUTES[path](self, self.rfile.read(size) if size else b''))
            size=int(self.headers.get('Content-Length','0'))
            if path.startswith('/api/render/frame/'):
                return self.send_json(FEATURES.frame(path, self.rfile, size))
            if path=='/api/import':
                if size<=0 or size>64*1024**3: raise ValueError('素材サイズは64GB以下にしてください。')
                name=unquote(self.headers.get('X-Filename','素材.mp4')).replace('\\','/').split('/')[-1]
                aid=uuid.uuid4().hex
                suffix=Path(name).suffix.lower()
                if suffix not in {'.mp4','.mov','.mkv','.webm','.avi','.m4v','.wav','.mp3','.aac','.m4a','.flac','.ogg'}: raise ValueError('対応していない拡張子です。')
                file=DATA/'media'/(aid+suffix)
                try:
                    with file.open('wb') as f:
                        remaining=size
                        while remaining:
                            chunk=self.rfile.read(min(1024*1024,remaining))
                            if not chunk: raise ValueError('読み込みが中断されました。')
                            f.write(chunk); remaining-=len(chunk)
                    asset={'id':aid,'name':name,'file':file.name,'url':'/files/media/'+file.name,'proxy':None,**probe(file)}
                except Exception:
                    file.unlink(missing_ok=True); raise
                with LOCK:
                    ASSETS.append(asset); atomic_json(DATA/'assets.json',ASSETS)
                jid=make_proxy(asset)
                return self.send_json({'asset':asset,'job':jid})
            if path=='/api/plugin/python':
                if size>4*1024*1024: raise ValueError('データが大きすぎます。')
                name = unquote(self.headers.get('X-Filename', 'plugin.py')).replace('\\', '/').split('/')[-1]
                if not name.endswith('.py'): raise ValueError('拡張子が .py ではありません。')
                code = self.rfile.read(size)
                pid = uuid.uuid4().hex
                (DATA / 'plugins' / f"{pid}.py").write_bytes(code)
                return self.send_json({'id': pid, 'name': name, 'type': 'python'})
            if size>4*1024*1024: raise ValueError('データが大きすぎます。')
            body=json.loads(self.rfile.read(size))
            if path.startswith('/api/render/') or path.startswith('/api/projects/'):
                return self.send_json(FEATURES.post(path,body))
            if path=='/api/preferences':
                if body.get('theme') not in ('dark','light') or body.get('language') not in ('ja','en'):
                    raise ValueError('表示設定が不正です。')
                with LOCK: atomic_json(DATA/'preferences.json',body)
                return self.send_json({'ok':True})
            if path=='/api/export-settings':
                if (body.get('encoder') not in ('auto','libx264','h264_nvenc','h264_qsv','h264_amf')
                    or body.get('encodingQuality') not in ('fast','balanced','quality')
                    or body.get('quality') not in ('4k','1080p','720p','portrait','square','custom')
                    or not isinstance(body.get('acceleration'),bool)):
                    raise ValueError('書き出し設定が不正です。')
                from studio_output import output_size
                output_size(body)
                if body.get('gpuMode','normal') not in ('normal','maximum'): raise ValueError('GPU設定が不正です。')
                with LOCK: atomic_json(DATA/'export-settings.json',body)
                return self.send_json({'ok':True})
            if path=='/api/project':
                validate_project(body)
                with LOCK: atomic_json(DATA/'project.json',body)
                return self.send_json({'ok':True})
            if path=='/api/export':
                return self.send_json({'job':export_project(body['project'],body.get('quality','1080p'))})
            if path=='/api/plugin':
                from studio_plugins import validate_plugin
                plugin=validate_plugin(body,validate_project,validate_effects)
                plugin['id']=uuid.uuid4().hex
                atomic_json(DATA/'plugins'/(plugin['id']+'.json'),plugin)
                return self.send_json(plugin)
            return self.send_json({'error':'見つかりません。'},404)
        except (ValueError,KeyError,TypeError,subprocess.TimeoutExpired) as e:
            return self.send_json({'error':str(e)},400)
        except Exception:
            return self.send_json({'error':'処理に失敗しました。保存先と空き容量を確認してください。'},500)


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--open', action='store_true', help='ブラウザーを開く')
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Lattice Studio: http://127.0.0.1:{server.server_port}',flush=True)
    if args.open:
        import webbrowser
        webbrowser.open(f'http://127.0.0.1:{server.server_port}')
    server.serve_forever()
