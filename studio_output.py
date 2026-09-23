"""Shared limits for custom H.264 output sizes."""
def output_size(body):
    defaults = {'4k':(3840,2160),'1080p':(1920,1080),'720p':(1280,720),'portrait':(1080,1920),'square':(1080,1080)}
    if body.get('quality') == 'custom':
        width,height=body.get('width'),body.get('height')
    else:
        width,height=defaults.get(body.get('quality'),(1920,1080))
    if any(type(n) is not int or n<128 or n>4096 or n%2 for n in (width,height)) or width*height>3840*2160:
        raise ValueError('幅・高さは128〜4096の偶数、総画素数は4K UHD以下で指定してください。')
    if body.get('framing','contain') not in ('contain','cover'):
        raise ValueError('画面の収め方が不正です。')
    return width,height
