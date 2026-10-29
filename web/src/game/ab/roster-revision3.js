/* Current roster and move revisions. Stable IDs identify summons independently of display order. */
(()=>{
 const removed=new Set(['文静','恬豆','贝利亚']);
 window.ROSTER=ROSTER.filter(c=>!removed.has(c.name));
 const byName=name=>ROSTER.find(c=>c.name===name);
 const edit=(name,index,change)=>Object.assign(byName(name).skills[index],change);
 const clearMove=(name,index,move)=>{const old=byName(name).skills[index];byName(name).skills[index]={key:old.key,super:old.super,...move};};
 clearMove('藤都子',3,{name:'练起来',type:'dash',fx:null,damage:48,range:115,start:.13,duration:.6,cd:4.4,desc:'向面朝方向跑步突进，碰到对手造成物理撞击'});
 edit('藤都子',2,{name:'巨羊羹投掷',type:'throw',fx:'giant_yokan',wave:0,size:150,speed:460,offset:-45,start:.3,duration:.76,suppressCue:true,desc:'双手把巨羊羹向前抛出，沿弧线飞行，命中后减速'});
 for(const i of [4,5])edit('藤都子',i,{silentPhrase:true});
 edit('藤都子',5,{desc:'切换开播虚拟形象十秒，结印召唤九字护身阵法；消耗 100 气'});
 edit('小松绿',2,{name:'裸子投递'});edit('小松绿',5,{name:'裸子植物'});
 ['不怕困难','牛牛重锤','牛牛冲冲','勇敢牛牛'].forEach((name,i)=>edit('贝拉',i+2,{name}));
 edit('贝拉',0,{name:'牛牛直拳'});edit('贝拉',1,{name:'勇气重踢'});
 byName('贝拉').glyph='不怕困难';
 edit('贝拉',2,{fx:null,desc:'举起黑色平底锅招架，反击近身攻击并弹回飞行道具'});
 for(const i of [3,4,5])edit('贝拉',i,{fx:'black_hammer'});
 edit('踩背象',4,{name:'老爷爷'});edit('踩背象',5,{name:'踩踩背'});
 edit('若叶睦',3,{fx:'cucumber_wall',desc:'在前方立起由黄瓜组成的可破坏障碍'});
 for(const s of byName('奶蛙').skills){s.noIcons=true;s.fx=null;delete s.sequence;}
 edit('山泥若',2,{name:'冰！',fx:'ice',slow:1.3,desc:'喊出“冰！”，射出冰晶，命中减速',phrase:'冰！'});
 clearMove('山泥若',3,{name:'牢内',type:'trap',fx:'prison_bars',damage:42,range:210,start:.3,duration:.65,cd:6.4,slow:1.8,desc:'在前方设下铁栏陷阱，踏入后受击并减速'});
 for(const s of byName('星瞳').skills.slice(2)){s.fx='yellow_star';if(s.sequence)s.sequence=['yellow_star'];}
 edit('星瞳',2,{desc:'转身滑步突进，以黄色星光表现技能'});
 edit('星瞳',4,{desc:'三圈黄色星光旋转，连续命中近处对手'});
 edit('星瞳',5,{desc:'黄色星星接连坠落；消耗 100 气'});
 clearMove('永雏塔菲',3,{name:'菲球冲击',type:'throw',fx:'feiqiu',damage:57,range:900,start:.28,duration:.7,cd:5.2,speed:380,size:85,splash:65,energyOnHit:6,desc:'扔出带护目镜的菲球，命中回复少量气'});
 edit('永雏塔菲',5,{name:'关注塔菲谢谢喵',fx:'feiqiu',sequence:['feiqiu','catpaw'],desc:'菲球与猫爪交替飞出；消耗 100 气'});
 edit('李老八',2,{name:'地上足球',desc:'贴地抽射足球，沿地面快速前进'});
 edit('李老八',3,{name:'任冲！',fx:null,desc:'“任冲”向面朝方向冲刺，造成物理撞击'});
 edit('李老八',4,{name:'国服第一开发师',fx:null,desc:'读出近身破绽，以反击架势开发对手的防线'});
 const mimic=byName('乔希');mimic.title='模仿者';mimic.quote='？？？';mimic.glyph='？';
 mimic.passive=['随机模仿','每次出招随机模仿其他角色，临时使用对应角色的动作；同一按键不连续重复'];
 mimic.skills=['J','K','U','I','O','L'].map((key,i)=>({key,name:'？？？',type:i===0?'light':i===1?'heavy':i===5?'barrage':'projectile',mimic:true,damage:0,range:900,start:.2,duration:.6,cd:i<2?.3:i===5?0:4,super:i===5,fx:null,desc:i<2?'随机模仿其他角色的对应普攻':i===5?'随机模仿其他角色的必杀；消耗 100 气':'随机模仿其他角色的专属技能'}));
 const physicalTypes=new Set(['light','heavy','dash','upper','slam','grab','counter']);
 for(const c of ROSTER)for(const s of c.skills)s.physical=physicalTypes.has(s.type)||(s.type==='burst'&&['七海','嘉然','牛妈妈','贝拉','踩背象'].includes(c.name));
 for(const s of byName('贝拉').skills.slice(2)){s.phrase='不怕困难';s.silentPhrase=true;}
 byName('贝拉').skills[5].desc='挥动黑色充气锤四连击，勇敢牛牛不怕困难；消耗 100 气';
 const initials={'阿':'a','八':'b','贝':'b','踩':'c','椎':'z','凑':'c','袋':'d','电':'d','叮':'d','东':'d','冬':'d','丰':'f','峰':'f','高':'g','宫':'g','古':'g','管':'g','灰':'h','珈':'j','嘉':'j','李':'l','露':'l','耄':'m','明':'m','乃':'n','奶':'n','闹':'n','尼':'n','牛':'n','七':'q','千':'q','乔':'q','若':'r','三':'s','山':'s','诗':'s','说':'s','四':'s','孙':'s','汤':'t','藤':'t','薇':'w','向':'x','小':'x','星':'x','炫':'x','要':'y','永':'y','柚':'y','祐':'y','张':'z','长':'c','仲':'z'};
 const collator=new Intl.Collator('zh-Hans-CN-u-co-pinyin');
 const sortName=name=>name.replace(/^长/,'昌').replace(/^椎/,'追');
 for(const c of ROSTER)c.pinyinInitial=initials[c.name[0]]||'z';
 ROSTER.sort((a,b)=>a.pinyinInitial.localeCompare(b.pinyinInitial)||collator.compare(sortName(a.name),sortName(b.name)));
 window.ROSTER_BY_ID=new Map(ROSTER.map(c=>[c.id,c]));
 window.MIMIC_POOLS=Array.from({length:6},(_,index)=>ROSTER.filter(c=>c!==mimic).flatMap(c=>(index<2?[index]:index===5?[5]:[2,3,4]).map(i=>({characterId:c.id,characterName:c.name,index:i,skill:c.skills[i]}))));
})();
