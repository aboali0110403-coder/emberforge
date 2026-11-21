/**
 * Zero-GC fixed-capacity particle and floating judgment text ring buffer.
 */
export type ParticleKind =
  | 'spark'
  | 'ember'
  | 'steam'
  | 'coin'
  | 'star'
  | 'smoke'
  | 'dust'
  | 'splash'
  | 'ring';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  targetSize: number;
  color: string;
  gravity: number;
  kind: ParticleKind;
}

export interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
}

const MAX_PARTICLES = 260;
const MAX_TEXTS = 18;

export class ParticlePool {
  private particles: Particle[];
  private texts: FloatingText[];
  private pCursor = 0;
  private tCursor = 0;

  constructor() {
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      targetSize: 2,
      color: '#fde047',
      gravity: 0,
      kind: 'spark',
    }));

    this.texts = Array.from({ length: MAX_TEXTS }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -20,
      life: 0,
      maxLife: 1,
      text: '',
      color: '#fffbeb',
    }));
  }

  public spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    gravity = 120,
    kind: ParticleKind = 'spark',
    targetSize = size,
  ): void {
    const p = this.particles[this.pCursor];
    this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = Math.max(0.01, life);
    p.size = size;
    p.targetSize = targetSize;
    p.color = color;
    p.gravity = gravity;
    p.kind = kind;
  }

  public burstSparks(x: number, y: number, count: number, color = '#fde047'): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * Math.random();
      const speed = 35 + Math.random() * 95;
      this.spawn(
        x,
        y,
        Math.cos(angle) * speed + (Math.random() - 0.5) * 30,
        Math.sin(angle) * speed - 15,
        0.25 + Math.random() * 0.45,
        Math.random() > 0.5 ? 2 : 1,
        i % 3 === 0 ? '#ea580c' : color,
        200,
        'spark',
      );
    }
  }

  public burstSteam(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const sz = 3 + Math.floor(Math.random() * 3);
      this.spawn(
        x + (Math.random() - 0.5) * 26,
        y + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 18,
        -18 - Math.random() * 28,
        0.5 + Math.random() * 0.6,
        sz,
        i % 2 === 0 ? '#e0f2fe' : '#cbd5e1',
        -10,
        'steam',
        sz + 3,
      );
    }
  }

  public burstSplash(x: number, y: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 105;
      const lift = -48 - Math.random() * 68;
      this.spawn(
        x + (Math.random() - 0.5) * 18,
        y,
        spread,
        lift,
        0.38 + Math.random() * 0.28,
        2,
        i % 3 === 0 ? '#e0f2fe' : '#38bdf8',
        260,
        'splash',
      );
    }
  }

  public spawnRing(x: number, y: number, maxRadius = 24, color = '#fde047'): void {
    this.spawn(x, y, 0, 0, 0.34, 4, color, 0, 'ring', maxRadius);
  }

  public spawnSmoke(x: number, y: number): void {
    const startSz = 3 + Math.floor(Math.random() * 2);
    this.spawn(
      x + (Math.random() - 0.5) * 10,
      y,
      4 + (Math.random() - 0.5) * 8,
      -12 - Math.random() * 10,
      1.1 + Math.random() * 0.8,
      startSz,
      Math.random() > 0.5 ? '#574c47' : '#786a62',
      -4,
      'smoke',
      startSz + 5,
    );
  }

  public spawnDustMote(x: number, y: number): void {
    this.spawn(
      x,
      y,
      (Math.random() - 0.5) * 7,
      -2 - Math.random() * 4,
      2.2 + Math.random() * 1.8,
      1,
      Math.random() > 0.35 ? '#fef3c7' : '#fdba74',
      0,
      'dust',
    );
  }

  public burstRarityCelebration(x: number, y: number, color: string, count = 18): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const speed = 32 + Math.random() * 65;
      const isStar = i % 2 === 0;
      this.spawn(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 12,
        0.55 + Math.random() * 0.45,
        isStar ? 3 : 2,
        i % 3 === 0 ? '#fffbeb' : color,
        65,
        isStar ? 'star' : 'spark',
      );
    }
  }

  public burstCoins(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 16,
        y,
        (Math.random() - 0.5) * 65,
        -55 - Math.random() * 55,
        0.6 + Math.random() * 0.4,
        3,
        '#facc15',
        180,
        'coin',
      );
    }
  }

  public spawnText(x: number, y: number, text: string, color: string): void {
    const t = this.texts[this.tCursor];
    this.tCursor = (this.tCursor + 1) % MAX_TEXTS;
    t.active = true;
    t.x = x;
    t.y = y;
    t.vy = -22;
    t.life = 0.85;
    t.maxLife = 0.85;
    t.text = text;
    t.color = color;
  }

  public getActiveCount(): number {
    let n = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.particles[i].active) n += 1;
    }
    return n;
  }

  public update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const ratio = Math.max(0, p.life / p.maxLife);
      const progress = 1 - ratio;
      const px = Math.round(p.x);
      const py = Math.round(p.y);

      if (p.kind === 'ring') {
        const radius = Math.max(2, Math.round(p.size + (p.targetSize - p.size) * progress));
        ctx.globalAlpha = ratio * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = ratio > 0.5 ? 2 : 1;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      if (p.kind === 'star') {
        ctx.globalAlpha = ratio;
        ctx.fillStyle = p.color;
        const arm = Math.max(1, Math.round(p.size * (0.6 + Math.sin(progress * Math.PI) * 0.6)));
        ctx.fillRect(px - arm, py, arm * 2 + 1, 1);
        ctx.fillRect(px, py - arm, 1, arm * 2 + 1);
        continue;
      }

      if (p.kind === 'splash') {
        ctx.globalAlpha = ratio * 0.95;
        ctx.fillStyle = p.color;
        ctx.fillRect(px, py, 2, 3);
        continue;
      }

      if (p.kind === 'dust') {
        ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.52;
        ctx.fillStyle = p.color;
        ctx.fillRect(px, py, 1, 1);
        continue;
      }

      if (p.kind === 'smoke' || p.kind === 'steam') {
        const sz = Math.round(p.size + (p.targetSize - p.size) * progress);
        ctx.globalAlpha = ratio * (p.kind === 'smoke' ? 0.34 : 0.62);
        ctx.fillStyle = p.color;
        ctx.fillRect(px - Math.floor(sz / 2), py - Math.floor(sz / 2), sz, sz);
        continue;
      }

      ctx.globalAlpha = ratio;
      ctx.fillStyle = p.color;
      ctx.fillRect(px, py, p.size, p.size);
      if (p.kind === 'coin') {
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(px + 1, py, 1, 2);
      }
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      const alpha = Math.min(1, (t.life / t.maxLife) * 1.4);
      ctx.globalAlpha = alpha;
      const tx = Math.round(t.x);
      const ty = Math.round(t.y);
      ctx.fillStyle = '#120c0a';
      ctx.fillText(t.text, tx + 1, ty + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, tx, ty);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
