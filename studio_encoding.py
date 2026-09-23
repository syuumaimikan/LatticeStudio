"""Probe real hardware encoding, never advertise an encoder by name alone."""
import functools
import subprocess

ENCODERS = {'h264_nvenc': 'NVIDIA GPU (NVENC)', 'h264_qsv': 'Intel GPU (Quick Sync)',
            'h264_amf': 'AMD GPU (AMF)', 'libx264': 'CPU (x264)'}

@functools.lru_cache(maxsize=4)
def capabilities(ffmpeg):
    result = []
    for encoder, label in ENCODERS.items():
        try:
            p = subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
                'color=size=1920x1080:rate=30', '-frames:v', '1', '-c:v', encoder,
                '-f', 'null', '-'], capture_output=True, timeout=15,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            available = p.returncode == 0
        except (OSError, subprocess.TimeoutExpired, TypeError):
            available = False
        result.append({'id': encoder, 'label': label, 'available': available})
    return result

def options(ffmpeg, body):
    encoder = body.get('encoder', 'auto')
    available = [e['id'] for e in capabilities(ffmpeg) if e['available']]
    if encoder == 'auto':
        encoder = next(iter(available), None)
    if encoder not in available:
        raise ValueError('選択したエンコーダーは使用できません。GPUドライバーまたはCPU設定を確認してください。')
    quality = body.get('encodingQuality', 'balanced')
    if quality not in ('fast', 'balanced', 'quality'):
        raise ValueError('画質設定が不正です。')
    mode=body.get('gpuMode','normal')
    if mode not in ('normal','maximum'): raise ValueError('GPU設定が不正です。')
    if mode=='maximum' and encoder=='libx264': raise ValueError('GPU最大品質にはGPUエンコーダーを選択してください。')
    q = {'fast': 25, 'balanced': 20, 'quality': 16}[quality]
    args = ['-c:v', encoder]
    if encoder == 'libx264':
        args += ['-threads', '2', '-preset', {'fast':'veryfast','balanced':'fast','quality':'medium'}[quality], '-crf', str(q)]
    elif encoder == 'h264_nvenc':
        args += ['-preset', {'fast':'p1','balanced':'p4','quality':'p6'}[quality], '-rc', 'vbr', '-cq', str(q), '-b:v', '0']
    elif encoder == 'h264_qsv':
        args += ['-global_quality', str(q)]
    else:
        args += ['-rc', 'cqp', '-qp_i', str(q), '-qp_p', str(q)]
    if mode=='maximum':
        if encoder=='h264_nvenc':
            args[args.index('-preset')+1]='p7'
            args += ['-multipass','fullres','-rc-lookahead','32','-spatial-aq','1','-temporal-aq','1']
        elif encoder=='h264_qsv':args += ['-preset','veryslow']
        elif encoder=='h264_amf':args += ['-quality','quality']
    return encoder, args
