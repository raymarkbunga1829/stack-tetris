/**
 * Browser-portable MLP policy/value inference for stack-rl-az.
 * Load weights from policy.json (arch + weights).
 *
 * State encoding (Float32Array length 274):
 *   [0..219]  board 22x10 occupancy, row-major, y=0 at top
 *   [220..226] current piece one-hot (I O T S Z J L)
 *   [227..234] hold one-hot (index 0 = empty, 1..7 = pieces)
 *   [235..269] next[5] one-hot x 7
 *   [270] can_hold, [271] level/50, [272] lines/500, [273] b2b
 *
 * Action index: hold*56 + rot*14 + (x+2), size 112. Mask illegal before softmax.
 */
export type PolicyJSON = {
  arch: { state_dim: number; action_size: number; hidden: number };
  weights: Record<string, number[][] | number[]>;
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
  // masked softmax
  let m = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (mask && mask[i] === 0) { logits[i] = -1e9; continue; }
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
