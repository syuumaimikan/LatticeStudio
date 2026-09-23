"""Named project snapshots and bounded frame-by-frame browser rendering.

Frames go directly into FFmpeg's stdin; no PNG sequence or whole-movie RAM buffer.
The same browser renderer handles both the viewport and custom GLSL exports.
"""
import copy
import json
import math
import struct
import subprocess
import threading
import time
import uuid
from studio_encoding import options
from studio_output import output_size
from studio_audio import eq_filter


class StudioFeatures:
    def __init__(self, data, assets, jobs, pool, lock, ffmpeg, flags, validate, atomic, encode, job):
        self.data, self.assets, self.jobs = data, assets, jobs
        self.pool, self.lock, self.ffmpeg, self.flags = pool, lock, ffmpeg, flags
        self.validate, self.atomic, self.encode, self.job = validate, atomic, encode, job
        self.sessions = {}
        (data / 'projects').mkdir(exist_ok=True)

    def list_projects(self):
        projects = []
        for path in (self.data / 'projects').glob('*.json'):
            try:
                p = json.loads(path.read_text(encoding='utf-8'))
                projects.append({'id': path.stem, 'name': p['name'], 'clips': len(p['clips']), 'modified': path.stat().st_mtime})
            except (ValueError, KeyError):
                continue
        return sorted(projects, key=lambda p: p['modified'], reverse=True)

    @staticmethod
    def identifier(value):
        if not isinstance(value, str) or len(value) != 32 or any(c not in '0123456789abcdef' for c in value):
            raise ValueError('識別子が不正です。')
        return value

    def post(self, path, body):
        if path == '/api/projects/save':
            p = self.validate(body['project'])
            pid = uuid.uuid4().hex
            with self.lock:
                self.atomic(self.data / 'projects' / (pid + '.json'), p)
            return {'id': pid}
        if path == '/api/projects/load':
            pid = self.identifier(body.get('id'))
            path = self.data / 'projects' / (pid + '.json')
            if not path.exists():
                raise ValueError('保存したプロジェクトが見つかりません。')
            return self.validate(json.loads(path.read_text(encoding='utf-8')))
        if path == '/api/render/start':
            return self.start(body)
        if path == '/api/render/cancel':
            sid = self.identifier(body.get('id'))
            session = self.sessions.get(sid)
            if session:
                with session['lock']:
                    self.close_session(sid, session, cancel=True)
            return {'ok': True}
        if path == '/api/render/finish':
            return self.finish(self.identifier(body.get('id')))
        raise ValueError('対応していない操作です。')

    def close_session(self, sid, s, cancel=False):
        if s.get('timer'):
            s['timer'].cancel()
        p = s['process']
        if cancel and p.poll() is None:
            p.terminate()
        try:
            if not p.stdin.closed:
                p.stdin.close()
            p.wait(timeout=30)
        except (OSError, subprocess.TimeoutExpired):
            p.kill(); p.wait()
        s['log'].close()
        self.sessions.pop(sid, None)
        if cancel:
            self.jobs[sid].update(status='cancelled')
            s['video'].unlink(missing_ok=True)

    def start(self, body):
        project = copy.deepcopy(self.validate(body['project']))
        if not project['clips']:
            raise ValueError('素材を配置してください。')
        if not self.ffmpeg:
            raise ValueError('FFmpeg が見つかりません。')
        encoder, encoder_args = options(self.ffmpeg, body)
        pixel_format = body.get('pixelFormat', 'jpeg')
        if pixel_format not in ('jpeg', 'rgb24'):
            raise ValueError('画素形式が不正です。')
        with self.lock:
            for sid, s in list(self.sessions.items()):
                if time.monotonic() - s['updated'] > 300:
                    with s['lock']:
                        self.close_session(sid, s, cancel=True)
            if len(self.sessions) >= 2:
                raise ValueError('書き出しが進行中です。完了または中止してから再試行してください。')
            width, height = output_size(body)
            duration = max(c['start'] + c['duration'] for c in project['clips'])
            frames = math.ceil(duration * 30 - 1e-8)
            sid = uuid.uuid4().hex
            video = self.data / 'jobs' / (sid + '.mp4')
            log = (self.data / 'jobs' / (sid + '.log')).open('w', encoding='utf-8')
            try:
                input_args = (['-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', f'{width}x{height}']
                              if pixel_format == 'rgb24' else ['-f', 'image2pipe', '-vcodec', 'mjpeg'])
                process = subprocess.Popen([self.ffmpeg, '-v', 'error', '-nostdin', '-y',
                    *input_args, '-framerate', '30', '-i', 'pipe:0', '-an', *encoder_args,
                    '-pix_fmt', 'yuv420p', '-color_range', 'tv', str(video)], stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL, stderr=log, **self.flags)
            except Exception:
                log.close(); raise
            self.sessions[sid] = {'process': process, 'log': log, 'project': project, 'video': video,
                'pixelFormat': pixel_format, 'encoder': encoder, 'width': width, 'height': height, 'frames': frames, 'next': 0, 'duration': frames/30,
                'updated': time.monotonic(), 'lock': threading.RLock()}
            self.jobs[sid] = {'id': sid, 'kind': '共通レンダラー · フレーム描画', 'status': 'rendering', 'progress': 0}
            self.schedule_expiry(sid, self.sessions[sid])
        return {'id': sid, 'frames': frames, 'width': width, 'height': height, 'encoder': encoder, 'pixelFormat': pixel_format}

    def schedule_expiry(self, sid, session):
        def expire():
            with session['lock']:
                if self.sessions.get(sid) is not session:
                    return
                if time.monotonic() - session['updated'] >= 300:
                    self.close_session(sid, session, cancel=True)
                else:
                    self.schedule_expiry(sid, session)
        timer = threading.Timer(300, expire)
        timer.daemon = True
        session['timer'] = timer
        timer.start()

    def frame(self, path, stream, size):
        parts = path.split('/')
        if len(parts) != 6:
            raise ValueError('フレームの送信先が不正です。')
        sid = self.identifier(parts[4])
        try:
            index = int(parts[5])
        except ValueError:
            raise ValueError('フレーム番号が不正です。') from None
        s = self.sessions.get(sid)
        if s is None or not 24 <= size <= 48 * 1024**2:
            raise ValueError('書き出しセッションまたは画像サイズが不正です。')
        with s['lock']:
            if self.sessions.get(sid) is not s or index != s['next'] or index >= s['frames']:
                raise ValueError('フレームの順序が不正です。')
            png = stream.read(size)
            if s['pixelFormat'] == 'rgb24':
                valid = len(png) == size == s['width'] * s['height'] * 3
            else:
                valid = not (len(png) != size or png[:3] != b'\xff\xd8\xff')
            if not valid:
                raise ValueError('フレーム画像の解像度または形式が不正です。')
            try:
                s['process'].stdin.write(png)
                s['process'].stdin.flush()
            except (OSError, BrokenPipeError):
                self.close_session(sid,s,cancel=True)
                raise ValueError('映像エンコードに失敗しました。ジョブログを確認してください。') from None
            s['next'] += 1
            s['updated'] = time.monotonic()
            self.jobs[sid]['progress'] = s['next'] / s['frames']
        return {'frame': index}

    def finish(self, sid):
        s = self.sessions.get(sid)
        if not s:
            raise ValueError('書き出しセッションがありません。')
        with s['lock']:
            if s['next'] != s['frames']:
                raise ValueError('全フレームの受信が終わっていません。')
            self.close_session(sid,s)
            if s['process'].returncode:
                self.jobs[sid].update(status='error', error='フレームのエンコードに失敗しました。')
                raise ValueError('フレームのエンコードに失敗しました。')
            self.jobs[sid].update(status='done',progress=1)
        assets = {a['id']: a for a in self.assets}
        audio = [c for c in s['project']['clips'] if c.get('kind','media') == 'media' and assets[c['asset']]['audio']]
        def mux(entry):
            target = self.data / 'exports' / (entry['id'] + '.mp4')
            args = ['-i', str(s['video'])]
            filters, labels = [], []
            for i,c in enumerate(audio,1):
                args += ['-ss',str(c['sourceIn']),'-t',str(c['duration']),'-i',str(self.data/'media'/assets[c['asset']]['file'])]
                filters.append(f"[{i}:a]asetpts=PTS-STARTPTS,aresample=48000,volume={c['volume']/100},{eq_filter(c.get('eq',{}))},adelay={round(c['start']*1000)}:all=1[a{i}]")
                labels.append(f'[a{i}]')
            if labels:
                filters.append(''.join(labels)+f'amix=inputs={len(labels)}:normalize=0,{eq_filter(s['project'].get('masterEq',{}))},alimiter=limit=0.95,apad[outa]')
                script = self.data/'jobs'/(entry['id']+'.ffgraph')
                script.write_text(';\n'.join(filters),encoding='utf-8')
                args += ['-filter_complex_script',str(script),'-map','0:v','-map','[outa]','-c:a','aac','-b:a','192k']
            else:
                args += ['-map','0:v']
            args += ['-c:v','copy','-t',str(s['duration']),'-movflags','+faststart',str(target)]
            try:
                self.encode(args,entry,s['duration'])
            finally:
                s['video'].unlink(missing_ok=True)
            return '/files/exports/'+target.name
        return {'job':self.job('MP4 書き出し · 音声合成',mux)}
