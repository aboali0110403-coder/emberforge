import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageAssetLoader, assetUrl } from './assetLoader';
class FakeImage { onload: ((event: Event) => unknown) | null = null; onerror: ((event: Event | string) => unknown) | null = null; src = ''; naturalWidth = 20; naturalHeight = 20; }
const tick = () => new Promise(r => setTimeout(r, 0));
const event = {} as Event;
function fixture(timeout = 1000, limit = 4) { const images: FakeImage[] = []; const loader = new ImageAssetLoader(() => { const image = new FakeImage(); images.push(image); return image; }, timeout, limit); return { loader, images }; }
test('S7.1 queued lifecycle, URL deduplication and valid readiness', async () => {
 const {loader,images}=fixture();loader.register('a','a.png');loader.register('alias','a.png');loader.request('a');loader.request('alias');assert.equal(loader.diagnostics()[0].state,'queued');assert.equal(loader.get('a'),null);await tick();assert.equal(images.length,1);assert.equal(loader.diagnostics()[0].state,'loading');images[0].onload!(event);assert.ok(loader.get('a'));assert.equal(loader.get('a'),loader.get('alias'));assert.equal(images[0].onload,null);loader.request('a');loader.retryFailed();await tick();assert.equal(images.length,1);
});
test('S7.1 failed-only bounded retry protects against stale callbacks',async()=>{
 const {loader,images}=fixture();loader.register('a','a.png');loader.request('a');await tick();const stale=images[0].onload!;images[0].onerror!(event);assert.equal(loader.diagnostics()[0].state,'failed');loader.request('a');loader.retryFailed();loader.retryFailed();await tick();assert.equal(images.length,2);stale(event);assert.equal(loader.diagnostics()[0].state,'loading');images[1].onload!(event);assert.equal(loader.diagnostics()[0].state,'ready');assert.equal(loader.diagnostics()[0].attempts,2);
});
test('S7.1 invalid URL and dimensions never become ready',async()=>{
 const {loader,images}=fixture();loader.register('empty','');loader.request('empty');await tick();assert.equal(images.length,0);assert.equal(loader.diagnostics()[0].state,'failed');loader.register('zero','z.png');loader.request('zero');await tick();images[0].naturalWidth=0;images[0].onload!(event);assert.equal(loader.get('zero'),null);assert.equal(loader.diagnostics()[1].state,'failed');
});
test('S7.1 dispatched timeout cleans callbacks/source and frees queue slot',async()=>{
 const {loader,images}=fixture(10,1);for(const k of ['a','b']){loader.register(k,k);loader.request(k);}await tick();assert.equal(images.length,1);await new Promise(r=>setTimeout(r,14));assert.equal(loader.diagnostics()[0].state,'failed');assert.equal(images[0].src,'');assert.equal(images[0].onload,null);assert.equal(images.length,2);assert.equal(loader.diagnostics()[1].attempts,1);images[1].onload!(event);
});
test('S7.1 relevant subscriptions batch and unsubscribe without unrelated refresh',async()=>{
 const {loader,images}=fixture();let a=0,b=0;loader.register('a','a');loader.register('b','b');const off=loader.subscribeKeys(['a'],()=>a++);loader.subscribeKeys(['b'],()=>b++);loader.request('a');await tick();images[0].onload!(event);await new Promise(r=>setTimeout(r,20));assert.equal(a,1);assert.equal(b,0);off();loader.invalidate('a');await new Promise(r=>setTimeout(r,20));assert.equal(a,1);assert.equal(b,0);
});
test('S7.1 nested application URL bases preserved',()=>{assert.equal(assetUrl('./assets/a.png','/game/'),'/game/assets/a.png');assert.equal(assetUrl('/assets/a.png','./'),'./assets/a.png');});
test('S7.1 priority queue caps concurrency at four and drains without starvation',async()=>{
 const {loader,images}=fixture();for(let n=0;n<12;n++){loader.register(String(n),String(n));loader.request(String(n),n===10?0:2);}await tick();assert.equal(images.length,4);assert.equal(images[0].src,'10');for(let i=0;i<12;i++){images[i].onload!(event);await tick();assert.ok(images.length<=Math.min(12,i+5));}assert.equal(loader.diagnostics().filter(x=>x.state==='ready').length,12);
});
test('S7.1 queue waiting does not consume active request timeout',async()=>{
 const {loader,images}=fixture(35,1);loader.register('a','a');loader.register('b','b');loader.request('a');loader.request('b');await new Promise(r=>setTimeout(r,20));assert.equal(loader.diagnostics()[1].state,'queued');assert.equal(loader.diagnostics()[1].attempts,0);images[0].onload!(event);await tick();await new Promise(r=>setTimeout(r,20));assert.equal(loader.diagnostics()[1].state,'loading');images[1].onload!(event);assert.equal(loader.diagnostics()[1].state,'ready');
});
test('S7.1 all failed retries are queued, never another request burst',async()=>{
 const {loader,images}=fixture();for(let i=0;i<9;i++){loader.register(String(i),String(i));loader.request(String(i));}await tick();for(let i=0;i<9;i++){images[i].onerror!(event);await tick();}loader.retryFailed();await tick();assert.equal(images.length,13);assert.equal(loader.diagnostics().filter(x=>x.state==='loading').length,4);for(let i=9;i<18;i++){images[i].onload!(event);await tick();}assert.ok(loader.diagnostics().every(x=>x.attempts===2&&x.state==='ready'));
});
test('S7.1 decode completion is required before ready and failed decode releases slot',async()=>{
 let resolve!:()=>void;const image=Object.assign(new FakeImage(),{decode:()=>new Promise<void>(r=>resolve=r)});const loader=new ImageAssetLoader(()=>image);loader.register('a','a');loader.request('a');await tick();image.onload!(event);assert.equal(loader.get('a'),null);assert.equal(loader.diagnostics()[0].state,'loading');resolve();await tick();assert.equal(loader.diagnostics()[0].state,'ready');
});
test('S7.1 matching subscriptions cover future keys and processing stays explicit', async()=>{
 const {loader,images}=fixture();let n=0;const off=loader.subscribeMatching(k=>k.startsWith('sheet:player'),()=>n++);loader.register('other','other');loader.request('other');await tick();images[0].onload!(event);await new Promise(r=>setTimeout(r,20));assert.equal(n,0);loader.register('sheet:player','player');loader.request('sheet:player');await tick();images[1].onload!(event);loader.markProcessing('sheet:player|crop',true);assert.equal(loader.getProcessing().pending,1);await new Promise(r=>setTimeout(r,20));assert.equal(n,1);loader.markProcessing('sheet:player|crop',false,'failed');assert.equal(loader.getProcessing().failed,1);loader.retryFailed();assert.equal(loader.getProcessing().failed,0);off();
});
test('S7.1 failed decode cannot become ready and frees the queue',async()=>{
 const images: FakeImage[]=[];const loader=new ImageAssetLoader(()=>{const image=Object.assign(new FakeImage(),{decode:()=>Promise.reject(Error('bad decode'))});images.push(image);return image;},1000,1);loader.register('a','a');loader.register('b','b');loader.request('a');loader.request('b');await tick();images[0].onload!(event);await tick();assert.equal(loader.get('a'),null);assert.equal(loader.diagnostics()[0].state,'failed');assert.equal(images.length,2);images[1].onerror!(event);
});
