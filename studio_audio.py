"""Bounded waveform extraction and shared three-band EQ validation."""
import array
import json
import math
import subprocess
import threading

def validate_eq(eq):
    if not isinstance(eq,dict) or set(eq)-{'low','mid','high','enabled'}:
        raise ValueError('EQの設定が不正です。')
    if 'enabled' in eq and not isinstance(eq['enabled'],bool):
        raise ValueError('EQの有効設定が不正です。')
    for key in ('low','mid','high'):
        v=eq.get(key,0)
        if isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v) or not -18<=v<=18:
            raise ValueError('EQは−18〜18 dBで指定してください。')

def eq_filter(eq):
    validate_eq(eq)
    if eq.get('enabled',True) is False: return 'anull'
    return ','.join(f'equalizer=f={freq}:t=q:w=0.70710678:g={eq.get(band,0)}'
                    for band,freq in [('low',120),('mid',1000),('high',8000)])

class Waveforms:
    def __init__(self,data,ffmpeg,flags,pool):
        self.root=data/'waveforms';self.root.mkdir(exist_ok=True)
        self.data,self.ffmpeg,self.flags,self.pool=data,ffmpeg,flags,pool
        self.pending=set();self.errors={};self.lock=threading.Lock()
    def get(self,asset):
        path=self.root/(asset['id']+'.json')
        if path.exists():return json.loads(path.read_text(encoding='utf-8'))
        if not asset.get('audio'):return {'peaks':[]}
        with self.lock:
            if asset['id'] in self.errors:return {'error':self.errors[asset['id']]}
            if asset['id'] not in self.pending:
                self.pending.add(asset['id']);self.pool.submit(self.build,asset,path)
        return {'pending':True}
    def build(self,asset,path):
        process=None
        try:
            process=subprocess.Popen([self.ffmpeg,'-v','error','-nostdin','-i',str(self.data/'media'/asset['file']),
                '-vn','-ac','1','-ar','8000','-f','s16le','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,**self.flags)
            bucket=max(1,math.ceil(asset['duration']*8000/1600));peaks=[];maximum=0;count=0
            while data:=process.stdout.read(8192):
                values=array.array('h');values.frombytes(data)
                for value in values:
                    maximum=max(maximum,abs(value));count+=1
                    if count>=bucket:peaks.append(round(maximum/32768,4));maximum=count=0
            if count:peaks.append(round(maximum/32768,4))
            if process.wait()!=0:raise ValueError('波形を生成できません。')
            path.write_text(json.dumps({'peaks':peaks,'duration':asset['duration']}),encoding='utf-8')
        except Exception as e:self.errors[asset['id']]=str(e)
        finally:
            if process and process.poll() is None:process.kill();process.wait()
            if process and process.stdout:process.stdout.close()
            with self.lock:self.pending.discard(asset['id'])
