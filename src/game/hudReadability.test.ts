import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorldClock, derivePatience, formatHudDuration } from './hudReadability';
import { HudOverlay } from '../components/HudOverlay';
import { createInitialSaveState, createTutorialOrder } from './rules';
import { advanceOrderDeadlines, skipNight } from './worldCycle';

test('S6 clock: phase boundaries and countdown derive from activePlaySec', () => {
  for (const [sec, phase, elapsed, remaining] of [[0,'day',0,480],[479,'day',479,1],[480,'night',0,180],[659,'night',179,1],[660,'day',0,480]] as const) {
    const view = deriveWorldClock(sec); assert.equal(view.phase,phase); assert.equal(view.elapsed,elapsed); assert.equal(view.remaining,remaining);
  }
  for (let sec=0;sec<1980;sec++) { const a=deriveWorldClock(sec);assert.equal(a.elapsed+a.remaining,a.duration); }
});
test('S6 patience: three urgency states and exact thresholds are presentation only',()=>{
  assert.equal(derivePatience(100,100).urgency,'Calm');assert.equal(derivePatience(36,100).urgency,'Calm');assert.equal(derivePatience(35,100).urgency,'Warning');assert.equal(derivePatience(16,100).urgency,'Warning');assert.equal(derivePatience(15,100).urgency,'Imminent');assert.equal(derivePatience(0,100).percent,0);assert.equal(derivePatience(-1,100).percent,0);assert.equal(derivePatience(200,100).percent,100);assert.equal(formatHudDuration(61),'1:01');assert.equal(formatHudDuration(.1),'0:01');
});
test('S6 patience: each authoritative decrement reduces bar and countdown without mutation',()=>{
  let last=101;for(let remaining=100;remaining>=0;remaining--){const a=derivePatience(remaining,100);assert.ok(a.percent<last);last=a.percent;assert.equal(a.remaining,formatHudDuration(remaining));}
});
type Node={type?:unknown;props:Record<string,any>};function nodes(v:any):Node[]{if(Array.isArray(v))return v.flatMap(nodes);return v&&typeof v==='object'&&v.props?[v,...nodes(v.props.children)]:[];}
const fixture=()=>createInitialSaveState({name:'S6',gender:'male',hairColorIndex:0,skinToneIndex:0,outfitColorIndex:0});
function render(s:ReturnType<typeof fixture>){return nodes(HudOverlay({save:s,activeModal:null,canSkipNight:true,onSkipNight:()=>{},onOpenModal:()=>{},onToggleMute:()=>{}}));}
test('S6 HUD: all three orders expose separate bars, time and urgency without changing save',()=>{const s=fixture();s.orders=[100,30,10].map((v,i)=>({...createTutorialOrder(),id:'o'+i,customerName:'Customer'+i,deadlineSec:100,remainingSec:v}));const before=structuredClone(s);const n=render(s);assert.equal(n.filter(x=>x.props.role==='progressbar').length,3);for(const [i,u]of['Calm','Warning','Imminent'].entries())assert.equal(n.find(x=>x.props['data-testid']==='hud-order-slot-'+i)?.props['data-urgency'],u);assert.deepEqual(s,before);});
test('S6 HUD: empty slots remain visible and Skip Night only renders at authoritative night',()=>{const s=fixture();s.orders=[];for(const sec of[0,479,480,659,660]){s.activePlaySec=sec;const n=render(s);assert.equal(n.filter(x=>String(x.props['data-testid']??'').startsWith('hud-order-slot-')).length,3);assert.equal(n.some(x=>x.props['data-testid']==='skip-night'),sec>=480&&sec<660);}});
test('S6 projections follow existing deadline/Skip Night results, no timer authority added',()=>{const s=fixture();s.activePlaySec=600;s.orders=[{...createTutorialOrder(),isTutorial:false,deadlineSec:100,remainingSec:90}];const paused=structuredClone(s);assert.deepEqual(derivePatience(paused.orders[0].remainingSec,100),derivePatience(90,100));const t=advanceOrderDeadlines(s,1,6);assert.equal(derivePatience(t.orders[0].remainingSec,100).percent,89);const skipped=skipNight(s,6);assert.equal(skipped.state.activePlaySec,660);assert.equal(deriveWorldClock(skipped.state.activePlaySec).remaining,480);assert.equal(skipped.state.orders[0].remainingSec,30);assert.equal(derivePatience(skipped.state.orders[0].remainingSec,100).urgency,'Warning');});
