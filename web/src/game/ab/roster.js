/* All attacks are original game interpretations of supplied character art and public motifs. */
(()=>{
const rows=`
阿梓|虚拟舞台|元气蛙系|今天也要蹦得更高！|#a6e46a|rush|蛙鸣掌,蛙跃踢|蛙蛙突进/dash|元气音波/projectile|莲叶弹跳/upper|元气大合唱/barrage
八幡海铃|乐队现场|专业贝斯手|这一场，我来支援。|#7395bb|focus|拨弦击,低频扫弦|低音脉冲/projectile|支援换位/dash|沉稳节拍/counter|三十团共鸣/beam
贝拉|虚拟舞台|舞蹈担当|舞台，交给我！|#f5756d|rush|舞步拳,旋身踢|拉满了/dash|芭蕾回旋/burst|队长节拍/counter|舞力全开/barrage
踩背象|奇妙生物|重量级按摩师|踩得很到位。|#7bccef|armor|象鼻拍,厚足踩|长鼻水炮/projectile|踩背服务/slam|象式推拿/grab|终极踩背/slam
椎名立希|乐队现场|爆裂鼓手|节奏，别给我乱！|#be78a7|rush|鼓槌击,双槌重拍|怒涛连鼓/burst|抢拍突进/dash|重音上挑/upper|鼓点风暴/barrage
凑友希那|乐队现场|冰蓝主唱|你有赌上一切的觉悟吗？|#9892ef|focus|冷音,高音落击|冰蓝高音/projectile|蔷薇回响/trap|舞台专注/counter|苍蓝蔷薇/beam
袋鼠|奇妙生物|弹跳拳王|拳头和弹跳，都管够。|#edb758|air|袋鼠拳,尾巴扫|弹簧拳/upper|袋式飞踢/dash|蓄力落地/slam|澳洲弹跳王/slam
电棍|抽象名场面|带电节奏大师|好快的刀！|#d4ed73|charge|电拳,电棍重踢|电流激荡/projectile|瞬步开棍/dash|稳住节奏/counter|鬼畜高压电/beam
叮咚鸡|奇妙生物|移动闹钟|叮咚，开打时间到！|#ffeaa1|rush|啄击,鸡翅拍|叮咚声波/projectile|起飞扑腾/upper|敲门三连/burst|叮咚循环/barrage
东北雨姐|抽象名场面|家常力量派|整点有劲儿的！|#f76d68|armor|大掌,铁锅拍|大锅翻炒/upper|大步流星/dash|开饭了/grab|东北大锅气/burst
东雪莲|虚拟舞台|霜雪歌姬|下一首，雪花落下。|#b9d8ff|focus|雪掌,冰晶踢|雪莲飞霜/projectile|冰花绽放/trap|霜华回身/counter|雪夜交响/beam
冬马和纱|乐队现场|黑白琴键|就用这一曲决胜吧。|#8e9dea|flow|琴键击,低音坠|黑键流星/projectile|白键滑奏/dash|冬日和弦/burst|白色终章/beam
丰川祥子|乐队现场|命运键盘手|把你余下的人生交给我。|#91b8f1|charge|琴键击,命运重音|遗忘序曲/projectile|假面舞台/trap|大小姐节拍/counter|命运的开幕/beam
峰月律|乐队现场|冷色节奏吉他|让节奏继续。|#69c8e4|rush|切分击,节奏重斩|蓝弦疾驰/dash|切分音浪/projectile|节拍升龙/upper|律动无限/barrage
高松灯|乐队现场|迷子主唱|一起迷失，也要唱下去。|#a8bfeb|charge|小石子,笔记重拍|诗超绊/projectile|星星收集/trap|一辈子的约定/counter|迷子的呐喊/beam
高松灯企鹅|奇妙生物|迷子企鹅|今天也在寻找石头。|#c2d1ef|air|鳍拍,企鹅蹬腿|企鹅滑行/dash|小石子连发/projectile|冰面弹跳/upper|南极诗超绊/barrage
宫永野乃花|乐队现场|主音吉他|把心意弹给你听。|#c5a4f3|focus|拨片,旋律重击|花音滑奏/dash|主音花火/projectile|六弦回旋/burst|花开无限/beam
古振兴|抽象名场面|硬派肌肉|这一拳，练过的。|#e3ac79|armor|直拳,重摆拳|肌肉冲撞/dash|硬派升龙/upper|力量压制/grab|终极肌肉/burst
管理员企鹅|奇妙生物|秩序守门员|本场，禁止捣乱。|#9ed6ff|counter|提醒拍,警告重击|禁言通知/projectile|管理结界/trap|撤回反制/counter|全场权限/beam
灰泽满|乐队现场|灰蓝音色|安静地蓄力，一次爆发。|#a5a9cf|flow|弦音击,灰羽落击|灰羽连音/projectile|静默步伐/dash|满弦回响/burst|灰蓝满奏/barrage
珈乐|虚拟舞台|酷盖小狼王|狼王，登场。|#bc8ce9|rush|狼爪,狼牙踢|狼王突袭/dash|紫色高音/projectile|满月上挑/upper|皇珈终曲/barrage
嘉然|虚拟舞台|嘉心糖甜心|今天想吃点什么？|#ff9caa|leech|糖果拳,甜心踢|嘉心糖弹/projectile|小恶魔扑击/dash|甜点补给/heal|嘉心糖风暴/barrage
李老八|抽象名场面|绿茵锐评家|这球，必须进！|#ef6f66|focus|推掌,大力抽射|绿茵弧线/projectile|边路超车/dash|战术拦截/counter|球王时刻/beam
露早|虚拟舞台|晨露兔步|早安，开始蹦跳！|#ffb6c6|air|兔爪,兔步踢|晨露飞弹/projectile|兔兔升空/upper|花园滑步/dash|破晓花雨/barrage
耄耋|奇妙生物|哈气大师|哈——！|#e9b87c|rush|猫爪,后腿蹬|哈气冲击/projectile|闪电猫扑/dash|炸毛反击/counter|全自动哈气/barrage
明前奶绿|虚拟舞台|茶香法师|先喝一口，再来一局。|#a8c77f|leech|茶枝击,茶罐拍|奶绿波/projectile|茶园结界/trap|续一杯/heal|明前茶暴/beam
乃琳|虚拟舞台|冰淇淋女王|轮到我掌控舞台了。|#b494e2|counter|优雅掌,女王踢|奶淇琳弹/projectile|主持人控场/trap|从容反制/counter|女王的舞台/beam
奶龙|奇妙生物|黄色快乐旋风|我是奶龙！|#ffd34c|armor|奶拳,快乐蹬蹬|奶龙冲冲/dash|快乐蹦蹦/slam|奶气泡泡/projectile|我才是奶龙/burst
奶蛙|奇妙生物|奶味弹跳机|呱！这波我先跳。|#d4df6b|air|蛙掌,蛙腿踢|奶泡弹/projectile|蛙式起跳/upper|荷塘震荡/slam|超级呱呱/barrage
闹吃|抽象名场面|能量吞噬者|吃饱了才有力气。|#dc9667|leech|硬拳,饱腹重击|饿虎扑食/dash|加餐抓取/grab|能量加餐/heal|开席了/burst
尼古喵喵|虚拟舞台|薄荷猫步|喵，抓到你了。|#acd9c2|air|喵爪,猫尾扫|薄荷飞爪/projectile|猫步闪击/dash|喵喵升空/upper|九命狂想/barrage
牛来|奇妙生物|冲阵先锋|牛来了！|#d99852|armor|牛角挑,蹄踏|牛来冲锋/dash|牛角上挑/upper|踏地震波/slam|万牛奔腾/dash
牛妈妈|奇妙生物|金色守护|这回，我来撑场。|#f0c364|counter|牛掌,护崽重击|金角冲撞/dash|护崽姿态/counter|暖心补给/heal|牛气冲天/burst
七海|虚拟舞台|海色航路|这片海，由我来带路。|#6dcfdc|focus|浪花掌,潮汐踢|七海水弹/projectile|海风突进/dash|回潮结界/trap|七海共鸣/beam
千石由乃|乐队现场|梦幻采样师|把这一拍，重新混音。|#f781b4|flow|打碟击,采样重音|唱片飞盘/projectile|低频落点/trap|混音爆破/burst|无限DROP/barrage
千早爱音|乐队现场|粉色聚光灯|这个乐队名，怎么样？|#f6a1ba|rush|粉弦击,主角踢|爱音疾走/dash|粉色和弦/projectile|主角登场/upper|ANON TOKYO/barrage
乔希|虚拟舞台|校园流星|这次换我先手。|#82b9e9|rush|直拳,流星踢|校园疾风/dash|星光飞弹/projectile|流星上挑/upper|青春全速/dash
若叶睦|乐队现场|沉默的绿弦|我，从来都没有觉得……|#a5cc87|counter|绿弦击,沉默重斩|黄瓜飞弹/projectile|双面假象/trap|沉默反制/counter|双生假面/barrage
三角初华|乐队现场|破晓主唱|去看星星吧。|#e8cba2|focus|星弦击,破晓重音|晨星之声/projectile|星轨滑步/dash|曙光回旋/burst|星空独唱/beam
山泥若|抽象名场面|名场面制造机|永远滴神！|#c89cb4|charge|直拳,山岳重击|神之声波/projectile|山岳冲锋/dash|名场面蓄势/counter|永远滴神/beam
诗歌剧|奇妙生物|不服输的小马|这次一定要赢！|#e69ec8|rush|马蹄拳,后蹬踢|短途冲刺/dash|胜利飞跃/upper|应援音波/projectile|不屈的终点/dash
说的道理|抽象名场面|道理回音壁|你说得，很有道理。|#efa393|counter|说道掌,道理重拍|道理冲击/projectile|我有异议/counter|强行说服/grab|道理无限循环/barrage
四时小路|虚拟舞台|四季巡游|下一站，换个季节。|#df818e|flow|枫叶击,季风重拍|春风飞叶/projectile|夏日疾走/dash|冬霜阵/trap|四时轮转/barrage
孙笑川|抽象名场面|带带大师兄|这一拳，带点节奏。|#afa9df|counter|带掌,带带重击|带带冲击/projectile|大师兄突进/dash|反向节奏/counter|抽象大舞台/burst
汤圆|奇妙生物|糯米弹力球|圆滚滚，也有冲击力。|#f5d96e|leech|糯米拳,碗沿重拍|芝麻弹/projectile|滚圆冲刺/dash|糯米恢复/heal|团团圆圆/slam
藤都子|乐队现场|漫画键盘手|截稿之前，再弹一曲。|#b299d4|flow|墨线击,稿纸重拍|墨色分镜/projectile|截稿结界/trap|赶稿疾走/dash|无限分镜/barrage
薇欧拉|乐队现场|微笑的布局者|一切，都在计划中。|#c1c585|counter|轻语掌,暗弦重击|甜言回声/projectile|话术陷阱/trap|微笑反制/counter|帷幕之后/beam
向晚|虚拟舞台|双钻头大小姐|游戏时间，开始！|#ac94ef|rush|钻头拳,旋风踢|双钻头突进/dash|晚风连弹/projectile|大小姐上挑/upper|顶碗人集合/barrage
小木曾雪菜|乐队现场|冬日歌声|歌声，会一直继续。|#e4b985|leech|音符击,冬日高音|白雪之声/projectile|舞台回响/burst|温柔和声/heal|白色相簿/beam
小松绿|虚拟舞台|森林节拍|让绿色开始生长。|#aad773|flow|叶片击,松果拍|松果弹/projectile|藤蔓阵/trap|林间滑步/dash|万绿齐鸣/barrage
星瞳|虚拟舞台|舞动星光|让每一步都闪耀。|#c0acfa|air|星点掌,旋舞踢|星轨滑行/dash|舞步升空/upper|星光弹/projectile|星瞳宇宙/barrage
炫狗|抽象名场面|狂野节奏|嗷，这波我上了！|#e5b47f|rush|狂拳,犬牙重击|狂野追击/dash|吼叫波/projectile|腾空爪/upper|狂热连打/barrage
炫神|抽象名场面|疾风操作王|这就是操作。|#f1bb92|flow|快拳,回旋踢|极限走位/dash|操作回响/projectile|反打时刻/counter|极限一打二/dash
要乐奈|乐队现场|流浪吉他猫|有趣的女人。|#b7d6ad|air|猫拨片,六弦扫|流浪滑奏/dash|抹茶弹/projectile|即兴升空/upper|野猫即兴/barrage
永雏塔菲|虚拟舞台|蒸汽猫娘|杂鱼，接招喵！|#f4a8bd|flow|猫爪击,齿轮踢|蒸汽齿轮/projectile|猫步闪现/dash|机械陷阱/trap|蒸汽工坊/beam
柚恩|虚拟舞台|柚色星愿|送你一颗亮晶晶。|#adbaff|charge|星愿掌,柚光踢|柚光弹/projectile|星愿升空/upper|月色回响/burst|繁星许愿/barrage
祐天寺若麦|乐队现场|镜头鼓手|镜头，给到我！|#c89cba|rush|鼓点击,闪光重拍|闪光快门/projectile|话题突进/dash|热度爆破/burst|热搜鼓点/barrage
张顺飞|抽象名场面|起飞发动机|这波，直接起飞。|#c8c3aa|air|顺风拳,飞天踢|顺势冲锋/dash|原地起飞/upper|落地有声/slam|一路顺风/dash
长崎素世|乐队现场|低音牵引|这一切，都是为了乐队。|#d1af87|counter|低弦击,贝斯重音|低音牵引/projectile|温柔束缚/trap|一切为了乐队/counter|过去的回响/beam
仲町阿拉蕾|乐队现场|梦无限主唱|把梦想，大声唱出来！|#f2c168|charge|元气掌,梦色踢|梦色歌声/projectile|舞台冲刺/dash|勇气高音/upper|梦想无限大/beam
`.trim().split('\n');
const passive={rush:['追击节奏','每第 3 次命中额外获得 14 气'],armor:['硬派身躯','受到的伤害降低 10%'],flow:['流畅演出','专属技能冷却缩短 12%'],charge:['热场体质','自然回气速度提高 50%'],leech:['甜味补给','专属技能首次命中回复 9 生命'],counter:['从容应对','格挡成功额外获得 4 气'],focus:['远距专注','飞行道具速度提高 15%'],air:['轻盈脚步','跳跃高度提升，移动速度加快']};
const styles={rush:'快攻 / 连击',armor:'重装 / 压制',flow:'技巧 / 循环',charge:'均衡 / 爆发',leech:'续航 / 消耗',counter:'防守 / 反击',focus:'远程 / 牵制',air:'机动 / 空战'};
const types={
light:{type:'light',damage:26,range:98,start:.075,duration:.26,cd:.23,desc:'近身快击；命中可接 J / K'},
heavy:{type:'heavy',damage:53,range:126,start:.19,duration:.53,cd:.51,desc:'重击击退；可接在轻击后'},
projectile:{damage:42,range:900,start:.23,duration:.53,cd:3.2,desc:'远程飞弹；可格挡或跳过'},
dash:{damage:51,range:112,start:.12,duration:.47,cd:4.2,desc:'快速突进并击退对手'},
upper:{damage:57,range:115,start:.1,duration:.65,cd:4.8,desc:'升空对空；起手短暂无敌'},
slam:{damage:65,range:188,start:.7,duration:.93,cd:5.5,desc:'跃起落地，震波击倒近敌'},
burst:{damage:62,range:180,start:.3,duration:.65,cd:5.2,desc:'近距爆发；更强击退'},
grab:{damage:70,range:90,start:.2,duration:.65,cd:6,desc:'近身抓投；无视格挡'},
counter:{damage:30,range:145,start:.09,duration:.34,cd:6.8,desc:'2 秒反击架势；受近击反伤'},
trap:{damage:38,range:210,start:.23,duration:.6,cd:5.4,desc:'前方布阵；触碰减速 1.5 秒'},
heal:{damage:20,range:120,start:.38,duration:.7,cd:11,desc:'回复 55 生命并震退近敌'},
beam:{damage:188,range:880,start:.55,duration:1.12,cd:0,desc:'长距离贯穿必杀；消耗 100 气'},
barrage:{damage:40,range:900,start:.25,duration:1.16,cd:0,desc:'五连弹幕必杀；消耗 100 气'}
};
const data=new Map(rows.map(r=>{let [name,group,title,quote,color,trait,basic,...abilities]=r.split('|');return [name,{group,title,quote,color,trait,basic,abilities}]}));
window.ROSTER=ASSETS.map(a=>{const d=data.get(a.name);if(!d)throw Error('Missing character '+a.name);const [jab,kick]=d.basic.split(',');const raw=[jab+'/light',kick+'/heavy',...d.abilities];let skills=raw.map((s,i)=>{let [name,type]=s.split('/');const t={...types[type],type,name,key:['J','K','U','I','O','L'][i],super:i===5};if(i===5&&!['beam','barrage'].includes(type)){t.damage=195;t.range=type==='dash'?145:260;t.start=type==='slam'?.8:.36;t.duration=type==='dash'?1.1:1.2;t.desc=(type==='dash'?'超高速贯穿冲刺':type==='slam'?'高空重砸，大范围震荡':'蓄力爆发，大范围击退')+'；消耗 100 气';t.cd=0;}if(i>=2&&i<5){t.damage+=a.id%5-2;t.cd=+(t.cd*(d.trait==='flow'?.88:1)).toFixed(1);}return t;});return {...a,...d,style:styles[d.trait],passive:passive[d.trait],hp:d.trait==='armor'?1080:d.trait==='air'?910:1000,speed:d.trait==='air'?260:d.trait==='rush'?248:d.trait==='armor'?195:225,power:d.trait==='armor'?1.06:1,skills};});
const glyphs={'阿梓':'呱','八幡海铃':'低','贝拉':'舞','贝利亚':'暗','踩背象':'踩','椎名立希':'鼓','凑友希那':'冰','袋鼠':'跳','电棍':'电','叮咚鸡':'叮','东北雨姐':'锅','东雪莲':'雪','冬马和纱':'♬','丰川祥子':'命','峰月律':'律','高松灯':'星','高松灯企鹅':'石','宫永野乃花':'花','古振兴':'拳','管理员企鹅':'禁','灰泽满':'羽','珈乐':'狼','嘉然':'糖','李老八':'球','露早':'兔','耄耋':'哈','明前奶绿':'茶','乃琳':'琳','奶龙':'奶','奶蛙':'呱','闹吃':'吃','尼古喵喵':'喵','牛来':'牛','牛妈妈':'哞','七海':'潮','千石由乃':'碟','千早爱音':'爱','乔希':'闪','若叶睦':'瓜','三角初华':'曙','山泥若':'神','诗歌剧':'冲','说的道理':'理','四时小路':'枫','孙笑川':'带','汤圆':'圆','藤都子':'墨','恬豆':'豆','薇欧拉':'幕','文静':'静','向晚':'晚','小木曾雪菜':'雪','小松绿':'叶','星瞳':'✦','炫狗':'嗷','炫神':'炫','要乐奈':'猫','永雏塔菲':'喵','柚恩':'愿','祐天寺若麦':'热','张顺飞':'飞','长崎素世':'绊','仲町阿拉蕾':'梦'};
window.ROSTER.forEach(c=>{c.glyph=glyphs[c.name]||'✦';});
window.ROSTER_BY_ID=new Map(ROSTER.map(c=>[c.id,c]));
window.FIGHTER_TYPES=types;
})();
