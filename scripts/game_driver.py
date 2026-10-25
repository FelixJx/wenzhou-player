#!/usr/bin/env python3
"""自动试玩 driver：重开局→排路线→出发→推进到结局，记录关键画面与文案。"""
import sys, time, re, json, subprocess
sys.path.insert(0, '/Volumes/AI_Data/Projects/oucheng-1024/scripts')
from feishu_cdp import eval_js, cmd, shot

def click(label, exact=False):
    if exact:
        return eval_js(f"(()=>{{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='{label}');if(b){{b.click();return 1}}return 0}})()")
    return eval_js(f"(()=>{{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('{label}'));if(b){{b.click();return 1}}return 0}})()")

def text():
    return eval_js("document.body.innerText")

def clock(t=None):
    t = t or text()
    m = re.search(r'(\d{4})/1024', t)
    return int(m.group(1)) if m else -1

def wait_btn(label, timeout=30, exact=False):
    for _ in range(timeout):
        if click(label, exact): return True
        time.sleep(1)
    return False

def bring_game_front():
    import websocket
    tabs = json.loads(subprocess.check_output(['curl', '-s', 'http://localhost:9222/json']))
    pages = [t for t in tabs if t['type'] == 'page']
    g = [t for t in pages if '127.0.0.1:8790' in t['url'] or 'localhost:8790' in t['url']]
    if not g:
        anyp = pages[0]['webSocketDebuggerUrl']
        w0 = websocket.create_connection(anyp, timeout=20, origin='http://localhost:9222')
        w0.send(json.dumps({'id': 1, 'method': 'Target.createTarget', 'params': {'url': 'http://127.0.0.1:8790/play/'}}))
        try: w0.recv()
        except Exception: pass
        w0.close()
        time.sleep(6)
        tabs = json.loads(subprocess.check_output(['curl', '-s', 'http://localhost:9222/json']))
        g = [t for t in tabs if t['type'] == 'page' and ':8790' in t['url']]
    ws = websocket.create_connection(g[0]['webSocketDebuggerUrl'], timeout=20, origin='http://localhost:9222')
    ws.send(json.dumps({'id': 1, 'method': 'Page.bringToFront'}))
    try: ws.recv()
    except Exception: pass
    ws.close()

def main():
    bring_game_front()
    eval_js("location.href='http://127.0.0.1:8790/play/'")
    time.sleep(5)
    shot('play_01_start.png')
    # 烦恼选择
    click('吃不惯') or click('走不动')
    time.sleep(1)
    click('带队出发'); time.sleep(3)
    # 若先要选商圈
    click('五马街 · 公园路') or click('五马街')
    time.sleep(3)
    # 排路线：点 3 个店卡 + 就这么走
    for name in ['瓯宴府', '长人馄饨铺', '大同巷']:
        eval_js(f"(()=>{{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().indexOf('{name}')>=0);if(el){{el.click();return 1}}return 0}})()")
        time.sleep(2)
        click('就这么走') or click('加进手册')
        time.sleep(2)
    ok = wait_btn('出发（', 15)
    click('出发（'); time.sleep(4)
    shot('play_02_depart.png')
    # 主循环：点继续/处理弹窗，最多 6 分钟真实时间
    log = []
    last_clock = -1
    for i in range(120):
        t = text()
        c = clock(t)
        if c != last_clock and c % 100 < 15:
            log.append(f'{c:04d}: ' + ' / '.join(l for l in t.split('\n') if any(k in l for k in ['停站','名人','事件','遇到','✨','游客跑了','回家了']))[:120])
            last_clock = c
        for lbl in ['继续出发','继续','就这么走','带回家','收下']:
            if click(lbl): break
        if '结局' in t or '再见' in t or '收工' in t or '回家' in t[:80]:
            shot('play_end.png'); log.append('END: ' + t[:200].replace('\n','|')); break
        time.sleep(3)
    shot('play_03_late.png')
    print('\n'.join(log))
    print('final clock:', clock())

if __name__ == '__main__':
    main()
