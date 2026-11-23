/** Bounded URL-deduplicated image scheduling. No game or persistence state. */
export type AssetState = 'idle' | 'queued' | 'loading' | 'ready' | 'failed';
export interface AssetRecord { key: string; url: string; state: AssetState; attempts: number; error: string | null; priority: number; }
interface ImageLike { onload: ((event: Event) => unknown) | null; onerror: ((event: Event | string) => unknown) | null; src: string; naturalWidth: number; naturalHeight: number; decode?: () => Promise<void>; native?: HTMLImageElement; }
type Entry = AssetRecord & { image: ImageLike | null; aliases: Set<string>; order: number };
export class ImageAssetLoader {
  private keys = new Map<string, Entry>();
  private urls = new Map<string, Entry>();
  private listeners = new Map<() => void, ReadonlySet<string> | ((key: string) => boolean) | null>();
  private version = 0;
  private processing = new Set<string>();
  private processingErrors = new Map<string, string>();
  private retryVersion = 0;
  getRetryVersion = (): number => this.retryVersion;
  getProcessing = () => ({ pending: this.processing.size, failed: this.processingErrors.size });
  markProcessing(key: string, pending: boolean, error?: string): void {
    if (pending) this.processing.add(key); else this.processing.delete(key);
    if (error) this.processingErrors.set(key, error); else this.processingErrors.delete(key);
    this.invalidate(key.split('|')[0]);
  }
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private changed = new Set<string>();
  private active = 0;
  private sequence = 0;
  private pumping = false;
  constructor(private factory: () => ImageLike, private timeoutMs = 20000, private limit = 4) { if (limit < 1) throw new Error('Image concurrency must be positive'); }
  subscribe = (cb: () => void): (() => void) => this.subscribeKeys(null, cb);
  subscribeKeys = (keys: readonly string[] | null, cb: () => void): (() => void) => { this.listeners.set(cb, keys ? new Set(keys) : null); return () => { this.listeners.delete(cb); }; };
  subscribeMatching = (matches: (key: string) => boolean, cb: () => void): (() => void) => { this.listeners.set(cb, matches); return () => { this.listeners.delete(cb); }; };
  invalidate(key: string): void { const entry = this.keys.get(key); if (entry) this.notify(entry); }
  getVersion = (): number => this.version;
  private notify(entry: Entry): void {
    for (const key of entry.aliases) this.changed.add(key);
    if (this.notifyTimer !== undefined) return;
    this.notifyTimer = setTimeout(() => { this.notifyTimer = undefined; this.version++; const changed = this.changed; this.changed = new Set(); for (const [cb, keys] of this.listeners) if (!keys || (typeof keys === 'function' ? [...changed].some(keys) : [...keys].some(k => changed.has(k)))) cb(); }, 16);
  }
  register(key: string, url: string): void {
    const existing = this.keys.get(key);
    if (existing) { if (existing.url !== url) throw new Error(`Asset key URL changed: ${key}`); return; }
    let entry = this.urls.get(url);
    if (!entry) { entry = { key, url, state: 'idle', attempts: 0, error: null, priority: 2, image: null, aliases: new Set(), order: this.sequence++ }; this.urls.set(url, entry); }
    entry.aliases.add(key); this.keys.set(key, entry);
  }
  request(key: string, priority = 1): void {
    const entry = this.keys.get(key); if (!entry) return;
    entry.priority = Math.min(entry.priority, priority);
    if (entry.state === 'idle') { entry.state = 'queued'; this.notify(entry); }
    if (entry.state === 'queued') this.schedulePump();
  }
  private schedulePump(): void { if (this.pumping) return; this.pumping = true; queueMicrotask(() => { this.pumping = false; this.pump(); }); }
  private pump(): void {
    while (this.active < this.limit) {
      const next = [...this.urls.values()].filter(e => e.state === 'queued').sort((a,b) => a.priority - b.priority || a.order - b.order)[0];
      if (!next) break; this.dispatch(next);
    }
  }
  private dispatch(entry: Entry): void {
    entry.state = 'loading'; entry.attempts++; entry.error = null; this.active++; this.notify(entry);
    let timer: ReturnType<typeof setTimeout> | undefined; let image: ImageLike | null = null; let settled = false;
    const settle = (error: string | null) => {
      if (settled) return; settled = true; if (timer) clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; if (error === 'Image load timed out') image.src = ''; }
      entry.state = error ? 'failed' : 'ready'; entry.error = error; entry.image = error ? null : image; this.active--; this.notify(entry); this.schedulePump();
    };
    try {
      if (!entry.url.trim()) { settle('Empty asset URL'); return; }
      image = this.factory();
      image.onload = () => {
        if (!image!.naturalWidth || !image!.naturalHeight) { settle('Invalid image dimensions'); return; }
        // Browser decode scheduling avoids forcing first-use JPEG decode inside canvas draw/read.
        if (image!.decode) image!.decode().then(() => settle(null), () => settle('Image decode failed')); else settle(null);
      };
      image.onerror = () => settle('Image request or decode failed');
      timer = setTimeout(() => settle('Image load timed out'), this.timeoutMs);
      image.src = entry.url;
    } catch { settle('Image could not be requested'); }
  }
  get(key: string): HTMLImageElement | null { const e = this.keys.get(key); return e?.state === 'ready' ? (e.image?.native ?? e.image) as HTMLImageElement : null; }
  diagnostics(): AssetRecord[] { return [...this.keys].map(([key,e]) => ({ key, url:e.url, state:e.state, attempts:e.attempts, error:e.error, priority:e.priority })); }
  retryFailed(): void { this.retryVersion++; for (const key of this.processingErrors.keys()) this.invalidate(key.split('|')[0]); this.processingErrors.clear(); for (const e of this.urls.values()) if (e.state === 'failed') { e.state = 'queued'; e.error = null; e.order = this.sequence++; this.notify(e); } this.schedulePump(); }
}
export function assetUrl(path: string, base = import.meta.env?.BASE_URL ?? './'): string { return `${base.endsWith('/') ? base : base + '/'}${path.replace(/^\.\//, '').replace(/^\//, '')}`; }
/** Keep compressed source bytes from the single network request for worker decode. */
const sourceBlobs = new WeakMap<HTMLImageElement, Blob>();
export const getSourceBlob = (image: HTMLImageElement): Blob | undefined => sourceBlobs.get(image);
function browserImage(): ImageLike {
  const native = new Image();
  let controller: AbortController | undefined;
  let current = '';
  let objectUrl: string | undefined;
  let sourceBlob: Blob | undefined;
  const release = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = undefined; };
  const proxy: ImageLike = {
    native, onload: null, onerror: null,
    get naturalWidth() { return native.naturalWidth; },
    get naturalHeight() { return native.naturalHeight; },
    get src() { return current; },
    set src(url: string) {
      current = url; controller?.abort(); release();
      if (!url) { native.src = ''; return; }
      controller = new AbortController();
      const signal = controller.signal;
      fetch(url, { signal }).then(response => { if (!response.ok) throw Error('Asset HTTP failure'); return response.blob(); }).then(blob => {
        if (signal.aborted) return;
        sourceBlob = blob; sourceBlobs.set(native, blob); objectUrl = URL.createObjectURL(blob); native.src = objectUrl;
      }).catch(() => { if (!signal.aborted) proxy.onerror?.(new Event('error')); });
    },
    decode: async () => {
      try {
        await native.decode();
        if (sourceBlob && typeof createImageBitmap !== 'undefined') {
          try {
            const bitmap = await createImageBitmap(sourceBlob);
            // Existing renderers only read dimensions/complete and pass this to drawImage.
            const drawable = Object.assign(bitmap, { naturalWidth: bitmap.width, naturalHeight: bitmap.height, complete: true }) as unknown as HTMLImageElement;
            sourceBlobs.set(drawable, sourceBlob); proxy.native = drawable;
          } catch { /* Keep the decoded image on engines without bitmap support. */ }
        }
      } finally { release(); }
    },
  };
  native.onload = event => proxy.onload?.(event);
  native.onerror = event => { release(); proxy.onerror?.(event); };
  return proxy;
}
export const assetLoader = new ImageAssetLoader(browserImage);
export function requestImage(key: string, url: string, priority = 1): HTMLImageElement | null { assetLoader.register(key, url); if (typeof Image !== 'undefined') assetLoader.request(key, priority); return assetLoader.get(key); }
