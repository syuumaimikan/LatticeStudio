"""Integration checks with real FFmpeg output and an isolated media directory."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

class StudioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='lattice-tests-')
        os.environ['LATTICE_DATA'] = cls.temp.name
        spec = importlib.util.spec_from_file_location('studio', Path(__file__).parents[1] / 'studio_server.py')
        cls.s = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.s)
        cls.server = cls.s.ThreadingHTTPServer(('127.0.0.1',0),cls.s.Handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.fixture = Path(cls.temp.name)/'日本語の素材.mp4'
        subprocess.run([cls.s.FFMPEG,'-v','error','-y','-f','lavfi','-i','testsrc2=size=3840x2160:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','0.6','-c:v','libx264','-preset','ultrafast','-crf','35','-c:a','aac',str(cls.fixture)],check=True,**cls.s.FLAGS)
        req = urllib.request.Request(cls.base+'/api/import',data=cls.fixture.read_bytes(),headers={'X-Lattice-Token':cls.s.TOKEN,'X-Filename':urllib.parse.quote(cls.fixture.name)},method='POST')
        cls.imported = json.load(urllib.request.urlopen(req))
        cls.asset = cls.imported['asset']
        cls.project = {'version':1,'name':'日本語の検証','clips':[{'id':'clip1','asset':cls.asset['id'],'start':0,'duration':0.5,'sourceIn':0.1,'track':0,'x':100,'y':-40,'z':-100,'scale':70,'rotation':8,'opacity':85,'volume':40,'effects':{'contrast':1.1,'saturation':0.7}}]}

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.s.POOL.shutdown(wait=True)
        cls.temp.cleanup()
        os.environ.pop('LATTICE_DATA',None)

    def post(self,path,data,token=None):
        req=urllib.request.Request(self.base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Lattice-Token':token or self.s.TOKEN},method='POST')
        return json.load(urllib.request.urlopen(req))

    def wait_job(self,jid):
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            j=self.s.JOBS[jid]
            if j['status'] in ('done','error'):
                self.assertEqual(j['status'],'done',j.get('error'))
                return j
            time.sleep(.15)
        self.fail('FFmpeg job timed out')

    def test_01_import_proxy_and_range(self):
        self.assertEqual(self.asset['name'],'日本語の素材.mp4')
        self.assertEqual(self.asset['width'],3840)
        job=self.wait_job(self.imported['job'])
        info=self.s.probe(self.s.DATA/'proxy'/Path(job['result']).name)
        self.assertLessEqual(info['width'],960)
        request=urllib.request.Request(self.base+self.asset['url'],headers={'Range':'bytes=0-31'})
        response=urllib.request.urlopen(request)
        self.assertEqual(response.status,206)
        self.assertEqual(len(response.read()),32)

    def test_02_project_roundtrip(self):
        self.post('/api/project',self.project)
        state=json.load(urllib.request.urlopen(self.base+'/api/state'))
        self.assertEqual(state['project'],self.project)

    def test_03_plugin(self):
        p=self.post('/api/plugin',{'version':1,'name':'独自カラー','effects':{'saturation':0.3}})
        self.assertEqual(p['effects']['saturation'],0.3)
        with self.assertRaises(urllib.error.HTTPError) as err:
            self.post('/api/plugin',{'version':1,'name':'不正','effects':{'command':'anything'}})
        self.assertEqual(err.exception.code,400)
        err.exception.close()

    def test_04_real_4k_export(self):
        jid=self.post('/api/export',{'project':self.project,'quality':'4k'})['job']
        j=self.wait_job(jid)
        info=self.s.probe(self.s.DATA/'exports'/Path(j['result']).name)
        self.assertEqual((info['width'],info['height']),(3840,2160))
        self.assertTrue(info['audio'])
        self.assertAlmostEqual(info['duration'],.5,delta=.1)

    def test_05_reject_bad_project_and_token(self):
        for mutate in [lambda p:p['clips'][0].update(duration=99),lambda p:p['clips'][0].update(x=float('nan')),lambda p:p['clips'][0].update(track=1.5),lambda p:p['clips'][0].update(asset='missing'),lambda p:p['clips'].append(copy.deepcopy(p['clips'][0]))]:
            p=copy.deepcopy(self.project);mutate(p)
            with self.assertRaises(urllib.error.HTTPError) as err:self.post('/api/project',p)
            self.assertEqual(err.exception.code,400)
            err.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as err:self.post('/api/project',self.project,'wrong')
        self.assertEqual(err.exception.code,403)
        err.exception.close()

    def test_06_delayed_layers_and_audio(self):
        p=copy.deepcopy(self.project)
        top=copy.deepcopy(p['clips'][0]);top.update(id='clip2',start=.3,sourceIn=0,duration=.3,track=1,scale=35)
        p['clips'].append(top)
        j=self.wait_job(self.post('/api/export',{'project':p,'quality':'1080p'})['job'])
        info=self.s.probe(self.s.DATA/'exports'/Path(j['result']).name)
        self.assertAlmostEqual(info['duration'],.6,delta=.1)
        self.assertEqual(info['width'],1920)

    def builtin_project(self):
        c = copy.deepcopy(self.project['clips'][0])
        c.update(kind='shape',asset=None,color='#00ff00',shape='rectangle',width=1200,height=700,
                 keys={'scale':[{'time':0,'value':100,'easing':'smooth'},{'time':0.5,'value':200,'easing':'linear'}]},
                 shader={'enabled':True,'code':'vec4 effect(vec2 uv,vec4 color){return color;}'} )
        return {'version':2,'name':'図形とシェーダー','trackCount':6,'clips':[c]}

    def test_07_named_project_retains_animation_and_shader(self):
        p=self.builtin_project()
        saved=self.post('/api/projects/save',{'project':p})
        loaded=self.post('/api/projects/load',saved)
        self.assertEqual(loaded,p)
        listing=json.load(urllib.request.urlopen(self.base+'/api/projects'))
        self.assertIn(saved['id'],[item['id'] for item in listing])

    def test_08_invalid_keys_and_mask_targets(self):
        for change in [lambda c:c.update(keys={'scale':[{'time':1,'value':1},{'time':0,'value':2}]}),
                       lambda c:c.update(keys={'scale':[{'time':0,'value':float('nan')}]}),
                       lambda c:c.update(kind='mask',shader=None,maskTarget='missing'),
                       lambda c:c.update(shader={'enabled':True,'code':3})]:
            p=self.builtin_project();change(p['clips'][0])
            with self.assertRaises(urllib.error.HTTPError) as err:self.post('/api/project',p)
            self.assertEqual(err.exception.code,400);err.exception.close()

    def test_09_render_session_rejects_missing_frames_and_cancels(self):
        p=self.builtin_project();session=self.post('/api/render/start',{'project':p,'quality':'1080p'})
        with self.assertRaises(urllib.error.HTTPError) as err:self.post('/api/render/finish',{'id':session['id']})
        self.assertEqual(err.exception.code,400);err.exception.close()
        self.post('/api/render/cancel',{'id':session['id']})
        self.assertNotIn(session['id'],self.s.FEATURES.sessions)
        self.assertEqual(self.s.JOBS[session['id']]['status'],'cancelled')

    def test_10_raw_gpu_and_cpu_export(self):
        from studio_encoding import capabilities
        encoders = [e['id'] for e in capabilities(self.s.FFMPEG) if e['available']]
        self.assertIn('libx264', encoders)
        for encoder in encoders:
            p = self.builtin_project(); p['clips'][0].update(start=0, duration=2/30)
            session = self.post('/api/render/start', {'project':p,'quality':'4k','encoder':encoder,'pixelFormat':'rgb24'})
            frame = bytes([255,0,0]) * (3840*2160)
            for i in range(2):
                req=urllib.request.Request(self.base+f"/api/render/frame/{session['id']}/{i}",data=frame,
                    headers={'X-Lattice-Token':self.s.TOKEN},method='POST')
                with urllib.request.urlopen(req) as response: self.assertEqual(response.status,200)
            result=self.wait_job(self.post('/api/render/finish',{'id':session['id']})['job'])
            path=self.s.DATA/'exports'/Path(result['result']).name
            info=self.s.probe(path);self.assertEqual((info['width'],info['height']),(3840,2160))
            rgb=subprocess.check_output([self.s.FFMPEG,'-v','error','-i',str(path),'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-'],**self.s.FLAGS)
            self.assertGreater(rgb[0],240);self.assertLess(rgb[1],15);self.assertLess(rgb[2],15)

    def test_11_export_preferences_roundtrip(self):
        settings={'encoder':'libx264','encodingQuality':'quality','quality':'4k','acceleration':True}
        self.post('/api/export-settings',settings)
        with urllib.request.urlopen(self.base+'/api/export-settings') as response:
            self.assertEqual(json.load(response),settings)
        settings['encoder']='invalid'
        with self.assertRaises(urllib.error.HTTPError) as err: self.post('/api/export-settings',settings)
        self.assertEqual(err.exception.code,400);err.exception.close()

    def test_12_curve_and_custom_size(self):
        from studio_output import output_size
        self.assertEqual(output_size({'quality':'portrait'}),(1080,1920))
        for w,h in [(101,200),(641,360),(4096,4096),(float('nan'),360)]:
            with self.assertRaises(ValueError): output_size({'quality':'custom','width':w,'height':h})
        p=self.builtin_project();p['clips'][0]['keys']['scale'][0].update(easing='bezier',curve=[.42,0,1,1])
        self.post('/api/project',p)
        p['clips'][0]['keys']['scale'][0]['curve']=[0,float('nan'),1,1]
        with self.assertRaises(urllib.error.HTTPError) as err:self.post('/api/project',p)
        err.exception.close()
        p=self.builtin_project();p['clips'][0].update(duration=1/30)
        session=self.post('/api/render/start',{'project':p,'quality':'custom','width':640,'height':360,'encoder':'libx264','pixelFormat':'rgb24'})
        req=urllib.request.Request(self.base+f"/api/render/frame/{session['id']}/0",data=bytes([0,255,0])*(640*360),headers={'X-Lattice-Token':self.s.TOKEN},method='POST')
        with urllib.request.urlopen(req) as response:self.assertEqual(response.status,200)
        result=self.wait_job(self.post('/api/render/finish',{'id':session['id']})['job'])
        info=self.s.probe(self.s.DATA/'exports'/Path(result['result']).name)
        self.assertEqual((info['width'],info['height']),(640,360))

    def test_13_settings_dimensions_eq_and_waveform(self):
        self.post('/api/preferences',{'theme':'light','language':'en'})
        with urllib.request.urlopen(self.base+'/api/preferences') as response:self.assertEqual(json.load(response)['language'],'en')
        p=self.builtin_project();p.update(width=1080,height=1920,trackCount=128,masterEq={'low':3,'mid':-2,'high':1})
        p['clips'][0].update(track=127,shape='heart',eq={'low':-6})
        self.post('/api/project',p)
        for bad in [float('nan'),19,'6',True]:
            p['masterEq']={'mid':bad}
            with self.assertRaises(urllib.error.HTTPError) as err:self.post('/api/project',p)
            err.exception.close()
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            with urllib.request.urlopen(self.base+'/api/waveform/'+self.asset['id']) as response: waveform=json.load(response)
            if not waveform.get('pending'):break
            time.sleep(.1)
        self.assertTrue(waveform.get('peaks'));self.assertGreater(max(waveform['peaks']),.01)
        self.assertLess(len(waveform['peaks']),2000)

    def test_14_eq_frequency_response(self):
        import array
        from studio_audio import eq_filter
        def level(eq):
            samples=array.array('f');samples.frombytes(subprocess.check_output([self.s.FFMPEG,'-v','error','-f','lavfi','-i','sine=frequency=1000:duration=0.2','-af',eq_filter(eq),'-f','f32le','-'],**self.s.FLAGS))
            return (sum(v*v for v in samples)/len(samples))**.5
        self.assertGreater(level({'mid':12})/level({}),3.8)
        self.assertAlmostEqual(level({'mid':12,'enabled':False})/level({}),1,places=3)

if __name__=='__main__':unittest.main(verbosity=2)
