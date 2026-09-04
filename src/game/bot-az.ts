/**
 * AlphaZero-shaped Watch bot: MLP policy/value + PUCT over hard-drop
 * placements, with a 0.45 Dellacherie prior blend. One pick, then one slam.
 */
import {
  AZ_ACTION_SIZE,
  C_PUCT,
  DELL_BLEND,
  actionIndex,
  azPolicy,
  encodeSim,
  encodeState,
  inferPacked,
  type AzView,
} from "./az-infer";
import { evaluateDrop, listPlacements, pickPlacement, type Placement } from "./bot";
import { gravityInterval, headroom, type Sim } from "./sim";

export type AzSearch = {
  sims: number;
  budgetMs: number;
};

export function azSearchFor(sim: Sim, pace: 1 | 2, phone: boolean, qa: boolean): AzSearch {
  const gMs = gravityInterval(sim.level) * 1000;
  if (qa) return { sims: 8, budgetMs: Math.min(4, gMs * 0.5) };
  const base = phone ? 24 : 48;
  const sims = pace === 2 ? (phone ? 32 : 48) : base;
  const cap = phone ? 8 : 12;
  return { sims, budgetMs: Math.min(cap, Math.max(3, gMs * 0.5)) };
}

export function lockRisk(sim: Sim): boolean {
  return gravityInterval(sim.level) < 0.08 || headroom(sim) < 6;
}

export function pickAzPlacement(sim: Sim, search: AzSearch): Placement | null {
  const legal = listPlacements(sim);
  if (legal.length === 0) return null;
  const packed = azPolicy();
  if (!packed) return pickPlacement(sim);

  const state = encodeSim(sim);
  if (!state) return pickPlacement(sim);

  const mask = new Float32Array(AZ_ACTION_SIZE);
  const idxOf: number[] = [];
  for (const p of legal) {
    const idx = actionIndex(p.hold, p.rot, p.x);
    idxOf.push(idx);
    mask[idx] = 1;
  }
  const { prior, value: vRoot } = inferPacked(packed, state, mask);

  const n = legal.length;
  const P = new Float32Array(n);
  let maxDell = -Infinity;
  for (const p of legal) if (p.score > maxDell) maxDell = p.score;
  let esSum = 0;
  const es = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const e = Math.exp((legal[i]!.score - maxDell) / 1.5);
    es[i] = e;
    esSum += e;
  }
  let pSum = 0;
  for (let i = 0; i < n; i++) {
    const piNet = prior[idxOf[i]!] ?? 0;
    const piEs = es[i]! / (esSum || 1);
    P[i] = (1 - DELL_BLEND) * piNet + DELL_BLEND * piEs;
    pSum += P[i]!;
  }
  if (pSum > 0) for (let i = 0; i < n; i++) P[i] = P[i]! / pSum;

  const W = new Float32Array(n);
  const visits = new Int32Array(n);
  let N = 0;
  const deadline = performance.now() + search.budgetMs;
  const maxSims = Math.max(1, search.sims);

  for (let s = 0; s < maxSims; s++) {
    if (s > 0 && performance.now() >= deadline) break;
    let bestI = 0;
    let bestU = -Infinity;
    const sqrtN = Math.sqrt(N + 1e-6);
    for (let i = 0; i < n; i++) {
      const q = visits[i]! > 0 ? W[i]! / visits[i]! : 0;
      const u = q + (C_PUCT * P[i]! * sqrtN) / (1 + visits[i]!);
      if (u > bestU) {
        bestU = u;
        bestI = i;
      }
    }
    const a = legal[bestI]!;
    let v = (1 - DELL_BLEND) * vRoot + DELL_BLEND * Math.tanh(a.score / 8);
    if (visits[bestI] === 0 && s > 0 && performance.now() + 1.2 < deadline) {
      const leaf = encodeAfter(sim, a);
      if (leaf) v = inferPacked(packed, leaf).value;
    }
    W[bestI] += v;
    visits[bestI] += 1;
    N += 1;
  }

  let pick = 0;
  for (let i = 1; i < n; i++) {
    const a = visits[i]!;
    const b = visits[pick]!;
    if (a > b) pick = i;
    else if (a === b) {
      const qa = visits[i]! > 0 ? W[i]! / visits[i]! : P[i]!;
      const qb = visits[pick]! > 0 ? W[pick]! / visits[pick]! : P[pick]!;
      if (qa > qb) pick = i;
    }
  }
  return legal[pick] ?? legal[0]!;
}

function encodeAfter(sim: Sim, a: Placement): Float32Array | null {
  if (!sim.piece) return null;
  const id = a.hold ? (sim.hold ?? sim.next[0]) : sim.piece.id;
  if (!id) return null;
  const hit = evaluateDrop(sim.board, id, a.rot, a.x);
  if (!hit) return null;
  let hold = sim.hold;
  const next = sim.next.slice();
  if (a.hold && sim.canHold) {
    if (hold == null) {
      hold = sim.piece.id;
      next.shift();
    } else {
      hold = sim.piece.id;
    }
  }
  const current = next[0] ?? id;
  const preview = next[0] === current ? next.slice(1) : next.slice();
  const view: AzView = {
    board: hit.board,
    current,
    hold,
    canHold: true,
    next: preview,
    level: sim.level,
    lines: sim.lines + hit.features.lines_cleared,
    b2b: hit.features.lines_cleared === 4 || (hit.features.lines_cleared === 0 && sim.b2b),
  };
  return encodeState(view);
}
