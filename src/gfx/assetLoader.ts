/** Session-only image lifecycle. No game state or persistence authority. */
export type AssetState = 'idle' | 'loading' | 'ready' | 'failed';
export interface AssetRecord { key: string; url: string; state: AssetState; attempts: number; error: string | null; }
interface ImageLike { onload: ((event: Event) => unknown) | null; onerror: ((event: Event | string) => unknown) | null; src: string; naturalWidth: number; naturalHeight: number; }
export class ImageAssetLoader {
  private entries = new Map<string, AssetRecord & { image: ImageLike | null }>();
  private listeners = new Set<() => void>();
  private version = 0;
  private notifyQueued = false;
  constructor(private factory: () => ImageLike, private timeoutMs = 20000) {}
  subscribe = (cb: () => void): (() => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  getVersion = (): number => this.version;
  private notify(): void { this.version++; if (this.notifyQueued) return; this.notifyQueued = true; queueMicrotask(() => { this.notifyQueued = false; for (const cb of this.listeners) cb(); }); }
  register(key: string, url: string): void {
    const existing = this.entries.get(key);
    if (existing) { if (existing.url !== url) throw new Error(`Asset key URL changed: ${key}`); return; }
    this.entries.set(key, { key, url, state: 'idle', attempts: 0, error: null, image: null });
  }
  request(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || entry.state !== 'idle') return;
    entry.state = 'loading'; entry.attempts++; entry.error = null; this.notify();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let image: ImageLike | null = null;
    let settled = false;
    const settle = (error: string | null) => {
      if (settled) return; settled = true;
      if (timer) clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; if (error === 'Image load timed out') image.src = ''; }
      entry.state = error ? 'failed' : 'ready'; entry.error = error; entry.image = error ? null : image; this.notify();
    };
    try {
      if (!entry.url.trim()) { settle('Empty asset URL'); return; }
      image = this.factory();
      image.onload = () => settle(image!.naturalWidth > 0 && image!.naturalHeight > 0 ? null : 'Invalid image dimensions');
      image.onerror = () => settle('Image request or decode failed');
      timer = setTimeout(() => settle('Image load timed out'), this.timeoutMs);
      image.src = entry.url;
    } catch { settle('Image could not be requested'); }
  }
  get(key: string): HTMLImageElement | null { const entry = this.entries.get(key); return entry?.state === 'ready' ? entry.image as HTMLImageElement : null; }
  diagnostics(): AssetRecord[] { return [...this.entries.values()].map(({ image: _image, ...record }) => ({ ...record })); }
  retryFailed(): void { for (const entry of this.entries.values()) if (entry.state === 'failed') { entry.state = 'idle'; this.request(entry.key); } }
}
export function assetUrl(path: string, base = import.meta.env?.BASE_URL ?? './'): string {
  return `${base.endsWith('/') ? base : base + '/'}${path.replace(/^\.\//, '').replace(/^\//, '')}`;
}
export const assetLoader = new ImageAssetLoader(() => new Image());
export function requestImage(key: string, url: string): HTMLImageElement | null {
  assetLoader.register(key, url);
  if (typeof Image !== 'undefined') assetLoader.request(key);
  return assetLoader.get(key);
}
