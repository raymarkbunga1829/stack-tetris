import type { GestureLabel, StrokeView } from "./gestures";

const INK = "232, 230, 225";
const LIFE = 520;
const BURST_LIFE = 640;

export type VizBurst = {
  label: GestureLabel;
  x: number;
  y: number;
  dx: number;
  dy: number;
};

type Fade = StrokeView & { dead: number };
type Burst = VizBurst & { t: number };

export function createViz() {
  const fades: Fade[] = [];
  const bursts: Burst[] = [];
  const seen = new Map<number, StrokeView>();

  function ingest(live: StrokeView[], now: number) {
    const ids = new Set(live.map((s) => s.id));
    for (const s of live) seen.set(s.id, s);
    for (const [id, s] of seen) {
      if (ids.has(id)) continue;
      fades.push({ ...s, dead: now });
      seen.delete(id);
    }
    for (let i = fades.length - 1; i >= 0; i--) {
      if (now - fades[i]!.dead > LIFE) fades.splice(i, 1);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      if (now - bursts[i]!.t > BURST_LIFE) bursts.splice(i, 1);
    }
  }

  function burst(b: VizBurst) {
    bursts.push({ ...b, t: performance.now() });
  }

  function draw(
    canvas: HTMLCanvasElement,
    live: StrokeView[],
    origin: DOMRect,
    now: number,
    reduce: boolean,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ingest(live, now);
    const dpr = canvas.width / Math.max(1, origin.width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, origin.width, origin.height);
    if (reduce) return;

    const to = (x: number, y: number) => ({
      x: x - origin.left,
      y: y - origin.top,
    });

    for (const s of fades) {
      const a = 1 - (now - s.dead) / LIFE;
      strokePath(ctx, s, to, Math.max(0, a) * 0.35);
    }
    for (const s of live) {
      strokePath(ctx, s, to, 0.85);
      finger(ctx, to(s.x, s.y), s.axis, now - s.t0);
    }
    for (const b of bursts) {
      const age = (now - b.t) / BURST_LIFE;
      drawBurst(ctx, to(b.x, b.y), b, Math.max(0, 1 - age), age);
    }
  }

  return { ingest, burst, draw, liveCount: () => seen.size + fades.length };
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  s: StrokeView,
  to: (x: number, y: number) => { x: number; y: number },
  alpha: number,
) {
  const pts = s.samples.length > 1 ? s.samples : [{ x: s.sx, y: s.sy, t: s.t0 }, { x: s.x, y: s.y, t: s.t0 }];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const p0 = to(pts[0]!.x, pts[0]!.y);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = to(pts[i]!.x, pts[i]!.y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = `rgba(${INK}, ${alpha})`;
  ctx.lineWidth = 3.2;
  ctx.stroke();

  const start = to(s.sx, s.sy);
  ctx.beginPath();
  ctx.fillStyle = `rgba(${INK}, ${alpha})`;
  ctx.arc(start.x, start.y, 3.4, 0, Math.PI * 2);
  ctx.fill();

  if (s.axis) {
    ctx.beginPath();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = `rgba(${INK}, ${alpha * 0.28})`;
    ctx.lineWidth = 1;
    if (s.axis === "x") {
      ctx.moveTo(-40, start.y);
      ctx.lineTo(2000, start.y);
    } else {
      ctx.moveTo(start.x, -40);
      ctx.lineTo(start.x, 2000);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function finger(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  axis: "x" | "y" | null,
  held: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = `rgba(${INK}, 0.85)`;
  ctx.lineWidth = 1.6;
  ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = `rgba(${INK}, 0.16)`;
  ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
  ctx.fill();
  if (!axis && held > 140) {
    const pulse = 14 + Math.min(18, held / 18);
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${INK}, 0.28)`;
    ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBurst(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  b: Burst,
  a: number,
  age: number,
) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = a;
  const grow = 1 + age * 0.55;

  if (b.label === "tap" || b.label === "double-tap") {
    ctx.strokeStyle = `rgba(${INK}, 0.9)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 10 * grow, 0, Math.PI * 2);
    ctx.stroke();
    if (b.label === "double-tap") {
      ctx.beginPath();
      ctx.arc(0, 0, 18 * grow, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (b.label === "flick" || b.label === "swipe" || b.label === "soft") {
    const ang = Math.atan2(b.dy, b.dx) || (b.label === "soft" ? Math.PI / 2 : 0);
    ctx.rotate(ang);
    ctx.strokeStyle = `rgba(${INK}, 0.95)`;
    ctx.fillStyle = `rgba(${INK}, 0.95)`;
    ctx.lineWidth = b.label === "flick" ? 3 : 2.2;
    const len = b.label === "flick" ? 36 : 26;
    ctx.beginPath();
    ctx.moveTo(-len * 0.15, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len + 2, 0);
    ctx.lineTo(len - 9, -6);
    ctx.lineTo(len - 9, 6);
    ctx.closePath();
    ctx.fill();
    if (b.label === "flick") {
      ctx.globalAlpha = a * 0.45;
      ctx.beginPath();
      ctx.moveTo(4, -8);
      ctx.lineTo(18, -8);
      ctx.moveTo(8, 8);
      ctx.lineTo(22, 8);
      ctx.stroke();
    }
  } else if (b.label === "hold" || b.label === "long-press") {
    ctx.strokeStyle = `rgba(${INK}, 0.95)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-7, -9);
    ctx.lineTo(7, -9);
    ctx.closePath();
    ctx.fillStyle = `rgba(${INK}, 0.95)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 16 * grow, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${INK}, 0.35)`;
    ctx.stroke();
  } else if (b.label === "z") {
    ctx.strokeStyle = `rgba(${INK}, 0.95)`;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-12, -12);
    ctx.lineTo(12, -12);
    ctx.lineTo(-12, 12);
    ctx.lineTo(12, 12);
    ctx.stroke();
  } else if (b.label === "two-finger") {
    ctx.fillStyle = `rgba(${INK}, 0.9)`;
    ctx.beginPath();
    ctx.arc(-8, 0, 5, 0, Math.PI * 2);
    ctx.arc(8, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.setTransform(ctx.getTransform());
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(${INK}, 0.9)`;
  ctx.fillText(b.label.toUpperCase(), p.x, p.y + 28);
  ctx.restore();
}
