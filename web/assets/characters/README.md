# 游戏人物素材

原始素材来自用户提供的 `/Users/felix/Downloads/game-ui-kit/assets/`，五个原始 SVG 保持原样。

- `char-hero.svg` / `avatar-hero.svg`：导游及 HUD 头像；地图额外绘制导游旗。
- `char-customer.svg`：女游客骨架；`char-hero.svg` 同时作为男游客骨架。
- `guest-<tag>.svg` / `avatar-<tag>.svg`：八类游客，服装按 `content/params.js` 的标签色生成。头像直接裁切矢量头部。
- `char-shopkeeper.svg` / `avatar-shopkeeper.svg`：柴犬接待吉祥物，头像用于小吃及手信店的停站卡。
- `char-scholar.svg`：由主角骨架派生的长袍、冠帽人形，供地图中的名人 NPC 使用。

重新生成派生素材：`node scripts/sync-characters.js`。
重新导入整套源素材：`node scripts/sync-characters.js /path/to/game-ui-kit`。

所有游戏引用均为本地 SVG；地图由 Canvas 绘制，保留矢量源文件。
