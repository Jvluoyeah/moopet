/* Generated pose frames are selected by combat state, never deformed idle art. */
(()=>{
 const attackStates=['light','heavy','skill1','skill2','skill3','super'];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function stateFor(f,floor=443){
  if(f.hp<=0)return 'ko';
  if(f.knocked>0)return 'down';
  if(f.stun>0&&!f.blocking)return 'hurt';
  if(f.attack)return attackStates[f.attack.index];
  if(f.blocking)return 'block';
  if(f.y<floor-.5||f.landing>0)return 'jump';
  if(f.walk>0)return 'run';
  return 'idle';
 }
 function advance(f,dt,floor=443){
  const next=stateFor(f,floor);
  const serial=f.attack?.serial||0;
  if(f.animState!==next||f.animSerial!==serial){f.animState=next;f.animSerial=serial;f.animTime=0;}else f.animTime=(f.animTime||0)+dt;
 }
 function chooseFrame(f,entry,floor=443){
  const state=stateFor(f,floor),key=state==='ko'?'down':state;
  // Authored directional poses preserve asymmetric identity details such as eyes.
  const clip=entry.directionalClips?.[f.facing]?.[key]||entry.clips[key];
  if(!clip?.length)throw Error(`${f.data.name}: 缺少 ${state} 动画`);
  let i=0,t=f.animTime||0;
  if(f.attack&&attackStates.includes(state)){
   const {skill,t:elapsed}=f.attack;
   const impact=clamp(entry.impact?.[state]??Math.floor(clip.length*.45),1,clip.length-1);
   if(elapsed<skill.start)i=Math.floor(elapsed/Math.max(.03,skill.start)*impact);
   else i=impact+Math.floor((elapsed-skill.start)/Math.max(.08,skill.duration-skill.start)*(clip.length-impact));
   if(skill.repeatPose&&elapsed>=skill.start){
    const t=elapsed-skill.start,period=.17,n=Math.floor(t/period),phase=(t%period)/period;
    i=n<(skill.pulses||1)-1?(phase<.35?impact:phase<.65?clip.length-1:Math.max(0,impact-1)):(t-(skill.pulses-1)*period<.08?impact:clip.length-1);
   }
  }else if(state==='idle')i=Math.floor(t*7)%clip.length;
  else if(state==='run')i=Math.floor(t*13)%clip.length;
  else if(state==='ko')i=(f.y<floor-.5||f.vy<0)?0:Math.min(Math.floor(t*9),entry.koFrame??1);
  else if(state==='down')i=(f.y<floor-.5||f.vy<0)?0:1+Math.floor((f.downTime||0)/.72*(clip.length-1));
  else if(state==='hurt')i=Math.floor(t*15);
  else if(state==='block')i=Math.min(Math.floor(t*12),Math.floor(clip.length/2));
  else if(state==='jump'){
   if(f.landing>0)i=clip.length-1;
   else if(f.vy<-220)i=Math.min(1,Math.floor(t*16));
   else if(f.vy<150)i=Math.max(1,Math.floor(clip.length/2)-1);
   else i=clip.length-2;
  }
  i=clamp(i,0,clip.length-1);
  return {state,index:i,rect:clip[i]};
 }
 function draw(ctx,f,entry,sheet,alpha=1,x=f.x,y=f.y){
  if(!entry||!sheet)throw Error(`${f.data.name}: 动作图尚未载入`);
  const frame=chooseFrame(f,entry),r=frame.rect;
  const targetHeight=entry.targetHeight||(f.data.trait==='armor'?181:173);
  const scale=targetHeight/(r.referenceHeight||entry.referenceHeight);
  const source=sheet instanceof Map?sheet.get(r.sheet):sheet;
  if(!source)throw Error(`${f.data.name}: 动作分组 ${r.sheet} 尚未载入`);
  ctx.save();try{ctx.translate(Math.round(x),Math.round(y));ctx.scale(f.facing*(r.facing||1),1);ctx.globalAlpha=alpha;
  if(f.hitFlash>0)ctx.filter='brightness(2.1)';else if(f.invuln>.1)ctx.filter='brightness(1.25)';
  if(r.exclusionRects?.length){
   // A few long weapons overlap a neighbouring frame's bounding box. Clip
   // only those unrelated pixels; the fighter and weapon art stay intact.
   ctx.beginPath();ctx.rect(-r.pivotX*scale,-r.pivotY*scale,r.w*scale,r.h*scale);
   for(const [a,b,w,h] of r.exclusionRects)ctx.rect((a-r.pivotX)*scale,(b-r.pivotY)*scale,w*scale,h*scale);
   ctx.clip('evenodd');
  }
  ctx.drawImage(source,r.x,r.y,r.w,r.h,-r.pivotX*scale,-r.pivotY*scale,r.w*scale,r.h*scale);
  }finally{ctx.restore();}
  return frame;
 }
 // Production sheets carry an offline-refined alpha channel. Legacy keyed sheets
 // remain supported for authored fixtures; transparent production art is untouched.
 function prepareSheet(image,entry){
  if(!entry.key)return image;
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  if(entry.key){
   const im=ctx.getImageData(0,0,canvas.width,canvas.height),data=im.data;
   const key=entry.key;
   if(key==='magenta'){
    const w=canvas.width,h=canvas.height,n=w*h,mask=new Uint8Array(n),queue=new Int32Array(n);
    // Flood only background connected to the outer edge. Dark pink clothing
    // inside a black sprite outline must retain its original opacity.
    for(let i=0;i<n;i++){const p=i*4,r=data[p],g=data[p+1],b=data[p+2];mask[i]=r>160&&b>150&&g<135&&r-g>90&&b-g>90?1:0;}
    let head=0,tail=0;const add=i=>{if(mask[i]===1){mask[i]=2;queue[tail++]=i;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<n-w)add(i+w);}
    // Enclosed gaps (for example between an arm and hip) use a much tighter
    // match to the sheet's actual corner color, preserving purple accessories.
    const cr=data[0],cg=data[1],cb=data[2];
    for(let i=0;i<n;i++){const p=i*4;if(mask[i]===2||(mask[i]===1&&Math.max(Math.abs(data[p]-cr),Math.abs(data[p+1]-cg),Math.abs(data[p+2]-cb))<24))data[p+3]=0;}
   }else for(let p=0;p<data.length;p+=4){
    const r=data[p],g=data[p+1],b=data[p+2];
    if(key==='white-checker'&&Math.min(r,g,b)>205&&Math.max(r,g,b)-Math.min(r,g,b)<17)data[p+3]=0;
    if(key==='green'&&g>80&&g>r+8&&g>b+8)data[p+3]=0;
   }
   ctx.putImageData(im,0,0);
  }
  return canvas;
 }
 function drawCharacter(ctx,f,resources,alpha=1,x=f.x,y=f.y){
  const entry=resources.animations?.[f.data.id],sheets=resources.animationSheets?.get(f.data.id);
  if(entry&&sheets)return draw(ctx,f,entry,sheets,alpha,x,y);
  const im=resources.images?.get(f.data.id);if(!im)return;
  const h=f.data.trait==='armor'?181:173,w=im.width/im.height*h;
  ctx.save();try{ctx.translate(Math.round(x),Math.round(y));ctx.scale(f.facing,1);ctx.globalAlpha=alpha;if(f.hitFlash>0)ctx.filter='brightness(2.1)';ctx.drawImage(im,-w/2,-h,w,h);}finally{ctx.restore();}
 }
 window.FighterAnimation={stateFor,advance,chooseFrame,draw,drawCharacter,prepareSheet,attackStates};
})();

