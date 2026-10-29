/* Public persona motifs become fictional combat rules. Sources live in meme-sources.json. */
(()=>{
const D=(name,type,fx,desc,extra={})=>({name,type,fx,desc,...extra});
const cast={
'七海':['脆鲨矿工','凿！凿！凿！',[
 D('脆鲨','throw','wafer','扔出脆脆鲨巧克力威化，落地碎屑溅射',{size:75,splash:75}),D('凿！凿！凿！','burst','pickaxe','拿起镐子连续凿击三次，末击震退',{pulses:3,repeatPose:true,damage:23,range:175}),D('鲨尾回拍','counter','shark','鲨尾架势，近身命中触发反击'),D('七海大鲨鱼','summon','shark','召唤巨型鲨鱼穿过战场并击飞',{size:260,speed:680,damage:190})]],
'三角初华':['星空独唱','一起去看星星吧。',[
 D('sumimi 双重奏','projectile','note','上下两道音符，第二发稍后抵达',{count:2,spread:26}),D('星空相约','trap','star','前方星光定点爆开并减速'),D('初华的应答','counter','mic','短暂守势，近击触发麦克风回响'),D('Doloris 独唱','rain','star','星光依次落向三处位置',{count:9,damage:24,spread:110})]],
'东北雨姐':['四个菜开造','简简单单，开造！',[
 D('大锅翻炒','heavy','pan','抡锅拍击，中距离打断',{range:170,damage:63}),D('酸菜投喂','throw','cucumber','抛物线投菜，砸地溅开',{size:58,splash:85}),D('开饭了','buff','pot','站稳补给，回复生命并短时减伤',{heal:48,buffTime:6,defense:.85}),D('一顿四个菜','rain','pot','四口热锅分批落下，地面预警后砸击',{count:4,damage:52,spread:125})]],
'东雪莲':['雪莲翻唱','莲莲准备好了。',[
 D('莲式咬字','projectile','note','曲折声波，命中短暂减速',{wave:18,slow:.7}),D('冰莲落点','trap','ice','种下冰晶，在脚下触发霜冻'),D('雪中换气','buff','flower','短暂吟唱，回气并加快移动',{energy:22,buffTime:5,speedBoost:1.12}),D('莲声返场','barrage','note','音符交错前行，逐发扩大音域',{count:6,damage:31,spread:28})]],
'丰川祥子':['命运的键盘手','这是最后的机会。',[
 D('客服接通','projectile','keyboard','键盘声波两连发',{count:2,damage:25}),D('大小姐的休止符','trap','note','休止符封住前方落点，触发减速'),D('命运排练','buff','piano_keys','八秒技能冷却恢复加快',{buffTime:8,cooldownBoost:1.4}),D('忘却的命运舞台','rain','piano_keys','四排琴键从空中依次压下',{count:8,damage:26,spread:95})]],
'乃琳':['奶淇琳主持人','下一位幸运观众。',[
 D('奶淇琳投送','throw','parfait','抛出奶淇琳，落地后范围溅射',{splash:75}),D('蓝天白云','rain','ice','三次抽卡蓝光砸向对手刚才的位置',{count:3,damage:22,spread:42}),D('乃琳来主持','buff','mic','回气并获得六秒减伤',{energy:18,buffTime:6,defense:.88}),D('全场奶淇琳','barrage','parfait','五份奶淇琳分高低路线发射',{count:5,damage:38,spread:32})]],
'乔希':['Xz乔希 · 抽象剪辑师','这一段，剪进去了。',[
 D('关键帧投送','throw','flyer','抛出剪辑帧，命中后短暂减速',{slow:1}),D('一键分身','summon','clone','当前角色的分身从侧面追击',{summonId:6,damage:45}),D('时间轴倒带','buff','gear','补回生命，接下来六秒冷却恢复更快',{heal:28,buffTime:6,cooldownBoost:1.5}),D('抽象宇宙混剪','barrage','mixed','交替放出鲨鱼、绿冻和舞台音符',{count:6,damage:32,sequence:['shark','slime','note'],size:95})]],
'仲町阿拉蕾':['梦限大主唱','直播开始，听到我的声音了吗！',[
 D('元气开麦','projectile','mic','掷出麦克风，命中回气',{energyOnHit:6}),D('舞台再起步','dash','note','向前突进，留下音符尾迹'),D('梦想不掉线','buff','star','回气并提升六秒移动速度',{energy:18,buffTime:6,speedBoost:1.2}),D('开播！梦限大主唱','transform','mic','切换开播虚拟形象十秒，开场高音震荡并强化普攻',{form:'dream_arale',formTime:10,attackBoost:1.2,damage:0,openingFx:'note',openingDamage:118,openingRange:330})]],
'八幡海铃':['三十团支援贝斯','排期已经安排好了。',[
 D('三团急援','barrage','note','三段低音从不同高度袭来',{count:3,damage:22,spread:24}),D('职业低音','counter','note','守住站位，近击触发重低音反击'),D('排期表','trap','flyer','前方放置排期表，踩中会被减速'),D('三十团同时开演','barrage','note','十段密集低音支援，各击有连段衰减',{count:10,damage:23,interval:.085})]],
'冬马和纱':['届不到的钢琴','为什么这么熟练……',[
 D('熟练琴键','projectile','piano_keys','快速双琴键，命中形成两连段',{count:2,damage:24}),D('冬日独奏','upper','ice','升空带出冰晶，适合对空'),D('届不到的距离','dash','piano_keys','突然向前滑步，琴键击退'),D('届不到的爱恋','beam','piano_keys','整排琴键化成横贯舞台的音浪')]],
'凑友希那':['Roselia 的猫控','拿出你的觉悟。',[
 D('蓝蔷薇音阶','projectile','blue_rose','蓝色蔷薇花瓣绕波前进',{wave:30}),D('猫咪注意','summon','clone','召唤小猫短促扑击',{summonId:47,size:100}),D('歌唱的觉悟','buff','mic','六秒强化攻击，出招更有压迫感',{buffTime:6,attackBoost:1.2}),D('Roselia 咆哮','beam','blue_rose','蓝色蔷薇声浪贯穿前方')]],
'千早爱音':['ANON TOKYO','我也要站在最前面。',[
 D('ANON TOKYO','projectile','star','粉色舞台星飞向前方'),D('爱音式开溜','dash','note','快速滑步突进；收招可重新走位'),D('主角聚光灯','buff','star','七秒提高回气和移动速度',{buffTime:7,energy:15,speedBoost:1.15}),D('名字由我来起','barrage','star','五颗粉色星光依次射出',{count:5,damage:39})]],
'千石由乃':['省电 AI 音控师','正在思考……生成完成。',[
 D('由乃AI·生成中','projectile','ai_chip','发出两枚推理芯片，命中后减速',{count:2,damage:24,slow:1,size:70}),D('省电推理模式','buff','ai_chip','回20气，六秒技能冷却恢复加快',{energy:20,buffTime:6,cooldownBoost:1.5}),D('AI一键分身','summon','clone','生成当前形态的由乃分身，向前追击',{summonId:12,damage:52,size:160}),D('开播！由乃AI启动','transform','ai_chip','切换开播虚拟形象十秒，释放推理脉冲并强化普攻',{form:'dream_yuno',formTime:10,attackBoost:1.2,damage:0,openingFx:'ai_chip',openingDamage:115,openingRange:330})]],
'古振兴':['迷你方块工坊','迷你世界，开造！',[
 D('迷你方块投掷','throw','mini_block','投出浅绿草纹方块，沿抛物线落下',{bounce:1,size:62}),D('迷你围墙','wall','mini_block','搭出可被打碎的阻挡墙，持续四秒',{wallHp:95}),D('迷你弹跳台','upper','mini_block','踩着迷你方块跃起对空'),D('迷你创世阵','rain','mini_block','多处彩色迷你方块从空中落下',{count:7,damage:29,spread:150,size:88})]],
'叮咚鸡':['空耳通知员','叮咚鸡，大狗叫！',[
 D('叮咚通知','projectile','note','两声通知波，前后间隔发射',{count:2,damage:25}),D('大狗叫','summon','clone','召唤炫狗冲过地面',{summonId:39,size:150}),D('袋鼠鸡','counter','kangaroo_chicken','袋鼠鸡架势，举爪格挡后蹬腿反击'),D('全城听通知','barrage','note','高低交替的六段广播波',{count:6,damage:33,spread:40})]],
'向晚':['顶碗人','水母也有自己的梦想。',[
 D('空碗冲冲','dash','empty_bowl','顶着空碗短距离冲撞'),D('水母有梦','summon','jellyfish','水母在半空缓慢漂过，命中减速',{wave:35,speed:250,slow:1.6,size:115}),D('顶碗节拍','buff','empty_bowl','敲响空碗，回复20气并短时减伤',{energy:20,buffTime:5,defense:.84}),D('梦的水母海','rain','jellyfish','水母沿多个落点降下',{count:6,damage:35,spread:125,size:120})]],
'嘉然':['嘉心糖投喂员','今天也要元气满满！',[
 D('嘉心糖飞吻','projectile','heart','心形糖果命中后回复少量生命',{healOnHit:10}),D('小恶魔俯冲','slam','crescent','跃起后踢落，震退附近对手'),D('干饭时间','buff','rice_meal','吃一份米饭套餐，回复生命',{heal:60,buffTime:4}),D('二十连宅舞','burst','heart','六个舞步连续打击近身对手，留下爱心轨迹',{pulses:6,damage:32,range:205})]],
'四时小路':['凌晨四点的路口','演出地点，等你来找。',[
 D('路口禁止通行','wall','sign','竖起红色禁行牌，可被击碎',{wallHp:90}),D('手绘演出传单','throw','flyer','连抛两张传单，命中减速',{count:2,damage:24,slow:1}),D('凌晨四点开播','trap','mic','麦克风在落点埋伏，接近后声波炸开'),D('没有地址的演唱会','rain','flyer','传单与音符依次落下',{count:8,damage:26,spread:150,sequence:['flyer','note']})]],

'奶蛙':['齁齁齁大肚王','齁齁齁！',[
 D('齁齁笑波','projectile','breath','大笑气团贴地前进',{offset:42,size:95}),D('肚皮顶顶','dash','wave','用大肚皮向前顶撞'),D('绷不住了','buff','breath','六秒减伤并增加攻击力',{buffTime:6,defense:.88,attackBoost:1.13}),D('全场齁齁齁','burst','breath','四次扩散笑声，范围逐次扩大',{pulses:4,damage:49,range:290})]],
'奶龙':['大吃货小机灵','我才是奶龙！',[
 D('奶龙喷火','projectile','flame','短距离火团，持续向前推进',{size:105,speed:370,life:1.3}),D('Duang 肚皮','counter','wave','肚皮格挡架势，近身反弹'),D('一口补给','buff','parfait','吃饱回复生命并短暂增伤',{heal:40,buffTime:5,attackBoost:1.13}),D('奶龙大跳','slam','flame','高跳落地，火花与震波击倒周围')]],
'孙笑川':['6324 带明星','儒雅随和。',[
 D('键盘传话','throw','keyboard','把键盘抛向对手脚边',{size:76}),D('儒雅随和','counter','flower','守势后回击，并多获得气槽'),D('带师的鼓励','buff','mic','恢复气槽，短时加强攻击',{energy:20,buffTime:6,attackBoost:1.16}),D('6324 全体起立','rain','keyboard','六组键盘依次砸向舞台',{count:6,damage:35,spread:140})]],
'宫永野乃花':['暴走兔子吉他手','兔子也会咬人哦！',[
 D('自由拨弦','projectile','note','弯曲音符绕波前进',{wave:38}),D('暴走兔兔咬','dash','rabbit_bite','变成兔子向前扑咬，命中后击退',{form:'rabbit',damage:63,range:125,duration:.85}),D('气氛制造机','buff','flower','七秒提升移动速度，回复气槽',{energy:15,buffTime:7,speedBoost:1.2}),D('开播！兔兔不营业','transform','rabbit_bite','切换开播虚拟形象十秒，兔兔声浪爆发并强化普攻',{form:'dream_nonoka',formTime:10,speedBoost:1.15,attackBoost:1.18,damage:0,openingFx:'rabbit_bite',openingDamage:118,openingRange:300})]],
'小木曾雪菜':['白色相簿主唱','为什么会变成这样呢。',[
 D('白色相簿','projectile','flyer','相簿页飞过，绕出雪花轨迹',{wave:18}),D('第一次的歌声','burst','note','两段近距高音爆发',{pulses:2,damage:31}),D('雪中的约定','buff','ice','回气并恢复少量生命',{energy:22,heal:25,buffTime:5}),D('届不到的合唱','barrage','note','三组双音，前后交错命中',{count:6,damage:34,spread:30})]],
'小松绿':['植物园搬运工','松柏扛起来，植物都到位！',[
 D('球果投递','throw','pinecone','抛出裸子植物球果，落地弹跳一次',{bounce:1,size:62,damage:43}),D('蕨叶回旋','projectile','fern','羽状蕨叶飞出后折返，可命中两次',{returning:true,damage:28,size:95}),D('竹芋飞叶','barrage','prayer_leaf','三片宽大竹芋叶沿高低路线飞出',{count:3,damage:22,spread:24,size:80}),D('松柏扛鼎','dash','conifer','扛起整株松柏，挥树横扫后冲撞击倒',{damage:190,range:205,duration:1.35,start:.5})]],
'尼古喵喵':['烟雾猫娘','呼——喵。',[
 D('烟圈弹','projectile','smoke','烟圈缓慢前进，命中减速',{slow:1.2,speed:340,size:90}),D('猫步穿烟','dash','smoke','穿过烟幕冲刺，起步短暂无敌',{invuln:.18}),D('吸一口','buff','smoke','八秒攻击提高 18%、移速提高 12%，回 15 气',{buffTime:8,attackBoost:1.18,speedBoost:1.12,energy:15}),D('尼古领域','burst','smoke','四段烟云爆发，命中附带减速',{pulses:4,damage:47,range:285,slow:1.8})]],
'山泥若':['永远滴神解说','乌兹，永远滴神！',[
 D('神的赞歌','projectile','mic','解说声浪直线击退'),D('提前举杯','buff','trophy','回气并强化六秒攻击',{energy:20,buffTime:6,attackBoost:1.18}),D('赛点反击','counter','trophy','举杯守势，近击触发重击'),D('永远滴神','beam','trophy','金色应援声浪贯穿前方')]],
'峰月律':['无限食欲吉他手','先把这一大串吃完！',[
 D('巨串横扫','heavy','meat_skewer','握住巨大肉串横扫，长距离重击',{damage:63,range:205}),D('美食无限续盘','buff','feast','连续吃下多种美食，回复生命并强化攻击',{heal:55,buffTime:7,attackBoost:1.16}),D('饱腹冲锋','dash','meat_skewer','扛着大肉串向前冲刺',{damage:60,range:165,duration:.7}),D('开播！律动盛宴','transform','feast','切换开播虚拟形象十秒，盛宴气浪震退周围敌人',{form:'dream_ritsu',formTime:10,attackBoost:1.22,damage:0,openingFx:'meat_skewer',openingDamage:120,openingRange:300})]],
'张顺飞':['八分钱起飞员','飞起来了！',[
 D('飞八分钱','projectile','coin','抛出两枚八分钱，速度快、后摇短',{count:2,damage:24,speed:660,size:40}),D('番茄连投','throw','tomato','三颗番茄接连落地溅射',{count:3,damage:19,splash:65,size:52}),D('召唤飞马','summon','pegasus','白色飞马扇翅俯冲',{size:160,speed:470}),D('飞马带我起飞','summon','pegasus','巨型飞马横穿舞台并击飞命中目标',{size:270,speed:720,damage:190})]],
'恬豆':['禧运楼小老板','Bekki，把小飞机拿上来！',[
 D('豆豆的小飞机','projectile','plane','纸飞机曲线飞行，可穿过一发普通飞弹',{wave:16,pierce:1,size:70}),D('虚空电焊枪','beam','feather','羽毛画出的短红线迅速穿刺',{damage:53,range:380,duration:.6,cd:5.2}),D('豆豆知道了','counter','breath','短暂守势后回击'),D('小飞机全部起飞','barrage','plane','六架小飞机上下穿插',{count:6,damage:32,spread:38,size:90})]],
'文静':['静栗惹拆弹专家','晴天总比雨天多。',[
 D('静栗惹投递','throw','chestnut','一颗栗子弹地一次后继续前进',{bounce:1}),D('拆弹专家','trap','gear','在前方布置延时节拍陷阱'),D('静静拆解','counter','gear','架势期间反弹普通飞行道具',{reflect:true}),D('晴天倒计时','rain','chestnut','栗子从预警落点连续落下',{count:8,damage:26,spread:130})]],
'明前奶绿':['奶糖花店员','花店今天也营业。',[
 D('奶糖花速递','throw','flower','抛出花束，落地散成范围花瓣',{splash:85}),D('花店调饮','buff','tea','回复生命并恢复气槽',{heal:38,energy:15,buffTime:4}),D('花香留客','trap','flower','花束在地面绽放，命中减速'),D('花店满开','rain','flower','九束奶糖花依次落下',{count:9,damage:24,spread:150})]],
'星瞳':['冰上小星星','一起滑向星光。',[
 D('冰刃转身','dash','ice','低姿冰上滑步，留下冰晶轨迹'),D('小星星投送','projectile','star','两颗星光以不同高度前进',{count:2,damage:24,spread:20}),D('花滑旋转','burst','ice','三圈近身冰晶旋转',{pulses:3,damage:22}),D('冰上星河','rain','ice','星光与冰晶交替坠落',{count:8,damage:26,sequence:['star','ice'],spread:150})]],
'李老八':['球王庆祝大师','Siu——！',[
 D('七号射门','projectile','ball','低平球沿地面冲出',{offset:57,size:65,speed:720}),D('单车踩步','dash','ball','交替踩步后快速冲刺'),D('懂球时刻','counter','trophy','看准近身攻击后反击'),D('SIU 庆祝落地','slam','ball','跃起庆祝后落地震荡，足球同时弹射',{damage:175,extraShot:'ball'})]],
'柚恩':['柚大侠 · 马头模式','马头，出动！',[
 D('黑八推杆','projectile','eightball','一颗黑八球高速沿低位飞出',{offset:42,speed:670,size:45}),D('柚大侠踏步','dash','crescent','向前踏步，甩出紫色弧光'),D('马头变身','transform','horse','变成马头六秒，移速与普攻增强',{form:'horse',formTime:6,speedBoost:1.25,attackBoost:1.18}),D('马头大冲撞','dash','horse','马头形态蓄势后长距离冲撞',{form:'horse',damage:190,duration:1.15})]],
'椎名立希':['严格的节拍器','哈？跟上拍子。',[
 D('哈？重拍','burst','note','鼓点近身爆开并打断'),D('立希式加速','dash','crescent','踏鼓点向前快速突进'),D('节拍警戒','counter','note','守住节拍，反击靠近者'),D('鼓点不能停','burst','note','六段密集鼓击，末拍击倒',{pulses:6,damage:32,range:235})]],
'永雏塔菲':['关注谢谢喵','关注永雏塔菲，谢谢喵！',[
 D('齿轮谢谢喵','projectile','gear','飞旋齿轮命中后折返',{returning:true,damage:30}),D('小幽灵 Guri','summon','ghost','小幽灵起伏前进，命中回少量气',{wave:30,speed:290,size:105,energyOnHit:6}),D('蒸汽热水器','trap','smoke','脚边蒸汽阵，接近后喷发'),D('全站关注谢谢喵','barrage','gear','齿轮与幽灵交替冲过舞台',{count:6,damage:33,sequence:['gear','ghost'],size:80})]],
'汤圆':['碗中表情包','快到碗里来。',[
 D('汤圆弹弹','projectile','dumpling','白团子低空前进并轻轻弹跳',{wave:20,size:58}),D('碗口吸引','grab','pot','近身抓投，无视格挡'),D('回碗补汤','buff','pot','补回生命并获得短时减伤',{heal:45,buffTime:5,defense:.85}),D('快到碗里来','burst','pot','碗口涟漪连续三次吸住近敌',{pulses:3,damage:64,range:255,pull:true})]],
'灰泽满':['绿冻应援团','绿冻，跟上！',[
 D('扔绿冻','throw','slime','绿色果冻弹地两次；命中附带减速',{bounce:2,slow:1.2,size:70}),D('绿冻集合','summon','slime','果冻蹦跳着从地面向前扑',{wave:12,offset:52,size:95,speed:280}),D('绿冻补给','buff','slime','回复生命，六秒减伤',{heal:40,buffTime:6,defense:.85}),D('满屏绿冻','rain','slime','八只绿冻陆续落地并溅射',{count:8,damage:25,spread:150,splash:75,size:90})]],
'炫狗':['犬形游龙','不赖！',[
 D('龙吟狗叫','projectile','breath','尖锐叫声曲线飞行',{wave:18}),D('炫狗追步','dash','crescent','低姿快速前扑'),D('犬影支援','summon','clone','再叫出一只犬形分身追击',{summonId:39,size:120}),D('狗叫游龙','dash','breath','连续残影向前疾冲，结束时震开对手',{duration:1.25,damage:188})]],
'炫神':['Last 炫 · 杰斯玩家','你的青春，无限复活。',[
 D('炫步','dash','crescent','踏步快速位移，起步短暂无敌',{invuln:.15,damage:47}),D('游龙','dash','dragon','长距离游龙突进，蓝金尾迹',{duration:.72,damage:64,cd:6}),D('杰斯变身','transform','jayce','八秒切换为杰斯；J 锤击、K 远程炮',{form:'jayce',formTime:8,attackBoost:1.15}),D('杰斯爆杀流','barrage','jayce','杰斯炮形态连续轰出三发加速炮',{count:3,damage:67,speed:820,size:110,form:'jayce',duration:1.25})]],
'牛妈妈':['牛来召唤者','牛来——！',[
 D('牛角护犊','dash','crescent','压低头角向前撞击'),D('妈妈跺蹄','burst','wave','用前蹄砸地，近身震退'),D('牛来快来','summon','clone','张口呼喊并召唤牛来向前冲',{summonId:42,size:165}),D('牛家总动员','summon','clone','召唤强化牛来，带着金色冲击波冲锋',{summonId:42,size:215,speed:650,damage:188})]],
'牛来':['妈妈召唤者','妈妈——！',[
 D('牛来顶顶','dash','crescent','俯身用头角冲撞'),D('小牛扬蹄','upper','wave','向上抬蹄踢起，克制跳入'),D('妈妈救我','summon','clone','双手拢嘴呼喊，牛妈妈从身后入场',{summonId:41,size:175}),D('妈妈来啦','summon','clone','牛妈妈带着金色气浪一路冲锋',{summonId:41,size:225,speed:630,damage:190})]],
'珈乐':['红高跟狼影','狼王，登场。',[
 D('红色高跟鞋','heavy','heel','红高跟踢出长弧，较远距离击退',{range:185,damage:62}),D('皇珈骑士','counter','crescent','狼爪架势，反击来袭近击'),D('狼形态','transform','wolf','变为紫灰狼六秒，移速和普攻增强',{form:'wolf',formTime:6,speedBoost:1.27,attackBoost:1.2}),D('月下狼袭','dash','wolf','狼形态飞扑长距离，重击击倒',{form:'wolf',damage:192,duration:1.05})]],
'电棍':['otto · 急眼轮椅手','韭菜盒子呢？轮椅，启动！',[
 D('急眼了','buff','rage','原地急眼，八秒攻击提高20%，加快回招',{buffTime:8,attackBoost:1.2,cooldownBoost:1.2,energy:12}),D('韭菜盒子补给','buff','chive_pie','吃下韭菜盒子，回复55生命和10气',{heal:55,energy:10,buffTime:4,defense:.9}),D('轮椅小漂移','dash','wheelchair','坐上轮椅向前快速撞击',{form:'wheelchair',damage:62,duration:.8,start:.28}),D('轮椅冲刺！冲！','dash','wheelchair','坐稳轮椅，全速横穿战场并击倒',{form:'wheelchair',damage:192,duration:1.3,start:.4})]],
'祐天寺若麦':['喵梦热度鼓手','镜头，给到我！',[
 D('美妆快门','projectile','star','闪光快门瞬间打出两发星点',{count:2,damage:24}),D('话题突进','dash','flyer','向前冲入镜头范围'),D('热度运营','buff','mic','六秒加速回气和冷却',{energy:18,buffTime:6,cooldownBoost:1.35}),D('热搜鼓点','rain','star','闪光快门从多处落下',{count:8,damage:26,spread:135})]],
'管理员企鹅':['咕咕嘎嘎小管','咕咕，嘎嘎！',[
 D('咕咕嘎嘎','projectile','breath','两团咕嘎声波前后飞出',{count:2,damage:24,size:75}),D('起恶服滑行','dash','ice','企鹅服趴低滑行，经过处留下冰屑'),D('小管贴贴','grab','bandage','张开翅膀近身抱摔，可破格挡'),D('咕嘎施工队','summon','clone','两只小管企鹅接连冲锋',{summonId:46,count:2,damage:94,size:170,speed:590})]],
'耄耋':['哈气警告员','哈——！',[
 D('哈气警告','projectile','breath','喷出大团白气，短距离压制',{size:105,life:1.1,speed:330}),D('猫爪突袭','dash','crescent','突然扑上前抓挠'),D('飞机耳警戒','counter','breath','缩耳防守后反爪近敌'),D('全功率哈气','beam','breath','张嘴吐出巨大哈气波')]],
'若叶睦':['黄瓜与 Mortis','我没有觉得开心过。',[
 D('黄瓜投递','throw','cucumber','连抛两根黄瓜，抛物线不同',{count:2,damage:24}),D('庭院黄瓜架','wall','plant','长出可被破坏的黄瓜架',{wallHp:90}),D('Mortis 接管','buff','crescent','八秒普攻增强，技能冷却加快',{buffTime:8,attackBoost:1.18,cooldownBoost:1.25}),D('Mortis 独奏','burst','crescent','三轮绿色弦刃扩散',{pulses:3,damage:64,range:270})]],
'薇欧拉':['妖精花束的暗面','好戏，现在开始。',[
 D('剪辑切片','throw','flyer','剪辑片段抛出，命中减速',{slow:1.1}),D('炎上火苗','trap','flame','前方火苗陷阱，踩中爆开'),D('舞台操盘','counter','flower','花束守势，反击来袭近击'),D('网络各处的火','rain','flame','不同落点依次点燃，躲开预警即可回避',{count:8,damage:26,spread:145})]],
'藤都子':['九字护身键盘手','临兵斗者皆阵列在前！',[
 D('式神出阵','projectile','talisman','纸式神向前飞行，命中后减速',{wave:18,slow:1}),D('符纸连投','barrage','talisman','三枚符纸沿不同高度飞出',{count:3,damage:22,spread:24}),D('九字护身法','burst','nine_seal','结九字手印，召唤护身阵法三段震荡',{pulses:3,damage:24,range:230,phrase:'临兵斗者皆阵列在前'}),D('开播！九字结界','transform','nine_seal','切换开播虚拟形象十秒，喊出临兵斗者皆阵列在前并召唤九字阵法',{form:'dream_miyako',formTime:10,attackBoost:1.2,damage:0,openingFx:'nine_seal',openingDamage:130,openingRange:360,phrase:'临兵斗者皆阵列在前'})]],
'袋鼠':['黄色外卖头像','胆子真是肥嘟嘟的。',[
 D('外卖速达','throw','pot','外卖碗沿弧线飞过去',{size:72,splash:70}),D('一星评价','trap','star','丢下一颗评价星，踩中减速'),D('这单我来接','dash','flyer','抢单式快速突进'),D('袋鼠超级配送','barrage','pot','四份外卖高速冲来',{count:4,damage:48,spread:28,size:90})]],
'要乐奈':['抹茶流浪猫','有趣的女人。',[
 D('抹茶芭菲','throw','parfait','芭菲抛物线飞出，落地散开',{splash:80}),D('有趣的女人','dash','crescent','流浪猫般突然贴近'),D('抹茶补充','buff','tea','恢复生命，短暂提升脚步速度',{heal:40,buffTime:5,speedBoost:1.2}),D('野猫即兴','barrage','note','六弦音符交错飞过',{count:6,damage:33,spread:35})]],
'诗歌剧':['待兼诗歌剧 · 曼波','曼波！',[
 D('曼波拍手','burst','note','两拍近身声浪',{pulses:2,damage:31}),D('翻车鱼出游','summon','sunfish','圆圆翻车鱼摇摆着前进',{wave:28,size:125,speed:360}),D('诗宝起跑','dash','crescent','赛马娘起跑冲刺，留下星光'),D('曼波终点线','dash','note','冲向终点，尾迹连续蹦出曼波音符',{duration:1.18,damage:192})]],
'说的道理':['倒放道理复读机','说的道理。',[
 D('道理正放','projectile','breath','大嘴声波向前扩散',{size:100}),D('道理倒放','projectile','breath','声波飞出后折返',{returning:true,damage:29}),D('听我讲完','counter','mic','近身打断会触发反击'),D('道理无限复读','barrage','breath','七段复读声波上下交错',{count:7,damage:28,spread:30})]],
'贝利亚':['银河皇帝','黑暗，降临。',[
 D('贝利亚之爪','heavy','crescent','巨爪划出红黑弧线',{range:180,damage:64}),D('黑暗冲锋','dash','darkflame','带着黑红火焰疾冲'),D('帝王领域','trap','darkflame','在前方布置黑暗能量点'),D('帝斯修姆光线','beam','darkflame','交叉双臂放出红黑贯穿光线')]],
'贝拉':['勇敢牛牛','勇敢牛牛，不怕困难！',[
 D('平底锅招架','counter','pan','举锅招架，能反弹普通飞行道具',{reflect:true}),D('充气锤锤','heavy','hammer','大幅挥下充气锤，范围重击',{range:185,damage:67}),D('勇敢牛牛冲','dash','hammer','举锤向前勇敢冲锋'),D('锅锤双打','burst','hammer','平底锅与充气锤交替四击',{pulses:4,damage:48,range:245,sequence:['pan','hammer']})]],
'踩背象':['一二三踩踩背','一二三，一二三！',[
 D('第一脚','heavy','wave','抬脚重踩，地面扩散',{range:175,damage:61}),D('象鼻通知','projectile','breath','象鼻吹出前进气团',{size:100,speed:350}),D('专业踩背','grab','wave','近身抓投，踩背破防'),D('一二三踩踩背','burst','wave','三次重踩，最后一脚击倒',{pulses:3,damage:65,range:270})]],
'长崎素世':['一切为了乐队','这一切，都是为了乐队。',[
 D('红茶邀请','throw','tea','红茶落地后短暂减速',{slow:1.5,splash:70}),D('温柔牵引','grab','note','贴身牵引抓投，突破格挡'),D('为了乐队','counter','flower','守住阵地，反击并回气'),D('过去的回响','burst','note','三轮低音将范围内对手拉近',{pulses:3,damage:63,range:300,pull:true})]],
'闹吃':['Notch 方块造物者','我的世界，方块说话。',[
 D('草方块投掷','throw','mc_block','扔出方正的草地泥土方块',{bounce:1,size:62}),D('三格搭高','wall','mc_block','叠起三格方块墙，可被打碎',{wallHp:110}),D('方块起跳','upper','mc_block','脚踩草方块升空，向上顶击'),D('创世方块雨','rain','mc_block','八个大方块从预警位置落下',{count:8,damage:27,spread:150,size:85})]],
'阿梓':['小孩梓声乐课','唱歌、笑声，还有这一坨梓！',[
 D('梓声独唱','projectile','note','张口唱歌，三段音符声浪依次前行',{count:3,damage:21,spread:18}),D('哈哈哈哈梓','burst','laughter','大笑发出三圈近身声波',{pulses:3,damage:23,range:185}),D('梓哇乱叫','beam','scream','大叫发出直线声浪，强力击退',{damage:55,range:450,duration:.9,cd:6}),D('接好这坨梓','throw','tuozi','举起坨梓掷向对手，落地后范围震荡',{size:170,splash:155,damage:185,speed:460,duration:1.25})]],
'露早':['GOGO 百变队长','路翼上线，小早冲冲冲！',[
 D('路翼上线','transform','luyi','变为路翼八秒，移动与普通攻击强化',{form:'luyi',formTime:8,attackBoost:1.15,speedBoost:1.18}),D('小早冲击','summon','xiaozao','召唤小早迈步冲向对手',{size:140,speed:520,damage:57,groundArt:true}),D('屋顶着火','projectile','flame','发射火焰，命中后持续燃烧四秒',{size:105,speed:440,damage:32,burn:4,burnDamage:8,cd:6}),D('路翼全速前进','dash','luyi','变身路翼并全速冲撞，命中后击倒',{form:'luyi',damage:188,range:155,duration:1.3})]],
'高松灯':['企鹅石头收藏家','一辈子，组乐队。',[
 D('珍藏小石头','throw','stone','抛出小石头，弹地一次',{bounce:1,size:48}),D('企鹅创可贴','buff','bandage','贴上创可贴，回复生命和少量气',{heal:42,energy:12,buffTime:4}),D('企鹅朋友','summon','clone','召唤高松灯企鹅向前跑来',{summonId:63,size:150}),D('诗超绊','beam','note','展开笔记，用诗歌声浪连起整个舞台')]],
'高松灯企鹅':['企鹅诗人','咕嘎，一辈子。',[
 D('企鹅小石头','throw','stone','小石头以低弧线弹向前方',{bounce:2,size:48}),D('肚皮溜冰','dash','ice','压低企鹅身形快速滑行'),D('企鹅创可贴','buff','bandage','恢复生命并回气',{heal:42,energy:12,buffTime:4}),D('企鹅诗超绊','barrage','stone','诗歌音符与珍藏石头交替射出',{count:6,damage:33,sequence:['stone','note'],size:65})]],
};
const templates={
 throw:{damage:43,range:900,start:.24,duration:.58,cd:3.5},
 summon:{damage:57,range:900,start:.32,duration:.7,cd:6.2},
 buff:{damage:0,range:0,start:.4,duration:.85,cd:12},
 transform:{damage:0,range:0,start:.38,duration:.8,cd:14},
 wall:{damage:0,range:180,start:.28,duration:.62,cd:7},
 rain:{damage:24,range:900,start:.5,duration:1.2,cd:6.4}
};
Object.assign(window.FIGHTER_TYPES,templates);
for(const c of ROSTER){
 const data=cast[c.name];if(!data)throw Error('缺少梗技能：'+c.name);
 c.title=data[0];c.quote=data[1];c.memeVersion=2;
 c.skills=c.skills.slice(0,2).concat(data[2].map((s,j)=>{
  const i=j+2,superMove=i===5,t={...window.FIGHTER_TYPES[s.type],type:s.type,...s,key:['U','I','O','L'][j],super:superMove};
  if(!t.duration)t.duration=.65;if(!t.start)t.start=.2;
  if(superMove){t.cd=0;t.damage=s.damage??(['barrage','rain'].includes(s.type)?35:s.type==='burst'&&s.pulses?Math.round(190/s.pulses):190);t.range=['burst','slam'].includes(s.type)?(s.range||270):(s.range||t.range);t.duration=Math.max(t.duration,s.type==='dash'?1.12:1.15);t.start=s.start??(s.type==='slam'?.65:.34);}
  if(!superMove&&['beam','barrage'].includes(s.type)){t.cd=s.cd||5.5;t.damage=s.damage||52;t.duration=s.duration||.75;}
  if(t.count)t.duration=Math.max(t.duration,t.start+(t.count-1)*(t.interval||.14)+.3);
  if(t.pulses)t.duration=Math.max(t.duration,t.start+(t.pulses-1)*.17+.25);
  if(!superMove&&c.trait==='flow')t.cd=+(t.cd*.88).toFixed(1);
  t.desc=s.desc+(superMove?'；消耗 100 气':'');return t;
 }));
 c.skills[0].fx='crescent';c.skills[1].fx=c.skills[2].fx;
 if(c.name==='七海')Object.assign(c.skills[1],{name:'ybb',fx:'scream',desc:'喊出 ybb，重击声浪震退近身对手',range:155});
 if(c.name==='藤都子')Object.assign(c.skills[1],{name:'背后巨羊羹',fx:'giant_yokan',desc:'从背后拿出巨大的巨羊羹，横扫砸击',range:195,start:.24,duration:.64});
 if(c.name==='丰川祥子')c.skills[1].fx='piano_keys';
 if(c.name==='电棍')c.skills[1].fx='rage';
 if(c.name==='闹吃')c.glyph='块';if(c.name==='古振兴')c.glyph='迷';if(c.name==='灰泽满')c.glyph='冻';if(c.name==='柚恩')c.glyph='马';if(c.name==='管理员企鹅')c.glyph='嘎';
}
window.MEME_CAST=cast;
})();
