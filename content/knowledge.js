// content/knowledge.js —— 「温州一句话」（≤30 字，每条带 source；传说一律写"相传"）
// tags: history | food | culture
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};

  root.WZ.content.knowledge = [
    // ---- 游客中心 center ----
    { id: 'k_center', placeId: 'center', tags: ['history'],
      text: '温州古称东瓯，汉初曾立东海王，都城就在这一带。',
      source: '《史记·东越列传》' },
    { id: 'k_center_name', placeId: 'center', tags: ['history'],
      text: '唐上元二年（675年）始置温州，取其气候温润之意。',
      source: '《温州市志》（中华书局，1998）' },
    { id: 'k_center_math', placeId: 'center', tags: ['culture'],
      text: '温州走出了苏步青、谷超豪等数学家，有"数学家之乡"之称。',
      source: '《苏步青传》（王增藩，复旦大学出版社）' },
    { id: 'k_center_lucheng', placeId: 'center', tags: ['history'],
      text: '相传建城时有白鹿衔花而过，温州城因此别称"鹿城"。',
      source: '明·弘治《温州府志》' },
    { id: 'k_center_ou', placeId: 'center', tags: ['history'],
      text: '温州古称"瓯"，本地烧造的瓯窑青瓷始于东汉，早于龙泉窑。',
      source: '《温州市志·文物》（中华书局，1998）' },

    // ---- 五马街 wuma ----
    { id: 'k_wuma', placeId: 'wuma', tags: ['history'],
      text: '五马街得名，相传与王羲之任永嘉郡守时乘五马出行有关。',
      source: '《温州市志》（中华书局，1998）' },
    { id: 'k_wuma_shop', placeId: 'wuma', tags: ['culture'],
      text: '温州有"百工之乡"之称，瓯绣、瓯塑都是国家级非遗。',
      source: '国务院《国家级非物质文化遗产名录》（2008）' },
    { id: 'k_wuma_port', placeId: 'wuma', tags: ['history'],
      text: '1876年《烟台条约》后温州开埠，成为近代通商口岸。',
      source: '《烟台条约》（1876）' },
    { id: 'k_wuma_stores', placeId: 'wuma', tags: ['food'],
      text: '五马街口的温州大酒家是老字号瓯菜馆，做本地家常菜。',
      source: '大众点评、高德地图收录（2026）' },

    // ---- 墨池公园 mochi ----
    { id: 'k_mochi', placeId: 'mochi', tags: ['history'],
      text: '相传王羲之在此洗砚，池水尽黑，故名墨池。',
      source: '明·弘治《温州府志》' },
    { id: 'k_mochi_xie', placeId: 'xiechi', tags: ['culture'], // 挂谢池巷（Lead 审查 L23）
      text: '谢灵运任永嘉太守时写下《登池上楼》，"池塘生春草"即出于此。',
      source: '《宋书·谢灵运传》；《文选》卷二十二' },
    { id: 'k_mochi_wang', placeId: 'mochi', tags: ['history'],
      text: '王羲之任永嘉郡守一事正史无载，属温州地方传说。',
      source: '《晋书·王羲之传》；明·弘治《温州府志》' },

    // ---- 县前小吃街 xianqian ----
    { id: 'k_xianqian', placeId: 'xianqian', tags: ['food'],
      text: '温州糯米饭：蒸糯米浇肉汤、撒油条碎，是本地经典早餐。',
      source: '《温州市志·风俗》（中华书局，1998）' },
    { id: 'k_xianqian_fish', placeId: 'xianqian', tags: ['food'],
      text: '温州鱼丸不是圆的，是鱼肉条，汤里放米醋和胡椒。',
      source: '《温州市志·风俗》（中华书局，1998）' },
    { id: 'k_xianqian_cake', placeId: 'xianqian', tags: ['food'],
      text: '灯盏糕因形似旧时油灯盏得名，萝卜丝馅，油炸到金黄。',
      source: '《温州市志·风俗》（中华书局，1998）' },
    { id: 'k_xianqian_wonton', placeId: 'xianqian', tags: ['food'],
      text: '长人馄饨相传因早年摊主个子高得名，皮薄如纸。',
      source: '《温州市志·风俗》（中华书局，1998）' },
    { id: 'k_xianqian_stores', placeId: 'xianqian', tags: ['food'],
      text: '县前头汤圆、长人馄饨、矮人松糕、陈辉鱼圆，都在这一带。',
      source: '大众点评、高德地图收录（2026）' },

    // ---- 巷子茶摊 teastall ----
    { id: 'k_teastall', placeId: 'teastall', tags: ['food'],
      text: '永嘉乌牛早是温州名茶，立春前后就能采，是最早上市的绿茶之一。',
      source: '《中国茶经》（陈宗懋主编，上海文化出版社）' },
    { id: 'k_teastall_dialect', placeId: 'teastall', tags: ['culture'],
      text: '温州话属吴语瓯江片，外地人很难听懂。',
      source: '《中国语言地图集》（中国社会科学院，1987）' },

    // ---- 江滨码头 pier ----
    { id: 'k_pier', placeId: 'pier', tags: ['history'],
      text: '瓯江江心屿有东西双塔，东塔建于唐，西塔建于宋。',
      source: '《温州市志》（中华书局，1998）' },
    { id: 'k_pier_wen', placeId: 'pier', tags: ['history'],
      text: '1276年文天祥自元营脱险，由海路南下到温州，上表劝进。',
      source: '《宋史·文天祥传》' },
    { id: 'k_pier_xie', placeId: 'pier', tags: ['culture'],
      text: '谢灵运《登江中孤屿》写江心屿："云日相辉映，空水共澄鲜。"',
      source: '《文选》卷二十六' },
    { id: 'k_pier_river', placeId: 'pier', tags: ['history'],
      text: '瓯江是浙江第二大河，温州城就建在瓯江南岸。',
      source: '《温州市志·地理》（中华书局，1998）' },

    // ---- 小巷 lane1 / lane2 ----
    { id: 'k_lane1', placeId: 'lane1', tags: ['history'],
      text: '相传东晋郭璞为温州选址，连九山而筑城，形如北斗，称"斗城"。',
      source: '明·弘治《温州府志》' },
    { id: 'k_lane2', placeId: 'lane2', tags: ['culture'],
      text: '唐代高僧永嘉玄觉著《证道歌》，温州松台山有纪念他的净光塔。',
      source: '《景德传灯录》卷五' },

    // ---- 厕所 ×3（搭配轻松的文化常识）----
    { id: 'k_toilet1', placeId: 'toilet1', tags: ['culture'],
      text: '乐清黄杨木雕、乐清细纹刻纸是首批国家级非遗。',
      source: '国务院《国家级非物质文化遗产名录》（2006）' },
    { id: 'k_toilet2', placeId: 'toilet2', tags: ['culture'],
      text: '《徐霞客游记》开篇就写浙江，雁荡山是他多次重游的地方。',
      source: '《徐霞客游记·游雁宕山日记》' },
    { id: 'k_toilet3', placeId: 'toilet3', tags: ['history'],
      text: '南宋永嘉学派主张"事功"，与朱熹理学、陆九渊心学鼎足而三。',
      source: '《宋元学案·水心学案》' },

    // ---- 老戏台 stage ----
    { id: 'k_stage', placeId: 'stage', tags: ['culture'],
      text: '南戏起于宋代温州，又称"永嘉杂剧"，是中国最早的成熟戏曲。',
      source: '明·徐渭《南词叙录》' },
    { id: 'k_stage_gao', placeId: 'stage', tags: ['culture'],
      text: '瑞安人高则诚作《琵琶记》，被称为"南戏之祖"。',
      source: '明·徐渭《南词叙录》' },
    { id: 'k_stage_ouju', placeId: 'stage', tags: ['culture'],
      text: '瓯剧是温州地方剧种，2008年列入国家级非遗。',
      source: '国务院《国家级非物质文化遗产名录》（2008）' },

    // ---- 谢池巷 xiechi ----
    { id: 'k_xiechi', placeId: 'xiechi', tags: ['culture'],
      text: '谢灵运被称为山水诗鼻祖，不少名篇写于温州任上。',
      source: '《宋书·谢灵运传》' },

    // ---- 水心街 shuixin ----
    { id: 'k_shuixin', placeId: 'shuixin', tags: ['history'],
      text: '永嘉学派集大成者叶适晚年居温州水心村，故号"水心先生"。',
      source: '《宋元学案·水心学案》' },

    // ---- 江心屿 jiangxin ----
    { id: 'k_jiangxin', placeId: 'jiangxin', tags: ['history'],
      text: '江心屿古称孤屿，历代诗人题咏不断，有"诗之岛"之称。',
      source: '《温州市志》（中华书局，1998）' },
    { id: 'k_jiangxin_towers', placeId: 'jiangxin', tags: ['history'],
      text: '江心东西双塔旧时是瓯江夜航的灯标，1997年列入世界航标遗产。',
      source: '国际航标协会（IALA，1997）' },
    { id: 'k_jiangxin_wen', placeId: 'jiangxin', tags: ['history'],
      text: '文天祥经温州时驻留江心屿，留有诗《北归宿中川寺》。',
      source: '文天祥《指南录》' },
    { id: 'k_jiangxin_guyu', placeId: 'jiangxin', tags: ['culture'],
      text: '"孤屿媚中川"出自谢灵运《登江中孤屿》，咏的正是这座岛。',
      source: '《文选》卷二十六' },

    // ---- 朔门古港 shuomen ----
    { id: 'k_shuomen', placeId: 'shuomen', tags: ['history'],
      text: '朔门古港遗址发现宋代码头群与沉船，入选全国十大考古新发现。',
      source: '2022年度全国十大考古新发现（国家文物局，2023）' },
    { id: 'k_shuomen_gate', placeId: 'shuomen', tags: ['history'],
      text: '朔门是温州古城北门，出门直通瓯江江埠码头。',
      source: '《温州市志》（中华书局，1998）' },
    { id: 'k_shuomen_ceramic', placeId: 'shuomen', tags: ['history'],
      text: '朔门遗址出土瓷片以龙泉青瓷为主，见证海上丝绸之路港口盛况。',
      source: '浙江省文物考古研究所发掘资料（2022—2023）' },

    // ---- 楠溪江·丽水街 nanxi ----
    { id: 'k_nanxi', placeId: 'nanxi', tags: ['history'],
      text: '楠溪江1988年被列为国家级风景名胜区，是瓯江下游最大支流。',
      source: '国务院第二批国家级风景名胜区名单（1988）；《温州市志·地理》' },
    { id: 'k_nanxi_lishui', placeId: 'nanxi', tags: ['history'],
      text: '永嘉岩头丽水街是长廊式老街，起于明嘉靖年间的蓄水堤。',
      source: '《永嘉县志》' },
    { id: 'k_nanxi_cangpo', placeId: 'nanxi', tags: ['culture'],
      text: '相传苍坡古村按"文房四宝"布局：街为笔、池为砚、村为纸。',
      source: '《永嘉县志》' },

    // ---- 雁荡山 yandang ----
    { id: 'k_yandang_name', placeId: 'yandang', tags: ['history'],
      text: '沈括记雁荡"山顶有大池，相传以为雁荡"，山因雁而得名。',
      source: '沈括《梦溪笔谈·杂志一》' },
    { id: 'k_yandang_shenkuo', placeId: 'yandang', tags: ['culture'],
      text: '沈括在《梦溪笔谈》最早解释雁荡山峰是流水侵蚀而成。',
      source: '沈括《梦溪笔谈·杂志一》' },
    { id: 'k_yandang_xiake', placeId: 'yandang', tags: ['history'],
      text: '徐霞客三游雁荡山，《游雁宕山日记》收入《徐霞客游记》。',
      source: '《徐霞客游记·游雁宕山日记》' },
    { id: 'k_yandang_longqiu', placeId: 'yandang', tags: ['culture'],
      text: '大龙湫瀑布落差约190米，被称作"天下第一瀑"。',
      source: '《乐清县志》；雁荡山风景名胜区公开资料' },

    // ---- 塘河夜画 tanghe ----
    { id: 'k_tanghe', placeId: 'tanghe', tags: ['history'],
      text: '温瑞塘河始于晋代，是温州城南的水上动脉，人称母亲河。',
      source: '《温州市志·水利》（中华书局，1998）' },
    { id: 'k_tanghe_guci', placeId: 'tanghe', tags: ['culture'],
      text: '温州鼓词用温州话演唱，2006年列入首批国家级非遗。',
      source: '国务院《国家级非物质文化遗产名录》（2006）' },

    // ---- 真实店铺点（2026-10-25 审计补：此前借用他处条目，语境对不上）----
    { id: 'k_f_airen', placeId: 'f_airen', tags: ['food'],
      text: '矮人松糕是温州古早味茶点，米粉现蒸，小南这家是老店。',
      source: '大众点评、高德地图收录（2026）' },
    { id: 'k_f_paidui', placeId: 'f_paidui', tags: ['food'],
      text: '排队烧饼1995年起炭炉现烤，仓桥街这家常排队一小时。',
      source: '高德、天眼查、抖音收录（2026）' },
    { id: 'k_f_ouyan', placeId: 'f_ouyan', tags: ['food'],
      text: '瓯宴府开在公园路，做瓯菜宴席，本地人宴请常选。',
      source: '大众点评、携程收录（2026）' },
    { id: 'k_f_zhengliang', placeId: 'f_zhengliang', tags: ['food'],
      text: '正亮海鲜是本地人推荐的海鲜楼，营业到凌晨一点。',
      source: '大众点评、高德地图收录（2026）' },
    { id: 'k_f_shamaohe', placeId: 'f_shamaohe', tags: ['food'],
      text: '敲鱼面是把鱼肉敲薄切条的老做法，纱帽河这家做了44年。',
      source: '高德、大众点评收录（2026）' },
    { id: 'k_p_wuweihe', placeId: 'p_wuweihe', tags: ['culture'],
      text: '五味和是五马步行街的老字号，老温州买糕点手信的铺子。',
      source: '高德地图收录（2026）' },

    // ---- 不绑定地点：名人卡背、结算抽取 ----
    { id: 'k_zhu_green', placeId: null, tags: ['culture'],
      text: '朱自清1923年在温州任教，《绿》写的是仙岩梅雨潭。',
      source: '朱自清《温州的踪迹》（1924）' },
    { id: 'k_hongyi', placeId: null, tags: ['culture'],
      text: '弘一法师1921年起多次驻锡温州庆福寺，前后十余年。',
      source: '林子青《弘一法师年谱》' },
    { id: 'k_1024', placeId: null, tags: ['culture'],
      text: '一天 1024 分钟，1024 正好是 2 的 10 次方。',
      source: '本游戏设定（算术事实）' }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
