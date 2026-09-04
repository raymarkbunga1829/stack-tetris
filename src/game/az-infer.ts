/**
 * Browser MLP policy/value for the Watch bot.
 *
 * State encoding (Float32Array length 274):
 *   [0..219]  board 22x10 occupancy, row-major, y=0 at top
 *   [220..226] current piece one-hot (I O T S Z J L)
 *   [227..234] hold one-hot (index 0 = empty, 1..7 = pieces)
 *   [235..269] next[5] one-hot x 7
 *   [270] can_hold, [271] level/50, [272] lines/500, [273] b2b
 *
 * Action index: hold*56 + rot*14 + (x+2), size 112. Mask illegal before softmax.
 *
 * Pure net is weak on this checkpoint. PUCT keeps a 0.45 Dellacherie/ES prior
 * blend so the slam stays in the 500k eval band.
 */
import type { Board, Sim } from "./sim";
import { COLS, PIECE_IDS, ROWS, type PieceId } from "./types";

export const AZ_STATE_DIM = 274;
export const AZ_ACTION_SIZE = 112;
export const AZ_HIDDEN = 256;
export const DELL_BLEND = 0.45;
export const C_PUCT = 1.5;

export type PolicyJSON = {
  arch: { state_dim: number; action_size: number; hidden: number };
  weights: Record<string, number[][] | number[]>;
};

export type PackedPolicy = {
  arch: { state_dim: number; action_size: number; hidden: number };
  fc1w: Float32Array;
  fc1b: Float32Array;
  fc2w: Float32Array;
  fc2b: Float32Array;
  fc3w: Float32Array;
  fc3b: Float32Array;
  polw: Float32Array;
  polb: Float32Array;
  valw: Float32Array;
  valb: Float32Array;
};

export type AzView = {
  board: Board;
  current: PieceId;
  hold: PieceId | null;
  canHold: boolean;
  next: PieceId[];
  level: number;
  lines: number;
  b2b: boolean;
};

function relu(x: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i++) if (x[i]! < 0) x[i] = 0;
  return x;
}

function linear(x: Float32Array, w: number[][], b: number[]): Float32Array {
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) {
    let s = b[i]!;
    const row = w[i]!;
    for (let j = 0; j < x.length; j++) s += row[j]! * x[j]!;
    out[i] = s;
  }
  return out;
}

function gemv(w: Float32Array, b: Float32Array, x: Float32Array, outN: number, inN: number): Float32Array {
  const out = new Float32Array(outN);
  for (let i = 0; i < outN; i++) {
    let s = b[i]!;
    const off = i * inN;
    for (let j = 0; j < inN; j++) s += w[off + j]! * x[j]!;
    out[i] = s;
  }
  return out;
}

function flatten(rows: number[][]): Float32Array {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const out = new Float32Array(h * w);
  let k = 0;
  for (let i = 0; i < h; i++) {
    const row = rows[i]!;
    for (let j = 0; j < w; j++) out[k++] = row[j]!;
  }
  return out;
}

function vec(a: number[]): Float32Array {
  return Float32Array.from(a);
}

export function packPolicy(policy: PolicyJSON): PackedPolicy {
  const W = policy.weights;
  return {
    arch: {
      state_dim: policy.arch.state_dim,
      action_size: policy.arch.action_size,
      hidden: policy.arch.hidden,
    },
    fc1w: flatten(W["fc1.weight"] as number[][]),
    fc1b: vec(W["fc1.bias"] as number[]),
    fc2w: flatten(W["fc2.weight"] as number[][]),
    fc2b: vec(W["fc2.bias"] as number[]),
    fc3w: flatten(W["fc3.weight"] as number[][]),
    fc3b: vec(W["fc3.bias"] as number[]),
    polw: flatten(W["policy.weight"] as number[][]),
    polb: vec(W["policy.bias"] as number[]),
    valw: flatten(W["value.weight"] as number[][]),
    valb: vec(W["value.bias"] as number[]),
  };
}

/** One forward pass. mask: Float32Array of 0/1 length action_size (optional). */
export function infer(policy: PolicyJSON, state: Float32Array, mask?: Float32Array) {
  const W = policy.weights;
  let h = linear(state, W["fc1.weight"] as number[][], W["fc1.bias"] as number[]);
  h = relu(h);
  h = relu(linear(h, W["fc2.weight"] as number[][], W["fc2.bias"] as number[]));
  h = relu(linear(h, W["fc3.weight"] as number[][], W["fc3.bias"] as number[]));
  const logits = linear(h, W["policy.weight"] as number[][], W["policy.bias"] as number[]);
  const vArr = linear(h, W["value.weight"] as number[][], W["value.bias"] as number[]);
  const value = Math.tanh(vArr[0]!);
  return softmaxLogits(logits, mask, value);
}

export function inferPacked(p: PackedPolicy, state: Float32Array, mask?: Float32Array) {
  const hid = p.arch.hidden;
  const inD = p.arch.state_dim;
  const act = p.arch.action_size;
  let h = relu(gemv(p.fc1w, p.fc1b, state, hid, inD));
  h = relu(gemv(p.fc2w, p.fc2b, h, hid, hid));
  h = relu(gemv(p.fc3w, p.fc3b, h, hid, hid));
  const logits = gemv(p.polw, p.polb, h, act, hid);
  const vArr = gemv(p.valw, p.valb, h, 1, hid);
  return softmaxLogits(logits, mask, Math.tanh(vArr[0]!));
}

function softmaxLogits(logits: Float32Array, mask: Float32Array | undefined, value: number) {
  let m = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (mask && mask[i] === 0) {
      logits[i] = -1e9;
      continue;
    }
    if (logits[i]! > m) m = logits[i]!;
  }
  let sum = 0;
  const prior = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i]! - m);
    prior[i] = e;
    sum += e;
  }
  for (let i = 0; i < prior.length; i++) prior[i] = prior[i]! / (sum || 1);
  return { prior, value };
}

export function actionIndex(useHold: boolean, rot: number, x: number): number {
  const xi = Math.max(0, Math.min(13, x + 2));
  return (useHold ? 1 : 0) * 56 + (rot % 4) * 14 + xi;
}

export function encodeState(v: AzView): Float32Array {
  const s = new Float32Array(AZ_STATE_DIM);
  let i = 0;
  for (let y = 0; y < ROWS; y++) {
    const row = v.board[y];
    for (let x = 0; x < COLS; x++) s[i++] = row?.[x] ? 1 : 0;
  }
  const cur = PIECE_IDS.indexOf(v.current);
  if (cur >= 0) s[220 + cur] = 1;
  if (!v.hold) s[227] = 1;
  else {
    const h = PIECE_IDS.indexOf(v.hold);
    if (h >= 0) s[228 + h] = 1;
  }
  for (let n = 0; n < 5; n++) {
    const id = v.next[n];
    if (!id) continue;
    const p = PIECE_IDS.indexOf(id);
    if (p >= 0) s[235 + n * 7 + p] = 1;
  }
  s[270] = v.canHold ? 1 : 0;
  s[271] = v.level / 50;
  s[272] = v.lines / 500;
  s[273] = v.b2b ? 1 : 0;
  return s;
}

export function encodeSim(sim: Sim): Float32Array | null {
  if (!sim.piece) return null;
  return encodeState({
    board: sim.board,
    current: sim.piece.id,
    hold: sim.hold,
    canHold: sim.canHold,
    next: sim.next,
    level: sim.level,
    lines: sim.lines,
    b2b: sim.b2b,
  });
}

let packed: PackedPolicy | null = null;
let loading: Promise<PackedPolicy | null> | null = null;

export function azPolicy(): PackedPolicy | null {
  return packed;
}

export function ensureAzPolicy(): Promise<PackedPolicy | null> {
  if (packed) return Promise.resolve(packed);
  if (loading) return loading;
  if (typeof fetch === "undefined") return Promise.resolve(null);
  loading = fetch("/bot/policy.json")
    .then((r) => {
      if (!r.ok) throw new Error(`policy ${r.status}`);
      return r.json() as Promise<PolicyJSON>;
    })
    .then((j) => {
      packed = packPolicy(j);
      return packed;
    })
    .catch((err) => {
      console.warn("[stack] az policy", err);
      return null;
    });
  return loading;
}
