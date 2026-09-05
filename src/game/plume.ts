/** Keel fire under the Siege hull. Additive particles, not three CSS blobs. */

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  rgb: [number, number, number];
};

const CORE: [number, number, number] = [255, 255, 240];
const LIME: [number, number, number] = [140, 255, 70];
const GREEN: [number, number, number] = [60, 220, 110];
const GOLD: [number, number, number] = [255, 220, 90];

function pick(hot: number): [number, number, number] {
  const n = Math.random();
  if (n < 0.22 + hot * 0.15) return CORE;
  if (n < 0.62) return LIME;
  if (n < 0.86) return GREEN;
  return GOLD;
}

export type Plume = {
  resize: () => void;
  step: (dt: number, hot: number) => void;
};

export function createPlume(canvas: HTMLCanvasElement): Plume {
  const bits: Bit[] = [];
  let dpr = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  function spawn(n: number, hot: number) {
    const w = canvas.width;
    const spread = w * (0.38 + hot * 0.12);
    for (let i = 0; i < n; i++) {
      if (bits.length > 160) bits.shift();
      const edge = (Math.random() - 0.5) * 2;
      bits.push({
        x: w * 0.5 + edge * spread,
        y: 2 * dpr,
        vx: edge * (18 + hot * 40) * dpr,
        vy: (70 + Math.random() * 110 + hot * 160) * dpr,
        life: 0.28 + Math.random() * 0.38 + hot * 0.12,
        max: 1,
        r: (2.2 + Math.random() * 4.5 + hot * 5) * dpr,
        rgb: pick(hot),
      });
      bits[bits.length - 1]!.max = bits[bits.length - 1]!.life;
    }
  }

  function step(dt: number, hot: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const idle = 7 + hot * 28;
    spawn(Math.max(1, Math.round(idle * Math.min(dt, 0.05) * 60)), hot);

    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]!;
      b.life -= dt;
      if (b.life <= 0 || b.y > h + b.r) {
        bits.splice(i, 1);
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 40 * dpr * dt;
      b.vx *= 0.98;
      const t = b.life / b.max;
      const a = t * t;
      const rad = b.r * (0.65 + (1 - t) * 0.9);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
      g.addColorStop(0, `rgba(${b.rgb[0]},${b.rgb[1]},${b.rgb[2]},${a})`);
      g.addColorStop(0.45, `rgba(${b.rgb[0]},${b.rgb[1]},${Math.max(0, b.rgb[2] - 40)},${a * 0.45})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    const cone = ctx.createLinearGradient(w * 0.5, 0, w * 0.5, h * 0.72);
    cone.addColorStop(0, `rgba(255,255,230,${0.18 + hot * 0.35})`);
    cone.addColorStop(0.2, `rgba(160,255,80,${0.16 + hot * 0.28})`);
    cone.addColorStop(0.55, `rgba(40,180,90,${0.08 + hot * 0.12})`);
    cone.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(w * 0.22, 0);
    ctx.lineTo(w * 0.78, 0);
    ctx.lineTo(w * 0.62, h * 0.85);
    ctx.lineTo(w * 0.38, h * 0.85);
    ctx.closePath();
    ctx.fill();
  }

  return { resize, step };
}
