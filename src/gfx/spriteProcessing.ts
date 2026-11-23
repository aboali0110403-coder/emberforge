import { getSourceBlob } from './assetLoader';
/** Serial, demand-only sprite work. Yield between small native-detail stripes. */
let tail: Promise<void> = Promise.resolve();
export function yieldProcessing(): Promise<void> { return new Promise(resolve => { if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return; } const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); c.port2.close(); resolve(); }; c.port2.postMessage(null); }); }
export function enqueueProcessing(work: () => Promise<void>): Promise<void> {
  const next = tail.then(async () => { await yieldProcessing(); await work(); });
  tail = next.catch(() => {});
  return next;
}

let workerSupported = true;
let sharedWorker: Worker | null = null;
let sourceCount = 0;
const sources = new Map<HTMLImageElement, number>();
/** Serial processing owns one persistent worker and transfers each source once. */
export async function processNativeCrop(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number): Promise<Uint8ClampedArray | null> {
  if (!workerSupported || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  try {
    let sourceId = sources.get(image); let bitmap: ImageBitmap | undefined; let blob: Blob | undefined; let evict: number | undefined;
    if (sourceId === undefined) { blob = getSourceBlob(image); if (!blob) bitmap = await createImageBitmap(image); sourceId = ++sourceCount; sources.set(image, sourceId); if (sources.size > 2) { const oldest = sources.keys().next().value!; evict = sources.get(oldest); sources.delete(oldest); } }
    const worker = sharedWorker ??= new Worker(new URL('./spriteProcessor.worker.ts', import.meta.url), { type: 'module' });
    return await new Promise(resolve => {
      const fail = () => { worker.terminate(); sharedWorker = null; workerSupported = false; resolve(null); };
      const timer = setTimeout(fail, 10000);
      worker.onmessage = event => { clearTimeout(timer); resolve(event.data.buffer ? new Uint8ClampedArray(event.data.buffer) : null); };
      worker.onerror = () => { clearTimeout(timer); fail(); };
      worker.postMessage({ bitmap, blob, sourceId, evict, sx, sy, sw, sh }, bitmap ? [bitmap] : []);
    });
  } catch { workerSupported = false; return null; }
}
