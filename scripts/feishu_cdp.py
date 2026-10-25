#!/usr/bin/env python3
"""CDP helper for the Feishu Chrome instance (port 9222)."""
import json, sys, subprocess, base64, time
import websocket

WS = None

def get_ws():
    global WS
    if WS is None:
        tabs = json.loads(subprocess.check_output(['curl', '-s', 'http://localhost:9222/json']))
        pages=[t for t in tabs if t['type']=='page']
        page = next((t for t in pages if '127.0.0.1:8790' in t['url']), pages[0])
        WS = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30, origin='http://localhost:9222')
    return WS

_id = [0]
def cmd(method, params=None):
    try:
        return _cmd(method, params)
    except Exception:
        global WS
        WS = None
        return _cmd(method, params)

def _cmd(method, params=None):
    ws = get_ws()
    _id[0] += 1
    ws.send(json.dumps({'id': _id[0], 'method': method, 'params': params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == _id[0]:
            if 'error' in msg:
                raise RuntimeError(msg['error'])
            return msg.get('result', {})

def nav(url, wait=4):
    cmd('Page.enable'); cmd('Page.navigate', {'url': url})
    time.sleep(wait)

def eval_js(expr, await_promise=True):
    r = cmd('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': await_promise})
    return r.get('result', {}).get('value')

def shot(path='/tmp/fs.png'):
    r = cmd('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))
    return path

if __name__ == '__main__':
    if sys.argv[1] == 'nav':
        nav(sys.argv[2])
    elif sys.argv[1] == 'eval':
        print(eval_js(sys.argv[2]))
    elif sys.argv[1] == 'shot':
        print(shot(sys.argv[2] if len(sys.argv) > 2 else '/tmp/fs.png'))
