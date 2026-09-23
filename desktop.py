"""Windows WebView2 desktop host. User data lives outside the executable."""
import os
import sys
import json
import shutil
import threading
from pathlib import Path

def main():
    import ctypes
    ctypes.windll.kernel32.CreateMutexW.restype = ctypes.c_void_p
    ctypes.windll.kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, 'Local\\LatticeStudioDesktop')
    if ctypes.windll.kernel32.GetLastError() == 183:
        ctypes.windll.user32.MessageBoxW(0, 'Lattice Studio は既に起動しています。', 'Lattice Studio', 0)
        return
    home = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'LatticeStudio'
    home.mkdir(parents=True, exist_ok=True)
    # Inherit the current workspace only once; never have two servers write it.
    data = Path(os.environ.get('LATTICE_DATA', str(home / 'workspace')))
    base = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
    source = next((p / '.lattice-local' / 'qa-session' for p in [base, *list(base.parents)[:3]]
                   if (p / '.lattice-local' / 'qa-session' / 'project.json').exists()), None)
    if not data.exists():
        staging = data.with_name(data.name + '-importing')
        if source:
            shutil.copytree(source, staging, dirs_exist_ok=True, ignore=shutil.ignore_patterns('jobs', 'exports'))
            staging.rename(data)
        else:
            data.mkdir(parents=True)
    os.environ['LATTICE_DATA'] = str(data)
    import studio_server as server
    import webview
    http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    threading.Thread(target=http.serve_forever, daemon=True).start()
    webview.settings['ALLOW_DOWNLOADS'] = True
    child_windows = {}
    class PanelAPI:
        def close_panel(self, session, kind):
            child=child_windows.get((session,kind))
            if child: child.destroy()
            return True
        def open_panel(self, session, kind):
            import re
            if not isinstance(session,str) or not re.fullmatch(r'[a-f0-9-]{36}',session) or kind not in ('media','inspector','plugins'):
                raise ValueError('Invalid panel')
            key=(session,kind)
            if key in child_windows:
                child_windows[key].show()
                return True
            child=webview.create_window('Lattice Studio — '+kind,f'http://127.0.0.1:{http.server_port}/panel.html?session={session}&panel={kind}',width=480,height=760,min_size=(320,400),background_color='#171b1d',js_api=PanelAPI())
            child_windows[key]=child
            child.events.closed += lambda: child_windows.pop(key,None)
            return True
    window = webview.create_window('Lattice Studio — 動画編集', f'http://127.0.0.1:{http.server_port}',
        width=1440, height=900, min_size=(1100, 700), background_color='#101515', text_select=True, js_api=PanelAPI())
    close_state = {'ready': False, 'saving': False}
    def closing():
        if close_state['ready']:
            return True
        if server.FEATURES.sessions or any(j.get('status') in ('queued', 'running') for j in server.JOBS.values()):
            ctypes.windll.user32.MessageBoxW(0, '処理中です。書き出しを完了または中止してから閉じてください。', 'Lattice Studio', 0)
            return False
        if close_state['saving']:
            return False
        close_state['saving'] = True
        def save_and_close():
            try:
                snapshot = window.evaluate_js('JSON.stringify(project)')
                if snapshot:
                    value = server.validate_project(json.loads(snapshot))
                    with server.LOCK:
                        server.atomic_json(server.DATA / 'project.json', value)
                close_state['ready'] = True
                for child in list(child_windows.values()):
                    child.destroy()
                window.destroy()
            except Exception:
                close_state['saving'] = False
                ctypes.windll.user32.MessageBoxW(0, '保存に失敗しました。保存先を確認してから閉じてください。', 'Lattice Studio', 16)
        threading.Thread(target=save_and_close, daemon=True).start()
        return False
    window.events.closing += closing
    # Optional end-to-end packaged smoke test, with an isolated workspace.
    def smoke():
        import time
        time.sleep(4)
        result = window.evaluate_js("JSON.stringify({title:document.title,wasm:!!PixelEngine.wasm,canvas:!!document.querySelector('#scene'),connection:document.querySelector('#connection').textContent})")
        info = json.loads(result)
        if '--panel-smoke' in sys.argv:
            window.run_js("project={version:2,name:'panel test',trackCount:6,clips:[C.createClip('panel-test','text',0,0)]};selected='panel-test';changed();[...document.querySelectorAll('button')].find(b=>b.textContent==='▥ レイアウト').click();[...document.querySelectorAll('#dialogContent button')].find(b=>b.textContent==='インスペクターを別ウィンドウにする').click();")
            for _ in range(25):
                time.sleep(1)
                if child_windows:
                    child=next(iter(child_windows.values()))
                    if child.evaluate_js("!!document.querySelector('#remote textarea')"):
                        break
            info['childCount']=len(child_windows)
            if child_windows:
                child=next(iter(child_windows.values()))
                child.run_js("const t=document.querySelector('#remote textarea');t.focus();t.value='detached edit';t.dispatchEvent(new Event('input',{bubbles:true}));")
                time.sleep(1)
                child.run_js("{const next=document.querySelector('#remote textarea');next.value='detached edit 2';next.dispatchEvent(new Event('input',{bubbles:true}));}")
                time.sleep(1)
                info['editedText']=window.evaluate_js("project.clips[0].text")
                child.run_js("document.querySelector('#dock').click()")
                time.sleep(2)
                info['docked']=window.evaluate_js("!document.querySelector('.inspector').classList.contains('undocked-panel')")
            (home/'panel-smoke.json').write_text(json.dumps(info,ensure_ascii=False),encoding='utf-8')
            for child in list(child_windows.values()): child.destroy()
            window.destroy()
            return
        info['pluginShaders'] = window.evaluate_js("ExtraPlugins.filter(p=>p.code).map(p=>{renderer.shader.compile(p.code);return p.name;})")
        window.run_js("""(async()=>{
          try {
            project={version:2,name:'デスクトップ書き出し検証',trackCount:6,clips:[C.createClip('smoke','shape',0,0)]};
            Object.assign(project.clips[0],{duration:0.1,color:'#ff0000',width:3840,height:2160});
            changed();await saveLocal();await exportDialog();
            window.__encoderOptions=document.querySelector('[aria-label="エンコーダー"]').options.length;
            await exportMovie('4k',{encoder:'auto',acceleration:true,encodingQuality:'balanced'});
            window.__smokeDone=true;
          }catch(e){window.__smokeError=String(e);window.__smokeDone=true;}
        })()""")
        for _ in range(90):
            if window.evaluate_js('!!window.__smokeDone'):
                break
            time.sleep(1)
        info['options'] = window.evaluate_js('window.__encoderOptions')
        info['error'] = window.evaluate_js("window.__smokeError || document.querySelector('#toast').textContent")
        for _ in range(30):
            if not any(j.get('status') in ('queued', 'running', 'rendering') for j in server.JOBS.values()):
                break
            time.sleep(1)
        info['jobs'] = list(server.JOBS.values())
        (home / 'desktop-smoke.json').write_text(json.dumps(info, ensure_ascii=False), encoding='utf-8')
        window.destroy()
    try:
        webview.start(smoke if '--smoke-test' in sys.argv or '--panel-smoke' in sys.argv else None, gui='edgechromium',
                      private_mode=False, storage_path=str(home / 'webview'))
    finally:
        http.shutdown()
        server.POOL.shutdown(wait=True)
        ctypes.windll.kernel32.CloseHandle(mutex)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        import ctypes
        error = traceback.format_exc()
        path = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'LatticeStudio-error.log'
        path.write_text(error, encoding='utf-8')
        ctypes.windll.user32.MessageBoxW(0, f'起動に失敗しました。\n{path}', 'Lattice Studio', 16)
