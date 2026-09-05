import { modeOf, type ModeId } from "./modes";
import { cellsOf, kicksFor } from "./pieces";
import { cloneBoard } from "./replay";
import { fits, pulseAction, type Board, type Piece, type Sim } from "./sim";
import { COLS, HIDDEN_ROWS, ROWS, type PieceId, type Rot } from "./types";

/**
 * Watch-bot. One linear scorer, one real well, every mode that will have it.
 *
 * ES grades a rest. A 2-ply beam (this piece + Hold + NEXT) picks the rest.
 * The current piece is a path: slides, sonic drops, kicks, T-spins. NEXT is
 * still hard-drop only so a phone spawn frame stays cheap, except a T — ply-1
 * peeks twists so Watch holds the T for the slot. Patience tax keeps the I
 * for a Tetris. Setup bias leaves a 3-corner for the T.
 *
 * Mode brains: Sprint dumps, Blitz farms B2B, Siege sends, Marathon keeps
 * the well. Combo and B2B juice stop it plastering a live chain. No Zap,
 * no 4-wide, no net.
 */

export type Step = {
  hold?: boolean;
  left?: boolean;
  right?: boolean;
  cw?: boolean;
  ccw?: boolean;
  flip?: boolean;
  down?: boolean;
  hard?: boolean;
};

export type Placement = {
  hold: boolean;
  rot: Rot;
  x: number;
  y?: number;
  score: number;
  path?: Step[];
  spin?: boolean;
};

/** Gravity-hardened ES weights (stack-rl-gravity). Same features, trained under Guideline G + lock delay. */
export const BOT_WEIGHTS = {
  landing_height: -1.3920137124008525,
  eroded_cells: 0.7443168565143587,
  row_transitions: -0.6205357983860211,
  col_transitions: -1.5945048304698524,
  holes: -2.1316154689587323,
  well_sum: -0.45284699782070337,
  aggregate_height: -0.15688793026906972,
  bumpiness: -0.5535303480548642,
  lines_cleared: -1.0026415166476685,
  is_tetris: 1.3111000111606739,
  max_height: -0.8653253123445759,
  hole_depth: -0.3055007700091851,
} as const;

/** Keep the beam inside one spawn frame on a phone. */
export const BEAM_WIDTH = 8;

/** Zen never tops out, so a bot run has to be told to sit. */
export const ZEN_LOCK_CAP = 80;

export type BotFeatures = {
  landing_height: number;
  eroded_cells: number;
  row_transitions: number;
  col_transitions: number;
  holes: number;
  well_sum: number;
  aggregate_height: number;
  bumpiness: number;
  lines_cleared: number;
  is_tetris: number;
  max_height: number;
  hole_depth: number;
};

export function scoreFeatures(f: BotFeatures): number {
  let n = 0;
  (Object.keys(BOT_WEIGHTS) as (keyof typeof BOT_WEIGHTS)[]).forEach((k) => {
    n += BOT_WEIGHTS[k] * f[k];
  });
  return n;
}

/** Sprint dumps lines. Blitz farms B2B. Siege sends. Marathon keeps the well. */
export function modeBias(mode: ModeId, f: BotFeatures): number {
  if (mode === "sprint")
    return 2.4 * f.lines_cleared + 0.5 * f.eroded_cells - 0.4 * f.max_height;
  if (mode === "blitz")
    return 1.6 * f.is_tetris + 1.1 * f.lines_cleared + 0.55 * f.eroded_cells - 0.18 * f.max_height;
  if (mode === "siege")
    return 1.8 * f.lines_cleared + 0.7 * f.eroded_cells + 0.6 * f.is_tetris - 0.22 * f.max_height;
  if (mode === "arcade" || mode === "classic") return 0.35 * f.lines_cleared;
  return 0.2 * f.is_tetris;
}

type Juice = { combo: number; b2b: boolean };

function juiceOf(sim: Sim): Juice {
  return { combo: sim.combo, b2b: sim.b2b };
}

/** Keep a live combo / B2B instead of a greedy bump. */
function juiceBonus(f: BotFeatures, juice: Juice, id: PieceId, spin: boolean): number {
  let n = 0;
  if (juice.combo >= 0) {
    if (f.lines_cleared > 0) n += 1.2 + 0.42 * juice.combo;
    else n -= 1.7 + 0.28 * Math.max(0, juice.combo);
  }
  if (juice.b2b) {
    const keep = f.is_tetris === 1 || (id === "T" && spin && f.lines_cleared > 0);
    if (keep) n += 2.3;
    else if (f.lines_cleared > 0) n -= 2.7;
  }
  return n;
}

function afterJuice(juice: Juice, f: BotFeatures, id: PieceId, spin: boolean): Juice {
  if (f.lines_cleared <= 0) return { combo: -1, b2b: juice.b2b };
  const difficult = f.is_tetris === 1 || (id === "T" && spin);
  return { combo: juice.combo < 0 ? 0 : juice.combo + 1, b2b: difficult };
}

type Drop = Placement & { board: Board; features: BotFeatures };


/** Drop `id` at `rot, x` (or a known `y` rest). Null if it cannot rest. */
export function evaluateDrop(
  board: Board,
  id: PieceId,
  rot: Rot,
  x: number,
  y?: number,
  pathSpin = false,
): { features: BotFeatures; score: number; board: Board } | null {
  const rest = y ?? restY(board, id, rot, x);
  if (rest == null) return null;
  if (!fits(board, { id, rot, x, y: rest })) return null;
  const placed = cellsOf(id, rot, x, rest).filter((c) => c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS);
  if (placed.length === 0) return null;
  const next = cloneBoard(board);
  for (const c of placed) next[c.y]![c.x] = id;
  const full: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    if (next[row]!.every((cell) => cell !== null)) full.push(row);
  }
  const eroded = placed.reduce((n, c) => n + (full.includes(c.y) ? 1 : 0), 0);
  const cleared = sweep(next, full);
  const heights = colHeights(cleared);
  const { holes, hole_depth } = holeStats(cleared);
  const features: BotFeatures = {
    landing_height: placed.reduce((n, c) => n + (ROWS - c.y), 0) / placed.length,
    eroded_cells: eroded,
    row_transitions: rowTransitions(cleared),
    col_transitions: colTransitions(cleared),
    holes,
    well_sum: wellSum(cleared),
    aggregate_height: heights.reduce((n, h) => n + h, 0),
    bumpiness: bumpiness(heights),
    lines_cleared: full.length,
    is_tetris: full.length === 4 ? 1 : 0,
    max_height: heights.reduce((n, h) => Math.max(n, h), 0),
    hole_depth,
  };
  const spin = spinBonus(board, id, rot, x, rest, full.length, pathSpin);
  const setup = setupBonus(cleared, id, features.max_height);
  return { features, score: scoreFeatures(features) + spin + setup, board: cleared };
}

/**
 * Can this piece rotate (cw, the way the bot actually turns) and shift to
 * `rot, x` from where it is? Classic has no kicks, so a rest that needs a
 * wall kick is not a rest.
 */
export function reachable(
  board: Board,
  from: Piece,
  destRot: Rot,
  destX: number,
  kicks: boolean,
): boolean {
  let p: Piece = { ...from };
  let turns = 0;
  while (p.rot !== destRot && turns < 4) {
    const to = (((p.rot + 1) % 4) + 4) % 4 as Rot;
    const table = kicks ? kicksFor(p.id, p.rot, to) : [{ x: 0, y: 0 }];
    let next: Piece | null = null;
    for (const k of table) {
      const cand: Piece = { id: p.id, rot: to, x: p.x + k.x, y: p.y - k.y };
      if (fits(board, cand)) {
        next = cand;
        break;
      }
    }
    if (!next) return false;
    p = next;
    turns += 1;
  }
  if (p.rot !== destRot) return false;
  while (p.x < destX) {
    const cand = { ...p, x: p.x + 1 };
    if (!fits(board, cand)) return false;
    p = cand;
  }
  while (p.x > destX) {
    const cand = { ...p, x: p.x - 1 };
    if (!fits(board, cand)) return false;
    p = cand;
  }
  return restY(board, p.id, p.rot, p.x) != null;
}

export function pickPlacement(sim: Sim): Placement | null {
  const current = sim.piece;
  if (!current) return null;
  const kicks = modeOf(sim.mode).kicks;
  const juice = juiceOf(sim);
  const ply0 = collectDrops(sim.board, current, false, kicks, sim.mode, true, juice);
  if (sim.canHold) {
    const other = sim.hold ?? sim.next[0];
    if (other) ply0.push(...collectDrops(sim.board, spawnOf(other), true, kicks, sim.mode, true, juice));
  }
  if (ply0.length === 0) return null;

  const beam = topK(ply0, BEAM_WIDTH);
  let best: Placement | null = null;
  let bestLeaf = -Infinity;
  for (const drop of beam) {
    const placed = drop.hold ? (sim.hold ?? sim.next[0] ?? current.id) : current.id;
    const follow = followState(sim, drop.hold);
    const leaf = peekNext(drop, follow, kicks, sim.mode, afterJuice(juice, drop.features, placed, !!drop.spin));
    if (leaf > bestLeaf) {
      bestLeaf = leaf;
      best = {
        hold: drop.hold,
        rot: drop.rot,
        x: drop.x,
        y: drop.y,
        score: leaf,
        path: drop.path,
        spin: drop.spin,
      };
    }
  }
  return best;
}

/**
 * Play the pick on the live sim: Hold if asked, rotate, shift, hard drop.
 * Same path a thumb uses. No score is written here.
 */
export function playPlacement(sim: Sim, pick: Placement): ReturnType<typeof pulseAction> {
  if (pick.hold && sim.canHold) pulseAction(sim, { hold: true });
  if (pick.path && pick.path.length) {
    for (const step of pick.path) pulseAction(sim, step);
    return pulseAction(sim, { hard: true });
  }
  let guard = 20;
  while (sim.piece && sim.piece.rot !== pick.rot && guard--) {
    const before = sim.piece.rot;
    pulseAction(sim, { cw: true });
    if (sim.piece.rot === before) {
      pulseAction(sim, { flip: true });
      if (sim.piece.rot === before) break;
    }
  }
  guard = 20;
  while (sim.piece && sim.piece.x < pick.x && guard--) {
    const before = sim.piece.x;
    pulseAction(sim, { right: true });
    if (sim.piece.x === before) break;
  }
  while (sim.piece && sim.piece.x > pick.x && guard--) {
    const before = sim.piece.x;
    pulseAction(sim, { left: true });
    if (sim.piece.x === before) break;
  }
  return pulseAction(sim, { hard: true });
}

export type BotHand = Placement & {
  wait: number;
  held: boolean;
  turns: number;
  i: number;
  das: boolean;
};

export function armBot(sim: Sim, think: number): BotHand | null {
  const pick = pickPlacement(sim);
  if (!pick) return null;
  return { ...pick, wait: think, held: false, turns: 0, i: 0, das: false };
}

/** One pulse along the path. Null means still thinking. */
export function playStep(sim: Sim, hand: BotHand): ReturnType<typeof pulseAction> | null {
  if (hand.hold && !hand.held && sim.canHold) {
    hand.held = true;
    return pulseAction(sim, { hold: true });
  }
  const path = hand.path;
  if (!path || hand.i >= path.length) {
    if (!sim.piece) return null;
    return pulseAction(sim, { hard: true });
  }
  if (path[hand.i]!.down) {
    const restDown = path.slice(hand.i).every((s) => s.down);
    const sonic = restDown && (sim.lockT > 0 || sim.level >= 8);
    if (sonic) {
      let moved = false;
      while (hand.i < path.length && path[hand.i]!.down) {
        const ev = pulseAction(sim, { down: true });
        if (ev === "move") moved = true;
        hand.i += 1;
      }
      return moved ? "move" : "none";
    }
    const ev = pulseAction(sim, { down: true });
    hand.i += 1;
    return ev;
  }
  const step = path[hand.i]!;
  hand.i += 1;
  return pulseAction(sim, step);
}

/** Gap before the next input. Zero in qa so probes stay fast. */
export function nextGap(hand: BotHand, sim: Sim, qa: boolean): number {
  if (qa) return 0;
  const step = hand.path?.[hand.i];
  if (!step || step.hard) return 0;
  if (sim.lockT > 0) return 0;
  if (step.down) return sim.level >= 10 ? 0 : 0.016;
  if (step.left || step.right) {
    const g = hand.das ? 0.026 : 0.085;
    hand.das = true;
    return g;
  }
  if (step.cw || step.ccw || step.flip) {
    hand.das = false;
    return 0.05;
  }
  if (step.hold) return 0.07;
  return 0.03;
}

function spawnOf(id: PieceId): Piece {
  return { id, rot: 0, x: 3, y: 0 };
}

function rotsOf(id: PieceId): Rot[] {
  if (id === "O") return [0];
  if (id === "I" || id === "S" || id === "Z") return [0, 1];
  return [0, 1, 2, 3];
}

type Rest = { rot: Rot; x: number; y: number; path: Step[]; spin: boolean };

function hardRests(board: Board, from: Piece, kicks: boolean): Rest[] {
  const out: Rest[] = [];
  for (const rot of rotsOf(from.id)) {
    for (let x = -2; x <= 8; x++) {
      if (!reachable(board, from, rot, x, kicks)) continue;
      const y = restY(board, from.id, rot, x);
      if (y == null) continue;
      out.push({ rot, x, y, path: [], spin: false });
    }
  }
  return out;
}

function searchRests(board: Board, from: Piece, kicks: boolean): Rest[] {
  const start: Piece = { id: from.id, rot: from.rot, x: from.x, y: from.y };
  if (!fits(board, start)) return hardRests(board, from, kicks);
  const keyOf = (x: number, y: number, rot: number) => ((y + 4) * 16 + (x + 3)) * 4 + rot;
  const seen = new Set<number>();
  type Node = { x: number; y: number; rot: Rot; prev: number; move: Step | null };
  const q: Node[] = [{ x: start.x, y: start.y, rot: start.rot, prev: -1, move: null }];
  seen.add(keyOf(start.x, start.y, start.rot));
  const byKey = new Map<number, Rest>();

  const rebuild = (i: number): Step[] => {
    const steps: Step[] = [];
    let n = q[i]!;
    while (n.prev >= 0 && n.move) {
      steps.push(n.move);
      n = q[n.prev]!;
    }
    steps.reverse();
    return steps;
  };

  const tryKick = (p: Piece, dir: 1 | -1): Piece | null => {
    const to = ((((p.rot + dir) % 4) + 4) % 4) as Rot;
    const table = kicks ? kicksFor(p.id, p.rot, to) : [{ x: 0, y: 0 }];
    for (const k of table) {
      const cand: Piece = { id: p.id, rot: to, x: p.x + k.x, y: p.y - k.y };
      if (fits(board, cand)) return cand;
    }
    return null;
  };

  for (let i = 0; i < q.length && i < 520; i++) {
    const n = q[i]!;
    const p: Piece = { id: from.id, rot: n.rot, x: n.x, y: n.y };
    const grounded = !fits(board, { ...p, y: p.y + 1 });
    const k = keyOf(n.x, n.y, n.rot);
    const spun = !!(n.move?.cw || n.move?.ccw || n.move?.flip);
    if (grounded) {
      const prev = byKey.get(k);
      if (!prev) byKey.set(k, { rot: n.rot, x: n.x, y: n.y, path: rebuild(i), spin: spun });
      else if (spun && !prev.spin) {
        prev.spin = true;
        prev.path = rebuild(i);
      }
    }

    const push = (next: Piece, move: Step) => {
      const nk = keyOf(next.x, next.y, next.rot);
      if (seen.has(nk)) {
        if (!fits(board, { ...next, y: next.y + 1 }) && (move.cw || move.ccw || move.flip)) {
          const rest = byKey.get(nk);
          if (rest && !rest.spin) {
            rest.spin = true;
            rest.path = rebuild(i).concat(move);
          }
        }
        return;
      }
      if (!fits(board, next)) return;
      if (next.y < -2 || next.y >= ROWS || next.x < -3 || next.x > 12) return;
      seen.add(nk);
      q.push({ x: next.x, y: next.y, rot: next.rot, prev: i, move });
    };

    push({ ...p, x: p.x - 1 }, { left: true });
    push({ ...p, x: p.x + 1 }, { right: true });
    push({ ...p, y: p.y + 1 }, { down: true });
    const cw = tryKick(p, 1);
    if (cw) push(cw, { cw: true });
    const ccw = tryKick(p, -1);
    if (ccw) push(ccw, { ccw: true });
  }

  const rests = [...byKey.values()];
  return rests.length ? rests : hardRests(board, from, kicks);
}

function collectDrops(
  board: Board,
  from: Piece,
  hold: boolean,
  kicks: boolean,
  mode: ModeId,
  paths: boolean,
  juice: Juice,
): Drop[] {
  const before = colHeights(board);
  const well = maxWell(before);
  const danger = before.reduce((n, h) => Math.max(n, h), 0) >= 14;
  const out: Drop[] = [];
  const rests = paths ? searchRests(board, from, kicks) : hardRests(board, from, kicks);
  for (const rest of rests) {
    const hit = evaluateDrop(board, from.id, rest.rot, rest.x, rest.y, rest.spin);
    if (!hit) continue;
    out.push({
      hold,
      rot: rest.rot,
      x: rest.x,
      y: rest.y,
      path: rest.path,
      spin: rest.spin,
      score:
        hit.score +
        modeBias(mode, hit.features) +
        greedTax(mode, from.id, hit.features, well, danger) +
        juiceBonus(hit.features, juice, from.id, rest.spin) -
        (hold ? 1e-6 : 0),
      board: hit.board,
      features: hit.features,
    });
  }
  return out;
}

function topK(drops: Drop[], k: number): Drop[] {
  if (drops.length <= k) return drops;
  return drops.sort((a, b) => b.score - a.score).slice(0, k);
}

type Follow = {
  falling: PieceId | null;
  hold: PieceId | null;
  canHold: boolean;
  queue: PieceId[];
};

function followState(sim: Sim, held: boolean): Follow {
  const q = sim.next;
  const current = sim.piece!.id;
  if (!held) {
    return { falling: q[0] ?? null, hold: sim.hold, canHold: true, queue: q.slice(1) };
  }
  if (sim.hold) {
    return { falling: q[0] ?? null, hold: current, canHold: false, queue: q.slice(1) };
  }
  return { falling: q[1] ?? null, hold: current, canHold: false, queue: q.slice(2) };
}

function peekNext(drop: Drop, follow: Follow, kicks: boolean, mode: ModeId, juice: Juice): number {
  if (!follow.falling) return drop.score;
  const ply1 = collectDrops(
    drop.board,
    spawnOf(follow.falling),
    false,
    kicks,
    mode,
    follow.falling === "T",
    juice,
  );
  if (follow.canHold) {
    const other = follow.hold ?? follow.queue[0];
    if (other)
      ply1.push(
        ...collectDrops(drop.board, spawnOf(other), true, kicks, mode, other === "T", juice),
      );
  }
  if (ply1.length === 0) return drop.score - 48;
  let leaf = ply1[0]!.score;
  for (let i = 1; i < ply1.length; i++) {
    const s = ply1[i]!.score;
    if (s > leaf) leaf = s;
  }
  return leaf + 0.2 * drop.score;
}

/** A T that twists into a 3-corner slot and clears is the human line. */
function spinBonus(
  board: Board,
  id: PieceId,
  rot: Rot,
  x: number,
  y: number,
  lines: number,
  pathSpin: boolean,
): number {
  if (id !== "T") return 0;
  const solid = (cx: number, cy: number) => {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return true;
    return board[cy]![cx] !== null;
  };
  const corners =
    Number(solid(x, y)) + Number(solid(x + 2, y)) + Number(solid(x, y + 2)) + Number(solid(x + 2, y + 2));
  if (corners < 3) return 0;
  if (pathSpin) return lines >= 2 ? 4.8 : lines === 1 ? 2.6 : 0.35;
  if (lines < 1) return 0;
  return lines >= 2 ? 2.2 : 1.1;
}

/**
 * Leave a 3-corner for the T. One TSD cavity beats plastering the bump.
 * Under the ceiling, just survive.
 */
function setupBonus(board: Board, placed: PieceId, maxHeight: number): number {
  if (maxHeight >= 14) return 0;
  const slot = bestTSlot(board);
  if (!slot) return 0;
  const keep = placed === "T" ? 0.28 : 1;
  if (slot >= 2) return 1.7 * keep;
  return 0.55 * keep;
}

function bestTSlot(board: Board): 0 | 1 | 2 {
  const heights = colHeights(board);
  let peak = 0;
  for (const h of heights) if (h > peak) peak = h;
  if (peak < 2) return 0;
  const yMin = Math.max(0, ROWS - peak - 4);
  let best: 0 | 1 | 2 = 0;
  for (let x = -1; x <= 8; x++) {
    for (let y = yMin; y < ROWS - 1; y++) {
      const n = tSlotAt(board, x, y);
      if (n > best) {
        best = n;
        if (best >= 2) return 2;
      }
    }
  }
  return best;
}

function tSlotAt(board: Board, x: number, y: number): 0 | 1 | 2 {
  const solid = (cx: number, cy: number) => {
    if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
    if (cy < 0) return false;
    return board[cy]![cx] !== null;
  };
  const corners =
    Number(solid(x, y)) + Number(solid(x + 2, y)) + Number(solid(x, y + 2)) + Number(solid(x + 2, y + 2));
  if (corners < 3) return 0;
  let best: 0 | 1 | 2 = 0;
  for (let r = 0; r < 4; r++) {
    const rot = r as Rot;
    const p = { id: "T" as const, rot, x, y };
    if (!fits(board, p)) continue;
    if (fits(board, { ...p, y: y + 1 })) continue;
    const cells = cellsOf("T", rot, x, y);
    const rows = new Set<number>();
    for (const c of cells) rows.add(c.y);
    let lines = 0;
    for (const ry of rows) {
      if (ry < 0 || ry >= ROWS) continue;
      let filled = 0;
      for (let cx = 0; cx < COLS; cx++) {
        if (board[ry]![cx]) {
          filled += 1;
          continue;
        }
        for (const c of cells) {
          if (c.x === cx && c.y === ry) {
            filled += 1;
            break;
          }
        }
      }
      if (filled === COLS) lines += 1;
    }
    if (lines >= 2) return 2;
    if (lines === 1) best = 1;
  }
  return best;
}

/** Sprint / Blitz dump. Siege sends. Marathon waits for a Tetris. */
function greedTax(
  mode: ModeId,
  id: PieceId,
  f: BotFeatures,
  well: number,
  danger: boolean,
): number {
  if (mode === "sprint" || mode === "blitz" || mode === "finesse") return 0;
  if (danger) return f.lines_cleared > 0 ? 1.1 * f.lines_cleared : 0;
  if (mode === "siege") {
    let n = 0;
    if (f.is_tetris) n += 1.5;
    if (f.lines_cleared >= 2) n += 0.6 * f.lines_cleared;
    if (id === "I" && f.lines_cleared > 0 && f.lines_cleared < 4 && well >= 3) n -= 1.5;
    return n;
  }
  let n = 0;
  if (f.is_tetris) n += 2.6;
  if (id === "I" && f.lines_cleared > 0 && f.lines_cleared < 4 && well >= 2) n -= 3.4;
  else if (id === "I" && f.lines_cleared === 0 && well >= 3) n -= 2.0;
  else if (f.lines_cleared === 1 && well >= 3) n -= 1.8;
  else if (f.lines_cleared === 2 && well >= 4) n -= 1.2;
  return n;
}

function maxWell(heights: number[]): number {
  let m = 0;
  for (let x = 0; x < heights.length; x++) {
    const left = x === 0 ? 99 : heights[x - 1]!;
    const right = x === heights.length - 1 ? 99 : heights[x + 1]!;
    const d = Math.min(left, right) - heights[x]!;
    if (d > m) m = d;
  }
  return m;
}

function restY(board: Board, id: PieceId, rot: Rot, x: number): number | null {
  let y = 0;
  if (!fits(board, { id, rot, x, y })) {
    if (!fits(board, { id, rot, x, y: 1 })) return null;
    y = 1;
  }
  while (fits(board, { id, rot, x, y: y + 1 })) y += 1;
  return y;
}

function sweep(board: Board, full: number[]): Board {
  if (full.length === 0) return board;
  const drop = new Set(full);
  const kept: Board = [];
  for (let y = 0; y < ROWS; y++) {
    if (!drop.has(y)) kept.push(board[y]!);
  }
  while (kept.length < ROWS) kept.unshift(Array.from({ length: COLS }, () => null));
  for (let y = 0; y < ROWS; y++) board[y] = kept[y]!;
  return board;
}

function colHeights(board: Board): number[] {
  const h = Array.from({ length: COLS }, () => 0);
  for (let x = 0; x < COLS; x++) {
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      if (board[y]![x]) {
        h[x] = ROWS - y;
        break;
      }
    }
  }
  return h;
}

function holeStats(board: Board): { holes: number; hole_depth: number } {
  let holes = 0;
  let hole_depth = 0;
  for (let x = 0; x < COLS; x++) {
    let roof = 0;
    let seen = false;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      if (board[y]![x]) {
        seen = true;
        roof += 1;
      } else if (seen) {
        holes += 1;
        hole_depth += roof;
      }
    }
  }
  return { holes, hole_depth };
}

function rowTransitions(board: Board): number {
  let n = 0;
  for (let y = HIDDEN_ROWS; y < ROWS; y++) {
    let prev = true;
    for (let x = 0; x < COLS; x++) {
      const filled = board[y]![x] !== null;
      if (filled !== prev) n += 1;
      prev = filled;
    }
    if (!prev) n += 1;
  }
  return n;
}

function colTransitions(board: Board): number {
  let n = 0;
  for (let x = 0; x < COLS; x++) {
    let prev = false;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      const filled = board[y]![x] !== null;
      if (filled !== prev) n += 1;
      prev = filled;
    }
    if (!prev) n += 1;
  }
  return n;
}

function wellSum(board: Board): number {
  let n = 0;
  for (let x = 0; x < COLS; x++) {
    let depth = 0;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      const empty = board[y]![x] === null;
      const left = x === 0 || board[y]![x - 1] !== null;
      const right = x === COLS - 1 || board[y]![x + 1] !== null;
      if (empty && left && right) {
        depth += 1;
        n += depth;
      } else {
        depth = 0;
      }
    }
  }
  return n;
}

function bumpiness(h: number[]): number {
  let n = 0;
  for (let i = 0; i < h.length - 1; i++) n += Math.abs(h[i]! - h[i + 1]!);
  return n;
}
