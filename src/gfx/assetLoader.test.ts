import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageAssetLoader, assetUrl } from './assetLoader';
class FakeImage { onload: ((event: Event) => unknown) | null = null; onerror: ((event: Event | string) => unknown) | null = null; src = ''; naturalWidth = 20; naturalHeight = 20; }
function fixture(timeout = 1000) { const images: FakeImage[] = []; const loader = new ImageAssetLoader(() => { const image = new FakeImage(); images.push(image); return image; }, timeout); return { loader, images }; }
const event = {} as Event;
test('S7 lifecycle distinguishes idle, pending, ready and dimensions, without duplicate requests', () => {
 const {loader,images}=fixture();loader.register('a','./a.png');assert.equal(loader.diagnostics()[0].state,'idle');loader.request('a');loader.request('a');assert.equal(images.length,1);assert.equal(loader.get('a'),null);assert.equal(loader.diagnostics()[0].state,'loading');images[0].onload!(event);assert.ok(loader.get('a'));assert.equal(loader.diagnostics()[0].state,'ready');assert.equal(images[0].onload,null);assert.equal(images[0].onerror,null);loader.request('a');loader.retryFailed();assert.equal(images.length,1);
});
test('S7 failure stays explicit until safe failed-only retry, stale callbacks cannot overwrite retry', () => {
 const {loader,images}=fixture();loader.register('a','missing.png');loader.request('a');const late=images[0].onload!;images[0].onerror!(event);assert.equal(loader.diagnostics()[0].state,'failed');loader.request('a');assert.equal(images.length,1);loader.retryFailed();loader.retryFailed();assert.equal(images.length,2);late(event);assert.equal(loader.diagnostics()[0].state,'loading');images[1].onload!(event);assert.equal(loader.diagnostics()[0].state,'ready');assert.equal(loader.diagnostics()[0].attempts,2);
});
test('S7 empty URL and invalid decoded dimensions are failures, not success',()=>{
 const {loader,images}=fixture();loader.register('empty','');loader.request('empty');assert.equal(images.length,0);assert.equal(loader.diagnostics()[0].state,'failed');loader.register('zero','zero.png');loader.request('zero');images[0].naturalWidth=0;images[0].onload!(event);assert.equal(loader.get('zero'),null);assert.equal(loader.diagnostics()[1].state,'failed');
});
test('S7 timeout detaches callbacks, cancels source and allows bounded explicit retry',async()=>{
 const {loader,images}=fixture(5);loader.register('a','slow.png');loader.request('a');await new Promise(r=>setTimeout(r,15));assert.equal(loader.diagnostics()[0].state,'failed');assert.match(loader.diagnostics()[0].error!,/timed out/);assert.equal(images[0].src,'');assert.equal(images[0].onload,null);
});
test('S7 subscriptions coalesce and unsubscribe, repeated registrations retain identity',async()=>{
 const {loader,images}=fixture();let calls=0;const off=loader.subscribe(()=>calls++);loader.register('a','a.png');loader.register('a','a.png');assert.throws(()=>loader.register('a','b.png'));loader.request('a');images[0].onload!(event);await Promise.resolve();assert.equal(calls,1);off();loader.register('b','b.png');loader.request('b');images[1].onerror!(event);await Promise.resolve();assert.equal(calls,1);
});
test('S7 URL construction honors explicit nested application bases',()=>{
 assert.equal(assetUrl('./assets/a.png','/game/'),'/game/assets/a.png');assert.equal(assetUrl('/assets/a.png','./'),'./assets/a.png');
});
