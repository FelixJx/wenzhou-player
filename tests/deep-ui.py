import asyncio, sys, json
import os
from playwright.async_api import async_playwright
OUT=os.environ.get('OUT','artifacts/deep/')
import os; os.makedirs(OUT, exist_ok=True)
VPS={'iphone':(390,844,True),'se':(375,667,True),'android':(360,780,True),'land':(844,390,True),'desktop':(1440,900,False)}
CHECK=r'''() => {
  const out=[]; const vis=e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
  const root=document.querySelector('#overlay:not([hidden])')||document.body;
  document.querySelectorAll('#app *').forEach(e=>{
    if(!vis(e)) return; if(e.closest('.side-book:not(.open)') && !document.documentElement.classList.contains('land')) return; const cs=getComputedStyle(e);
    const hasText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!hasText) return;
    if(e.scrollWidth>e.clientWidth+2 && cs.overflowX!=='auto' && cs.overflowX!=='scroll') out.push('H溢出 '+(e.className||e.tagName)+' 「'+e.textContent.trim().slice(0,16)+'」');
    if(cs.textOverflow==='ellipsis' && e.scrollWidth>e.clientWidth+1) out.push('省略号 '+(e.className||e.tagName));
    const r=e.getBoundingClientRect(); if(r.right>innerWidth+1||r.left<-1) out.push('出屏 '+(e.className||e.tagName)+' 「'+e.textContent.trim().slice(0,12)+'」 '+Math.round(r.left)+'~'+Math.round(r.right));
  });
  // 列表项互相重叠
  ['.place-list > .place','.team-list > .guest-card','.tl > .tl-item'].forEach(sel=>{
    const a=[...document.querySelectorAll(sel)].filter(vis).map(e=>e.getBoundingClientRect());
    for(let i=1;i<a.length;i++) if(a[i].top < a[i-1].bottom-1) out.push('重叠 '+sel+' #'+i);
  });
  return [...new Set(out)].slice(0,25);
}'''
async def run(name):
    W,H,touch=VPS[name]
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        ctx=await b.new_context(viewport={'width':W,'height':H},device_scale_factor=2,has_touch=touch,is_mobile=touch and W<700)
        await ctx.add_init_script("try{['route','go','book','unhappy'].forEach(k=>localStorage.setItem('wz_spot_'+k,'1'))}catch(e){}")
        p=await ctx.new_page()
        errs=[]; p.on('pageerror',lambda e: errs.append(str(e)))
        rep={}
        async def snap(tag):
            await p.screenshot(path=OUT+f'{name}_{tag}.png')
            rep[tag]=await p.evaluate(CHECK)
        await p.goto('http://localhost:8790/play/'); await p.evaluate("localStorage.clear()"); await p.reload(); await p.wait_for_timeout(1500)
        await snap('1intro')
        B=lambda t: p.locator('button:visible',has_text=t).first
        await B('吃不惯').click(); await B('买买买').click()
        await p.locator('.page-intro input.input').first.fill('怕走一整天脚痛还吃不到正宗的')
        await B('带队出发').click(); await p.wait_for_timeout(1800)
        await snap('2team')
        # 删一个、加一个、改一个
        await p.locator('.gc-op',has_text='×').nth(1).click(); await p.wait_for_timeout(200)
        await p.locator('.team-add').click(); await p.wait_for_timeout(200)
        await p.locator('.te-grid .tag',has_text='憋不住').click(); await p.locator('.team-edit input').fill('老街巷里找厕所找到怀疑人生')
        await snap('3teamedit')
        await p.locator('.team-edit button',has_text='加入队伍').click(); await p.wait_for_timeout(300)
        await snap('4team2')
        n=await p.locator('.page-team .guest-card').count()
        await B('出发前排个路线').click(); await p.wait_for_timeout(1500)
        await snap('5plan')
        ng=await p.evaluate("WZ.main.run.state.guests.map(g=>g.tag+':'+g.line)")
        for i in [0,2,4]:
            await p.locator('.page-plan .place').nth(i).click(); await p.wait_for_timeout(150)
        await snap('6plan3')
        await p.locator('.book-go').click(); await p.wait_for_timeout(400)
        await snap('7confirm')
        await B('就这么走').click(); await p.wait_for_timeout(2500)
        await snap('8walk')
        # 推进到停站
        for _ in range(40):
            if await p.locator('#dock .stay-card').count(): break
            if await p.locator('.quiz-dlg .qd-skip').count():
                await snap('9quiz'); o=p.locator('.qd-opt')
                if await o.count(): await o.first.click(); await p.wait_for_timeout(700); await snap('9quiz2')
                await p.locator('.qd-skip').click(); await p.wait_for_timeout(400)
            if await p.locator('#overlay:not([hidden]) .page-celeb').count():
                await snap('9celeb'); o=p.locator('.quiz-opt')
                if await o.count(): await o.first.click(); await p.wait_for_timeout(900); await snap('9quiz')
                bb=p.locator('.celeb-foot button',has_text='点头走过')
                if await bb.count(): await bb.click()
                await p.wait_for_timeout(500)
            await p.wait_for_timeout(500)
        if await p.locator('#dock .stay-card').count():
            await snap('a_stay'); await p.locator('#dock .stay-card button',has_text='继续出发').click(); await p.wait_for_timeout(500)
        await p.evaluate("(()=>{const g=WZ.main.run.state.guests[0]; ['好看','走不动了……这路好长','随便吧','有地方坐吗？我脚都快断了','这碗汤圆真香'].forEach((t,i)=>{g.msgs=g.msgs||[];g.msgs.push({at:30+i*10,text:t,tone:['good','bad','info','bad','good'][i]})}); g.patience=42; })()")
        await p.locator('.hg').first.click(); await p.wait_for_timeout(500)
        await snap('b_guest')
        await p.locator('.guest-panel .sc-x').click(); await p.wait_for_timeout(300)
        if await p.locator('#book-tab:visible').count(): await p.locator('#book-tab').click(); await p.wait_for_timeout(500)
        await snap('c_book')
        print(name,'team',n,ng)
        print(name,'errors',errs)
        for k,v in rep.items():
            if v: print(' ',k,v)
        await b.close()
async def main():
    for n in (sys.argv[1:] or VPS.keys()): 
        try: await run(n)
        except Exception as e: print(n,'EXC',str(e)[:300])
asyncio.run(main())
