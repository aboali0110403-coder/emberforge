/// <reference lib="webworker" />
const sources = new Map<number, ImageBitmap>();
self.onmessage = async (event: MessageEvent) => {
  const { bitmap, blob, sourceId, evict, sx, sy, sw, sh } = event.data;
  try {
  if (evict !== undefined) { sources.get(evict)?.close(); sources.delete(evict); }
  if (blob) sources.set(sourceId, await createImageBitmap(blob));
  else if (bitmap) sources.set(sourceId, bitmap);
  const source = sources.get(sourceId)!;
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    const image = ctx.getImageData(0, 0, sw, sh);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r=data[i], g=data[i+1], b=data[i+2], excess=r+b-2*g;
      if (r>145 && b>115 && g<118 && excess>115) data[i+3]=0;
      else if (excess>48 && r>g+22 && b>g+16) {
        const strength=Math.min(1,(excess-48)/72),avg=Math.min(r,b);
        data[i]=Math.round(r*(1-strength)+g*strength);data[i+2]=Math.round(b*(1-strength)+g*strength);
        if(avg>g+30)data[i+3]=Math.round(data[i+3]*(1-strength*.72));
      }
    }
    self.postMessage({ buffer: data.buffer }, { transfer: [data.buffer] });
  } catch { self.postMessage({ error: true }); }
};
