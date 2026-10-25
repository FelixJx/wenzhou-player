# 地标精灵生成提示词包 —— web/assets/*.png

引擎约定：`web/assets/<place.id>.png`，缺图静默跳过（程序化绘制兜底）。
已接入探测名单（`content/params.js` → `engine.sprites`）：`wuma / mochi / center / jiangxin / yandang / nanxi`。

## 硬性规格

- **背景透明**（PNG alpha），只画主体本身
- **锚点**：图片底边中点 = 地点入口（渲染时按 `底边中心对齐入口` 贴图）
- **风格**：16-bit 像素风（SNES/GBA 级别），斜俯视 2.5D，暖色调，与游戏内的黑瓦白墙 + 红灯笼一致
- **参考图色板**：墙 #ece6da / 瓦 #464d55 / 木 #8a5a2b / 灯笼红 #d7263d / 暖光 #ffd166
- 建议尺寸（整数倍缩放会保持像素干净）：
  - `wuma.png` 五马街牌楼：128×112（红柱三层檐 + 金匾「五马街」）
  - `mochi.png` 墨池公园：128×96（墨色小池 + 石碑 + 亭）
  - `center.png` 游客中心：160×112（白墙蓝顶 + 红牌 + 小旗）
  - `jiangxin.png` 江心双塔：96×128（一座七级砖塔即可，游戏里左右各贴一张同图）
  - `yandang.png` 雁荡山：160×112（三座青绿山峰 + 云气）
  - `nanxi.png` 楠溪江·丽水街：160×96（水边长廊式老街）

## 提示词（每个地标一条，可直接粘贴）

通用后缀（拼在每条后面）：
> 16-bit SNES style pixel art, oblique top-down 2.5D perspective, warm color palette, crisp pixels no anti-aliasing, transparent background, single sprite, game asset, centered, no text watermark

1. **wuma**：Chinese traditional wooden memorial archway (paifang gate) with three tiered dark-tile roofs and upturned eaves, two red pillars, golden plaque, festive red lanterns hanging on both sides
2. **mochi**：small classical Chinese garden pond with dark ink-black water, stone stele tablet beside it, tiny hexagonal pavilion, green old pine tree, stone edge
3. **center**：small two-story modern tourist service building, white walls blue glass windows, red signboard on roof, small yellow flag, clean simple shapes
4. **jiangxin**：ancient Chinese seven-story brick pagoda, weathered grey-brick with warm lit windows, dark-tile eaves on each floor, golden spire on top
5. **yandang**：three steep green mountain peaks with vertical rock cliffs, wisps of white cloud around mid-slope, small waterfall line, lush vegetation at base
6. **nanxi**：waterside Chinese old street, one long wooden covered corridor with dark tile roof along a river bank, wooden pillars, warm lanterns under eaves

## 出图后

1. 文件放进 `web/assets/`，命名严格用上表（全小写）
2. 冒烟验证：`WZ_BASE=http://127.0.0.1:8790 WZ_CHANNEL=chrome node tests/smoke-run.js`，看 `artifacts/*.png` 截图里地标是否替换成功、锚点是否贴地
3. 不满意就只重出那一张，代码不用动
