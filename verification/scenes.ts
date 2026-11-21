// @ts-nocheck
import {createMinigameRuntime,renderMinigameScene,handleMinigamePointerDown,handleMinigamePointerUp,updateMinigame} from '../src/canvas/minigames';
import {ParticlePool} from '../src/gfx/particles';
import {createWeaponInstance} from '../src/game/rules';
import {ensureStationLayersPreloaded} from '../src/gfx/stationLayers';
import {ensureAssetsPreloaded} from '../src/gfx/assetSheets';
import {ensureProcessFramesPreloaded} from '../src/gfx/processFrames';
const eq={furnace:1,hammer:1,anvil:1,grindstone:1,quench:1,workbench:1};
const player={name:'Smith',gender:'male',hairColorIndex:0,skinToneIndex:0,outfitColorIndex:0};
const weapon=createWeaponInstance('sword',1,'test');
ensureStationLayersPreloaded();ensureAssetsPreloaded();ensureProcessFramesPreloaded();
const grid=document.querySelector('canvas')!; const ctx=grid.getContext('2d')!;
function scene(station,patch={},type='sword',level=1) {const c=document.createElement('canvas');c.width=480;c.height=270;const rt=createMinigameRuntime(station,1,eq);Object.assign(rt,{elapsed:1,targetX:240,targetY:125,anvilStrikeX:240,anvilStrikeY:125},patch);renderMinigameScene(c.getContext('2d')!,rt,player,createWeaponInstance(type,level,'test'),new ParticlePool(),eq);return c;}
function paint(){
 const rows=[['furnace',[{heat:.18},{heat:.58,pointerDown:true,bellowsPumpAnim:.1,elapsed:2},{heat:.91,pointerDown:true,bellowsPumpAnim:.1,elapsed:3}]],['anvil',[{ringProgress:.5},{hammerStrikeAnim:.27,strikesDone:3,anvilStrikeQuality:'good'},{hammerStrikeAnim:.20,strikesDone:7,anvilStrikeQuality:'perfect'}]],['grindstone',[{cursorX:.1,zoneCenter:.5},{cursorX:.5,zoneCenter:.5,elapsed:3},{cursorX:.5,zoneCenter:.5,elapsed:8}]],['quench',[{temp:1},{temp:.61,submerged:true,quenchPlunge:1},{temp:.39,submerged:true,quenchPlunge:1,elapsed:3}]]];
 ctx.fillStyle='#120c0a';ctx.fillRect(0,0,1440,1160);
 rows.forEach(([station,states],r)=>states.forEach((state,c)=>{const x=c*480,y=r*290;ctx.fillStyle='#f3dfb9';ctx.font='14px monospace';ctx.fillText(`${station.toUpperCase()} / ${c+1}`,x+20,y+18);ctx.drawImage(scene(station,state),x,y+20)}));
}
function tests(){
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 let finished=0;const cb={onHitStop(){},onShake(){},onStreak(){},onFinish(){finished++}};const p=new ParticlePool();
 const rt=createMinigameRuntime('anvil',1,eq);rt.targetX=237;rt.targetY=145;rt.ringProgress=.85;
 handleMinigamePointerDown(rt,237,145,eq,p,cb);
 assert(rt.strikesDone===1,'strike counted');assert(rt.anvilStrikeX===237&&rt.anvilStrikeY===145,'hit anchor captured');assert(rt.anvilStrikeQuality==='perfect','perfect timing preserved');
 handleMinigamePointerDown(rt,237,145,eq,p,cb);assert(rt.strikesDone===1,'repeated input cannot double-hit during swing');
 updateMinigame(rt,.1,new Set(),eq,p,cb);assert(rt.anvilImpactEmitted,'impact emitted on downstroke');assert(rt.targetX===237,'next target not moved during impact');
 updateMinigame(rt,.23,new Set(),eq,p,cb);assert(rt.hammerStrikeAnim===0,'recovery complete');assert(rt.ringProgress<.02,'next ring starts after recovery');
 rt.strikesDone=rt.strikesTotal-1;rt.ringProgress=.85;
 handleMinigamePointerDown(rt,0,0,eq,p,cb);assert(!rt.finished,'last strike shown before finish');updateMinigame(rt,.33,new Set(),eq,p,cb);assert(rt.finished&&finished===1,'finish exactly once after last strike');
 const missed=createMinigameRuntime('anvil',1,eq);missed.ringProgress=1.15;updateMinigame(missed,.1,new Set(),eq,p,cb);assert(missed.strikesDone===1&&missed.strikeScores[0]===.25,'timeout score preserved');
 return {passed:9,notes:'Timing, anchored impact, input guard, next ring, last strike and timeout verified'};
}
Object.assign(window,{paint,scene,tests});

const panels=['furnace','anvil','grindstone','quench'].map(station=>({station,rt:createMinigameRuntime(station,1,eq),particles:new ParticlePool()}));
const noops={onHitStop(){},onShake(){},onStreak(){},onFinish(){}};
function animationFrame(index){
 grid.width=960;grid.height=580;const time=index/20;
 for(const [n,p] of panels.entries()){
  if(p.station==='furnace')p.rt.pointerDown=p.rt.heat<p.rt.bandCenter+.015;
  if(p.station==='anvil'&&p.rt.hammerStrikeAnim===0&&p.rt.ringProgress>=.84)handleMinigamePointerDown(p.rt,0,0,eq,p.particles,noops);
  if(p.station==='grindstone')p.rt.cursorX=Math.max(.08,Math.min(.92,p.rt.zoneCenter+Math.sin(time*2)*.18));
  if(p.station==='quench'){
   if(time>1&&!p.rt.submerged)handleMinigamePointerDown(p.rt,0,0,eq,p.particles,noops);
   if(p.rt.temp<.4&&!p.rt.quenchDone)handleMinigamePointerUp(p.rt,p.particles,noops);
  }
  updateMinigame(p.rt,.05,new Set(),eq,p.particles,noops);p.particles.update(.05);
  const c=document.createElement('canvas');c.width=480;c.height=270;
  renderMinigameScene(c.getContext('2d')!,p.rt,player,weapon,p.particles,eq);
  const x=n%2*480,y=Math.floor(n/2)*290;
  ctx.fillStyle='#120c0a';ctx.fillRect(x,y,480,290);ctx.fillStyle='#f3dfb9';ctx.font='14px monospace';ctx.fillText(p.station.toUpperCase(),x+20,y+18);ctx.drawImage(c,x,y+20);
 }
 return grid.toDataURL().split(',')[1];
}
Object.assign(window,{animationFrame});
import {getPaintedWeaponCanvas,PAINTED_WEAPON_TYPES} from '../src/gfx/paintedWeaponAssets';
function loadAllWeapons(){for(const type of PAINTED_WEAPON_TYPES)for(let t=0;t<5;t++)for(const heat of ['cold','warm','hot'])getPaintedWeaponCanvas(createWeaponInstance(type,t*4+1,'test'),heat);}
function weaponStations(){grid.width=1200;grid.height=1550;PAINTED_WEAPON_TYPES.forEach((type,r)=>{for(let t=0;t<5;t++){const x=t*240,y=r*155;ctx.fillStyle='#120c0a';ctx.fillRect(x,y,240,155);ctx.fillStyle='#f3dfb9';ctx.font='12px monospace';ctx.fillText(`${type} / Lv ${t*4+1}`,x+8,y+14);ctx.drawImage(scene('anvil',{strikesDone:6,strikesTotal:8,ringProgress:.55},type,t*4+1),x,y+20,240,135)}});}
Object.assign(window,{loadAllWeapons,weaponStations});
import {getWeaponSpriteCanvas,getHeatedWeaponCanvas} from '../src/gfx/sprites';
function sharedWeapons(){
 grid.width=1200;grid.height=1000;let verified=0;
 PAINTED_WEAPON_TYPES.forEach((type,r)=>{for(let t=0;t<5;t++){
  const weapon=createWeaponInstance(type,t*4+1,'test');
  for(const heat of ['cold','warm','hot']){const raw=getPaintedWeaponCanvas(weapon,heat);if(!raw||raw.width<8)throw Error(`Missing ${type}/${t}/${heat}`);const square=getPaintedWeaponCanvas(weapon,heat,true);if(square.width!==square.height)throw Error('Aspect padding failed');if(getHeatedWeaponCanvas(weapon,heat)!==square)throw Error('Shared heat route differs');verified++;}
  const sprite=getWeaponSpriteCanvas(weapon);if(sprite!==getPaintedWeaponCanvas(weapon,'cold',true))throw Error('Shared sprite route differs');
  const x=t*240,y=r*100;ctx.fillStyle='#19110f';ctx.fillRect(x,y,240,100);ctx.fillStyle='#f3dfb9';ctx.font='12px monospace';ctx.fillText(`${type} / Lv ${t*4+1}`,x+8,y+16);ctx.drawImage(sprite,x+60,y+22,75,75);
 }});return {states:verified,sharedColdRoutes:50};
}
Object.assign(window,{sharedWeapons});
