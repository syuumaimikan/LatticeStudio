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

ROOT = Path(__file__).resolve().parent
DATA = ROOT / '.lattice-local'
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
    n = float(obj.get(key, default))
    if not math.isfinite(n) or not low <= n <= high:
        raise ValueError(f'{key} の値が範囲外です。')
    return n


def validate_project(p):
    if not isinstance(p, dict) or p.get('version') != 1 or not isinstance(p.get('clips'), list) or len(p['clips']) > 100:
        raise ValueError('対応していないプロジェクト形式です（最大100クリップ）。')
    known = {a['id']: a for a in ASSETS}
    for c in p['clips']:
        if c.get('asset') not in known:
            raise ValueError('素材が見つかりません。元のPCで開くか、素材を再読み込みしてください。')
        start = number(c, 'start', 0, 0, 86400)
        length = number(c, 'duration', 1, 1 / 60, 86400)
        source = number(c, 'sourceIn', 0, 0, 86400)
        if source + length > known[c['asset']]['duration'] + .05:
            raise ValueError('クリップが元の素材の長さを超えています。')
        for key, default, lo, hi in [('x',0,-1920,1920), ('y',0,-1080,1080), ('z',0,-1500,1500), ('scale',100,5,200), ('rotation',0,-180,180), ('opacity',100,0,100), ('volume',100,0,200), ('track',0,0,3)]:
            number(c,key,default,lo,hi)
        validate_effects(c.get('effects', {}))
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
    w,h = (3840,2160) if quality == '4k' else (1920,1080)
    fps = 30
    clips = sorted(project['clips'], key=lambda c: (c.get('track',0), c.get('z',0), c['start']))
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
            size=int(self.headers.get('Content-Length','0'))
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
            if size>4*1024*1024: raise ValueError('データが大きすぎます。')
            body=json.loads(self.rfile.read(size))
            if path=='/api/project':
                validate_project(body)
                with LOCK: atomic_json(DATA/'project.json',body)
                return self.send_json({'ok':True})
            if path=='/api/export':
                return self.send_json({'job':export_project(body['project'],body.get('quality','1080p'))})
            if path=='/api/plugin':
                if body.get('version')!=1 or not isinstance(body.get('name'),str) or not 1<=len(body['name'])<=80: raise ValueError('プラグイン名と version: 1 が必要です。')
                validate_effects(body.get('effects'))
                plugin={'id':uuid.uuid4().hex,'version':1,'name':body['name'],'description':str(body.get('description','ユーザープラグイン'))[:160],'effects':body['effects']}
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
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Lattice Studio: http://127.0.0.1:{server.server_port}',flush=True)
    server.serve_forever()
