/* Meme-specific rules use the same hit, guard, combo and cooldown system. */
(()=>{
const FLOOR=443,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function spriteFor(s,shot=0){if(s.noIcons)return null;const key=s.sequence?.[shot%s.sequence.length]||s.fx||'note';return key==='jayce'?'cannon':key;}
function makeShot(g,f,a,n=0,extra={}){
 const s=a.skill,arc=s.type==='throw',count=s.count||1;
 const speed=(s.speed||(arc?360:s.type==='summon'?440:s.super?650:480))*(f.data.trait==='focus'?1.15:1);
 const spread=count>1?(n-(count-1)/2)*(s.spread||0):0;
 const p={owner:f.id,x:f.x+f.facing*53,y:f.y-85+(s.offset||0)+spread,
  vx:f.facing*speed,vy:arc?-340-n*30:0,gravity:arc?750:0,life:s.life||2.7,
  skill:s,color:f.data.color,radius:s.size?Math.min(54,s.size*.23):17,
  attack:a,hit:new Set(),trail:[],age:0,fx:spriteFor(s,n),size:s.size||(s.type==='summon'?130:62),
  bounce:s.bounce||0,returning:s.returning,turned:false,wave:s.wave||0,
  ground:s.type==='summon'&&s.summonId!=null,groundArt:s.groundArt,summonId:s.summonId,summonForm:s.summonId===f.data.id?f.form?.name:null,...extra};
 if(p.ground)p.y=FLOOR-p.size*.46;
 if(p.groundArt)p.y=FLOOR-p.size*.5;
 g.projectiles.push(p);return p;
}
function source(a){return {...a,hit:new Set(),leechSource:a};}
function cue(g,f,a,fx=a.skill.fx){
 if(a.skill.physical||a.skill.noIcons||a.skill.suppressCue||!fx||['clone','horse','wolf','jayce','wheelchair'].includes(fx))return;
 g.effect('meme',f.x+f.facing*(a.index<2?60:40),f.y-90,f.data.color,.36,{fx,size:a.index<2?90:120,dir:f.facing});
}
function getSkill(f,index,g){
 const base=f.data.skills[index];
 if(base.mimic){
  f.mimicHistory||={};const pool=window.MIMIC_POOLS[index];
  const candidates=pool.filter(d=>d.characterId+':'+d.index!==f.mimicHistory[index]);
  const donor=candidates[Math.min(candidates.length-1,Math.floor((g?.random||Math.random)()*candidates.length))];
  f.mimicHistory[index]=donor.characterId+':'+donor.index;
  return {...donor.skill,key:base.key,name:'？？？',super:index===5,mimicOrigin:{characterId:donor.characterId,index:donor.index},sequence:donor.skill.sequence?.slice()};
 }
 const s=base;if(!f.form||index>1)return s;
 if(f.form.name==='jayce')return {...s,type:index===0?'heavy':'projectile',fx:index===0?'crescent':'cannon',range:index===0?170:900,damage:index===0?38:47,start:index===0?.1:.22,duration:index===0?.35:.57,speed:760,size:86,form:'jayce',physical:index===0};
 if(f.form.name==='wolf')return {...s,fx:'crescent',range:s.range+35,damage:s.damage*1.1,form:'wolf'};
 if(f.form.name==='horse')return {...s,fx:'crescent',range:s.range+25,form:'horse'};
 return s;
}
function emit(g,f,a){
 const s=a.skill;cue(g,f,a);
 if(s.phrase){g.text(s.phrase,f.x,f.y-200,f.data.color,1.4,22);if(!s.silentPhrase)g.audio.say?.(s.phrase);}
 const persona=s.mimicOrigin?ROSTER_BY_ID.get(s.mimicOrigin.characterId).name:f.data.name;
 if(s.summonId!=null&&['牛来','牛妈妈','管理员企鹅'].includes(persona)){
  const call=persona==='牛来'?'妈妈':persona==='牛妈妈'?'牛来':'咕咕嘎嘎';g.text(call+'——！',f.x,f.y-185,f.data.color,.95,30);g.audio.say?.(call,persona==='牛妈妈'?.8:1.15);
 }
 if(s.type==='buff'){
  f.hp=clamp(f.hp+(s.heal||0),0,f.data.hp);f.energy=clamp(f.energy+(s.energy||0),0,100);
  f.buff={name:s.name,fx:s.fx,time:s.buffTime||6,max:s.buffTime||6,attack:s.attackBoost||1,speed:s.speedBoost||1,defense:s.defense||1,cooldown:s.cooldownBoost||1};
  g.text(s.heal?'+'+s.heal:s.name,f.x,f.y-180,'#b8ff83',.8,22);return true;
 }
 if(s.type==='transform'){
  f.form={name:s.form,label:s.name,time:s.formTime||6,max:s.formTime||6,age:0,attack:s.attackBoost||1,speed:s.speedBoost||1};
  g.effect('super',f.x,f.y-90,f.data.color,.5,{radius:100});
  if(s.openingFx){
   g.effect('meme',f.x,f.y-80,f.data.color,1.15,{fx:s.openingFx,size:s.form==='dream_miyako'?470:270,dir:f.facing});
   g.text('LIVE · 开播',f.x,f.y-230,'#ff7ea8',1.3,24);
   const opening={...source(a),skill:{...s,type:'burst',fx:s.openingFx,damage:s.openingDamage||110,range:s.openingRange||300}};
   g.applyMelee(f,opening);
  }
  return true;
 }
 if(s.type==='wall'){
  const x=clamp(f.x+f.facing*150,115,845);
  // A wall may not materialize over either fighter.
  if(g.fighters.some(v=>v.hp>0&&Math.abs(v.x-x)<65)){g.text('距离太近',f.x,f.y-175,'#fff',.4,15);f.cooldowns[a.index]=1;return true;}
  g.effects.push({type:'wall',x,y:FLOOR,owner:f.id,fx:s.fx,color:f.data.color,hp:s.wallHp||90,life:4,max:4,radius:42});return true;
 }
 if(['throw','summon','rain'].includes(s.type)){
  a.shots=0;a.memeScheduled=true;schedule(g,f,a);return true;
 }
  if(s.type==='counter'&&s.reflect)f.reflectTime=2;
 if(s.type==='burst'&&s.pulses){a.pulseCount=0;a.memePulses=true;pulse(g,f,a);return true;}
 return false;
}
function schedule(g,f,a){
 const s=a.skill;while(a.shots<(s.count||1)&&a.t>=s.start+a.shots*(s.interval||.14)){
  const n=a.shots++;
  if(s.type==='rain'){
   const target=g.targetFor(f);if(!target)return;
   const x=clamp(target.x+((n%3)-1)*(s.spread||100),48,912);
   // Every falling object has a visible fixed warning before it appears.
   g.effects.push({type:'warning',x,y:FLOOR,owner:f.id,color:f.data.color,life:.38,max:.38,attack:a,n,spawned:false,fx:spriteFor(s,n),radius:38});
  }else makeShot(g,f,a,n);
 }
}
function pulse(g,f,a){
 const s=a.skill;while(a.pulseCount<s.pulses&&a.t>=s.start+a.pulseCount*.17){
  const n=a.pulseCount++,copy=source(a);
  copy.finisher=n===s.pulses-1;
  g.applyMelee(f,copy);
  if(f.hp<=0||f.stun>0||f.attack!==a)return;
  if(!copy.finisher)for(const id of copy.hit){const o=g.fighters[id];o.vx=s.pull?(f.x-o.x)*1.9:0;}
  if(!s.physical&&!s.noIcons)g.effect('meme',f.x+f.facing*65,f.y-78,f.data.color,.3,{fx:spriteFor(s,n),size:130+n*17,dir:f.facing});
  g.effect('slam',f.x,FLOOR-2,f.data.color,.3,{radius:s.range*.7});
 }
}
function step(g,dt){
 for(const f of g.fighters){
  if(f.hp<=0){g.retire(f);continue;}
  if(f.buff){f.buff.time-=dt;if(f.buff.time<=0)f.buff=null;}
  if(f.form){f.form.time-=dt;f.form.age+=dt;if(f.form.time<=0)f.form=null;}
  if(f.burn){
   const b=f.burn,elapsed=Math.min(dt,Math.max(0,b.time));b.time-=dt;b.tick+=elapsed;
   while(b.tick>=.5&&f.hp>0){b.tick-=.5;f.hp=clamp(f.hp-b.damage,0,f.data.hp);g.text('-'+b.damage,f.x,f.y-150,'#ff9d46',.4,15);}
   if(b.time<=0)f.burn=null;
  }
  f.reflectTime=Math.max(0,(f.reflectTime||0)-dt);
  if(f.hp<=0){g.retire(f);continue;}if(f.attack?.memeScheduled)schedule(g,f,f.attack);
  if(f.attack?.memePulses)pulse(g,f,f.attack);
 }
 for(const e of g.effects){
  if(e.type==='warning'&&e.life<dt*2&&!e.spawned&&g.phase==='fight'){
   e.spawned=true;const f=g.fighters[e.owner];if(f.hp<=0)continue;makeShot(g,f,e.attack,e.n,{x:e.x,y:-35,vx:0,vy:420,gravity:600,life:1.5,falling:true});
  }
  if(e.type==='wall'&&e.life>0){
   for(const f of g.fighters){
    if(f.hp<=0)continue;
    if(f.y>FLOOR-150&&Math.abs(f.x-e.x)<70){f.x=e.x+(f.x<e.x?-70:70);f.vx=0;}
    const a=f.attack;if(g.isEnemy(f,g.fighters[e.owner])&&a&&a.t>=a.skill.start&&!a.wallHit&&Math.abs(f.x-e.x)<a.skill.range&&a.skill.range<500){a.wallHit=true;e.hp-=a.skill.damage;g.sparks(e.x,FLOOR-85,f.data.color,10);}
   }
   for(const p of g.projectiles)if(g.isEnemy(g.fighters[p.owner],g.fighters[e.owner])&&p.life>0&&Math.abs(p.x-e.x)<45&&p.y>FLOOR-160){e.hp-=p.skill.damage;p.life=0;}
   if(e.hp<=0){e.life=0;g.sparks(e.x,FLOOR-65,e.color,22);}
  }
 }
}
function projectileStep(g,p,dt){
 p.age=(p.age||0)+dt;
 if(p.gravity){p.vy+=p.gravity*dt;p.y+=p.vy*dt;}
 if(p.wave)p.y+=Math.cos(p.age*7)*p.wave*7*dt;
 if(p.returning&&!p.turned&&p.age>.62){p.turned=true;p.vx=-p.vx;p.hit.clear();}
 if(p.y>=FLOOR-p.radius){
  if(p.bounce>0){p.y=FLOOR-p.radius;p.vy=-Math.abs(p.vy)*.62;p.bounce--;g.effect('dust',p.x,FLOOR,p.color,.22,{radius:30});}
  else if(p.gravity){p.y=FLOOR-p.radius;impact(g,p);p.life=0;}
 }
 for(const target of g.opponents(g.fighters[p.owner])){
 if(p.life>0&&target.reflectTime>0&&!p.skill.super&&Math.abs(p.x-target.x)<80&&Math.abs(p.y-(target.y-83))<85){
  p.owner=target.id;p.vx=-p.vx;p.hit.clear();p.attack={...p.attack,leechSource:undefined};target.energy=clamp(target.energy+8,0,100);target.reflectTime=0;
  g.text('弹回!',target.x,target.y-185,target.data.color);g.effect('shield',p.x,p.y,target.data.color,.3,{radius:45});break;
 }}
}
function impact(g,p){
 const r=p.skill.splash||p.radius+40;for(const target of g.opponents(g.fighters[p.owner]))
 if(Math.abs(target.x-p.x)<r&&Math.abs((target.y-60)-p.y)<110)g.hit(g.fighters[p.owner],target,p.skill,{...p.attack,hit:p.hit,leechSource:p.attack},p.x);
 if(!p.skill.noIcons&&!p.skill.physical)g.effect('meme',p.x,Math.min(FLOOR-35,p.y),p.color,.35,{fx:p.fx==='clone'?'wave':p.fx,size:p.size*1.35,dir:Math.sign(p.vx)||1});
 g.sparks(p.x,Math.min(FLOOR-8,p.y),p.color,16);
}
function afterHit(g,attacker,defender,s,source,blocked){
 if(blocked)return;
 if(s.burn)defender.burn={time:s.burn,max:s.burn,tick:0,damage:s.burnDamage||8,owner:attacker.id};
 if(s.slow)defender.slow=Math.max(defender.slow,s.slow);
 if(s.healOnHit&&attacker.hp>0)attacker.hp=clamp(attacker.hp+s.healOnHit,0,attacker.data.hp);
 if(s.energyOnHit)attacker.energy=clamp(attacker.energy+s.energyOnHit,0,100);
 if(!s.physical&&!s.noIcons&&s.fx&&!['clone','horse','wheelchair','jayce'].includes(s.fx))g.effect('meme',defender.x,defender.y-90,attacker.data.color,.25,{fx:s.fx,size:s.super?155:80,dir:attacker.facing});
}
window.MemeCombat={spriteFor,makeShot,getSkill,emit,step,projectileStep,impact,afterHit,cue};
})();
