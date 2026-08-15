/** $1-style unistroke match, rotation-limited so Z ≠ N. */

export type Pt = { x: number; y: number };

const N = 64;
const SIZE = 250;
const HALF_DIAG = 0.5 * Math.SQRT2 * SIZE;
const PHI = 0.5 * (-1 + Math.sqrt(5));
const MAX_ANGLE = (20 * Math.PI) / 180;
const ANGLE_PREC = (2 * Math.PI) / 180;

function pathLength(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    n += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return n;
}

export function resample(pts: Pt[], n = N): Pt[] {
  if (pts.length < 2) return pts.slice();
  const interval = pathLength(pts) / (n - 1);
  if (interval <= 0) return pts.slice();
  const out: Pt[] = [{ ...pts[0]! }];
  let d = 0;
  const copy = pts.map((p) => ({ ...p }));
  for (let i = 1; i < copy.length && out.length < n; ) {
    const a = copy[i - 1]!;
    const b = copy[i]!;
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (d + step >= interval && step > 0) {
      const t = (interval - d) / step;
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      out.push(q);
      copy.splice(i, 0, q);
      d = 0;
    } else {
      d += step;
      i += 1;
    }
  }
  while (out.length < n) out.push({ ...copy[copy.length - 1]! });
  return out;
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n };
}

function rotateBy(pts: Pt[], ang: number): Pt[] {
  const c = centroid(pts);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return pts.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

function scaleTo(pts: Pt[], size: number): Pt[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return pts.map((p) => ({
    x: (p.x - minX) * (size / w),
    y: (p.y - minY) * (size / h),
  }));
}

function translateToOrigin(pts: Pt[]): Pt[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function pathDistance(a: Pt[], b: Pt[]): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    d += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y);
  }
  return d / n;
}

function distanceAtAngle(pts: Pt[], tmpl: Pt[], ang: number): number {
  return pathDistance(rotateBy(pts, ang), tmpl);
}

function distanceAtBestAngle(pts: Pt[], tmpl: Pt[]): number {
  let a = -MAX_ANGLE;
  let b = MAX_ANGLE;
  let x1 = PHI * a + (1 - PHI) * b;
  let x2 = (1 - PHI) * a + PHI * b;
  let f1 = distanceAtAngle(pts, tmpl, x1);
  let f2 = distanceAtAngle(pts, tmpl, x2);
  while (Math.abs(b - a) > ANGLE_PREC) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(pts, tmpl, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(pts, tmpl, x2);
    }
  }
  return Math.min(f1, f2);
}

function normalize(raw: Pt[]): Pt[] {
  return translateToOrigin(scaleTo(resample(raw), SIZE));
}

function makeTemplate(raw: Pt[]): Pt[] {
  return normalize(raw);
}

const Z_TEMPLATES: Pt[][] = [
  makeTemplate([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
  ]),
  makeTemplate([
    { x: 0, y: 0 },
    { x: 80, y: 4 },
    { x: 20, y: 96 },
    { x: 100, y: 100 },
  ]),
  makeTemplate([
    { x: 100, y: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]),
];

function scoreOf(dist: number): number {
  return Math.max(0, 1 - dist / HALF_DIAG);
}

/** Geometric Z: three legs, two corners. Screen y is down. */
export function looksLikeZ(raw: Pt[]): boolean {
  if (raw.length < 6) return false;
  const pts = resample(raw, 32);
  const corners: number[] = [];
  for (let i = 2; i < pts.length - 2; i++) {
    const a = Math.atan2(pts[i]!.y - pts[i - 2]!.y, pts[i]!.x - pts[i - 2]!.x);
    const b = Math.atan2(pts[i + 2]!.y - pts[i]!.y, pts[i + 2]!.x - pts[i]!.x);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.85) corners.push(i);
  }
  const merged: number[] = [];
  for (const i of corners) {
    if (!merged.length || i - merged[merged.length - 1]! > 3) merged.push(i);
  }
  if (merged.length < 1 || merged.length > 4) return false;
  const cuts = [0, ...merged, pts.length - 1];
  if (cuts.length < 4) {
    const mid = Math.floor(pts.length / 2);
    cuts.splice(1, 0, Math.floor(mid / 2), mid, Math.floor((mid + pts.length) / 2));
  }
  const legs = [
    heading(pts[cuts[0]!], pts[cuts[1]!] ?? pts[Math.floor(pts.length / 3)]!),
    heading(
      pts[cuts[1]!] ?? pts[Math.floor(pts.length / 3)]!,
      pts[cuts[2]!] ?? pts[Math.floor((2 * pts.length) / 3)]!,
    ),
    heading(pts[cuts[cuts.length - 2]!]!, pts[cuts[cuts.length - 1]!]!),
  ];
  const right = (h: number) => Math.abs(norm(h)) < 0.7;
  const left = (h: number) => Math.abs(Math.abs(norm(h)) - Math.PI) < 0.7;
  const downLeft = (h: number) => Math.abs(norm(h) - 2.356) < 0.75;
  const downRight = (h: number) => Math.abs(norm(h) - 0.785) < 0.75;
  return (
    (right(legs[0]!) && downLeft(legs[1]!) && right(legs[2]!)) ||
    (left(legs[0]!) && downRight(legs[1]!) && left(legs[2]!))
  );
}

function heading(a: Pt, b: Pt): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function norm(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function recognizeZ(raw: Pt[]): { score: number; hit: boolean } {
  if (raw.length < 6 || pathLength(raw) < 70) return { score: 0, hit: false };
  const pts = normalize(raw);
  let best = 0;
  for (const tmpl of Z_TEMPLATES) {
    best = Math.max(best, scoreOf(distanceAtBestAngle(pts, tmpl)));
  }
  const geo = looksLikeZ(raw);
  return { score: best, hit: best >= 0.72 || (geo && best >= 0.55) };
}

export function detourRatio(raw: Pt[]): number {
  if (raw.length < 2) return 1;
  const end = Math.hypot(
    raw[raw.length - 1]!.x - raw[0]!.x,
    raw[raw.length - 1]!.y - raw[0]!.y,
  );
  const len = pathLength(raw);
  return len / Math.max(1, end);
}

export function turnCount(raw: Pt[]): number {
  if (raw.length < 5) return 0;
  const pts = resample(raw, 20);
  let n = 0;
  for (let i = 2; i < pts.length - 2; i++) {
    const a = heading(pts[i - 2]!, pts[i]!);
    const b = heading(pts[i]!, pts[i + 2]!);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.9) n += 1;
  }
  return n;
}
