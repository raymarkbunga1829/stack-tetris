import { modeOf, type ModeId } from "./modes";
import { cellsOf, kicksFor } from "./pieces";
import { cloneBoard } from "./replay";
import { fits, pulseAction, type Board, type Piece, type Sim } from "./sim";
import { COLS, HIDDEN_ROWS, ROWS, type PieceId, type Rot } from "./types";

/**
 * Watch-bot. One linear scorer, one real well, every mode that will have it.
 *
 * ES still grades a rest. A 2-ply beam (this piece + Hold + NEXT) picks the
 * rest that leaves the next piece a good board. Patience tax: keep the I for
 * a Tetris, skip cheap singles that eat the well. Hard-drop only: no tucks,
 * no Zap, no 4-wide, no net.
 */

export type Placement = {
  hold: boolean;
  rot: Rot;
  x: number;
  score: number;
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

/** Sprint has to finish forty, not stack forever. Other modes keep the table. */
export function modeBias(mode: ModeId, f: BotFeatures): number {
  if (mode === "sprint") return 1.8 * f.lines_cleared - 0.2 * f.max_height;
  return 0;
}

type Drop = Placement & { board: Board; features: BotFeatures };

/** Drop `id` at `rot, x` onto a copy of the board. Null if it cannot rest. */
export function evaluateDrop(
  board: Board,
  id: PieceId,
  rot: Rot,
  x: number,
): { features: BotFeatures; score: number; board: Board } | null {
  const y = restY(board, id, rot, x);
  if (y == null) return null;
  const placed = cellsOf(id, rot, x, y).filter((c) => c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS);
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
  const spin = spinBonus(board, id, rot, x, y, full.length);
  return { features, score: scoreFeatures(features) + spin, board: cleared };
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
  const ply0 = collectDrops(sim.board, current, false, kicks, sim.mode);
  if (sim.canHold) {
    const other = sim.hold ?? sim.next[0];
    if (other) ply0.push(...collectDrops(sim.board, spawnOf(other), true, kicks, sim.mode));
  }
  if (ply0.length === 0) return null;

  const beam = topK(ply0, BEAM_WIDTH);
  let best: Placement | null = null;
  let bestLeaf = -Infinity;
  for (const drop of beam) {
    const follow = followState(sim, drop.hold);
    const leaf = peekNext(drop, follow, kicks, sim.mode);
    if (leaf > bestLeaf) {
      bestLeaf = leaf;
      best = { hold: drop.hold, rot: drop.rot, x: drop.x, score: leaf };
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
};

export function armBot(sim: Sim, think: number): BotHand | null {
  const pick = pickPlacement(sim);
  if (!pick) return null;
  return { ...pick, wait: think, held: false, turns: 0 };
}

/** One pulse toward the pick. Null pulse means wait. */
export function botPulse(
  sim: Sim,
  hand: BotHand,
): { hold?: boolean; cw?: boolean; left?: boolean; right?: boolean; hard?: boolean } | null {
  const p = sim.piece;
  if (!p) return { hard: true };
  if (hand.hold && !hand.held && sim.canHold) return { hold: true };
  if (p.rot !== hand.rot) return { cw: true };
  if (p.x < hand.x) return { right: true };
  if (p.x > hand.x) return { left: true };
  return { hard: true };
}

function spawnOf(id: PieceId): Piece {
  return { id, rot: 0, x: 3, y: 0 };
}

function rotsOf(id: PieceId): Rot[] {
  if (id === "O") return [0];
  if (id === "I" || id === "S" || id === "Z") return [0, 1];
  return [0, 1, 2, 3];
}

function collectDrops(
  board: Board,
  from: Piece,
  hold: boolean,
  kicks: boolean,
  mode: ModeId,
): Drop[] {
  const before = colHeights(board);
  const well = maxWell(before);
  const danger = before.reduce((n, h) => Math.max(n, h), 0) >= 14;
  const out: Drop[] = [];
  for (const rot of rotsOf(from.id)) {
    for (let x = -2; x <= 8; x++) {
      if (!reachable(board, from, rot, x, kicks)) continue;
      const hit = evaluateDrop(board, from.id, rot, x);
      if (!hit) continue;
      out.push({
        hold,
        rot,
        x,
        score:
          hit.score +
          modeBias(mode, hit.features) +
          greedTax(mode, from.id, hit.features, well, danger) -
          (hold ? 1e-6 : 0),
        board: hit.board,
        features: hit.features,
      });
    }
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

function peekNext(drop: Drop, follow: Follow, kicks: boolean, mode: ModeId): number {
  if (!follow.falling) return drop.score;
  const ply1 = collectDrops(drop.board, spawnOf(follow.falling), false, kicks, mode);
  if (follow.canHold) {
    const other = follow.hold ?? follow.queue[0];
    if (other) ply1.push(...collectDrops(drop.board, spawnOf(other), true, kicks, mode));
  }
  if (ply1.length === 0) return drop.score - 48;
  let leaf = ply1[0]!.score;
  for (let i = 1; i < ply1.length; i++) {
    const s = ply1[i]!.score;
    if (s > leaf) leaf = s;
  }
  return leaf + 0.2 * drop.score;
}

/** A T that hard-drops into a 3-corner slot and clears is worth taking. No pathfinder. */
function spinBonus(board: Board, id: PieceId, rot: Rot, x: number, y: number, lines: number): number {
  if (id !== "T" || lines < 1) return 0;
  const solid = (cx: number, cy: number) => {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return true;
    return board[cy]![cx] !== null;
  };
  const corners =
    Number(solid(x, y)) + Number(solid(x + 2, y)) + Number(solid(x, y + 2)) + Number(solid(x + 2, y + 2));
  if (corners < 3) return 0;
  return lines >= 2 ? 2.2 : 1.1;
}

/** Sprint / Blitz / Finesse need to finish. Other modes wait for a Tetris. */
function greedTax(
  mode: ModeId,
  id: PieceId,
  f: BotFeatures,
  well: number,
  danger: boolean,
): number {
  if (mode === "sprint" || mode === "blitz" || mode === "finesse") return 0;
  if (danger) return f.lines_cleared > 0 ? 0.9 * f.lines_cleared : 0;
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
