// data.js —— 16 家店铺。rating/pop/price：标注 source 的为真实采集（crawl-lab 10-24），其余为演示用估计值（hearsay）。
// golden: 黄金铺位（demo 冠名样例）。x/y 为 390x600 画布上的格子位。
window.WZD = { shops: [
  { id:'aren',    name:'矮人松糕',        cat:'food', rating:4.6, pop:500,  price:15, golden:'矮人松糕黄金铺位', x:60,  y:120, src:'platform' },
  { id:'changren',name:'长人馄饨',        cat:'food', rating:4.4, pop:300,  price:12, x:150, y:100, src:'hearsay' },
  { id:'xianqian',name:'县前汤圆(县前头店)',cat:'food', rating:4.5, pop:200, price:18, x:250, y:130, src:'platform' },
  { id:'chenhui', name:'陈辉鱼圆',        cat:'food', rating:4.3, pop:150,  price:25, x:330, y:110, src:'hearsay' },
  { id:'nanxi1',  name:'楠溪第一楼(瓯北店)',cat:'food', rating:4.5, pop:24,  price:97, x:80,  y:230, src:'verified', note:'10:00-13:00,15:30-20:30' },
  { id:'bowen',   name:'伯温家宴',        cat:'food', rating:4.2, pop:80,   price:62, x:200, y:250, src:'platform' },
  { id:'ouzheng', name:'瓯正味海鲜',      cat:'food', rating:4.4, pop:64,   price:112,x:320, y:240, src:'platform', note:'17:00 开门' },
  { id:'dajiujia',name:'温州大酒家',      cat:'food', rating:4.0, pop:300,  price:80, x:150, y:330, golden:'温州大酒家黄金铺位', x:0, src:'hearsay' },
  { id:'wumaoux', name:'五马街手信铺',    cat:'shop', rating:4.2, pop:400,  price:45, x:60,  y:380, src:'hearsay' },
  { id:'ouxiu',   name:'瓯绣坊',          cat:'shop', rating:4.7, pop:90,   price:120,x:170, y:400, src:'hearsay' },
  { id:'ougan',   name:'老字号瓯柑行',    cat:'shop', rating:3.4, pop:60,   price:20, x:280, y:390, fixup:true, src:'hearsay' },
  { id:'xishang', name:'席上茶事·墨池坊', cat:'cafe', rating:4.8, pop:70,   price:55, x:70,  y:500, src:'platform' },
  { id:'jxshop',  name:'江心屿纪念品',    cat:'shop', rating:3.8, pop:120,  price:35, x:200, y:510, golden:'江心屿纪念品黄金铺位', x:0, src:'hearsay' },
  { id:'shuomen', name:'朔门文创',        cat:'shop', rating:4.1, pop:45,   price:30, x:320, y:500, src:'hearsay' },
  { id:'tanghe',  name:'塘河夜画码头',    cat:'sight',rating:4.6, pop:200,  price:68, x:120, y:560, golden:'塘河夜画黄金铺位', x:0, src:'platform' },
  { id:'wuja',    name:'吴家老宅庭院剧场', cat:'sight',rating:4.3, pop:55,   price:50, x:260, y:565, src:'hearsay' },
] };
