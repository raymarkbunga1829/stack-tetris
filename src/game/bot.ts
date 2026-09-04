import { modeOf, type ModeId } from "./modes";
import { cellsOf, kicksFor } from "./pieces";
import { cloneBoard } from "./replay";
import { fits, pulseAction, type Board, type Piece, type Sim } from "./sim";
import { COLS, HIDDEN_ROWS, ROWS, type PieceId, type Rot } from "./types";

/**
 * Watch-bot. One linear scorer, one real well, every mode that will have it.
 *
 * Every decision is a hard drop: a rotation, a column, and maybe Hold. The
 * piece never slides under a stack, never spins a T, never buys a Zap. Classic
 * only rests where a NES rotate-and-shift can actually go. Sprint gets a
 * nudge to finish forty instead of farming the clock. The points that land
 * are still the mode's own table.
 */

export type Placement = {
  hold: boolean;
  rot: Rot;
  x: number;
  score: number;
};

export const BOT_WEIGHTS = {
  landing_height: -0.7544288236196715,
  eroded_cells: 0.33132371302193947,
  row_transitions: -0.38525028399783123,
  col_transitions: 0.14146498841370764,
  holes: -0.8539411071984753,
  well_sum: -0.14270427262999635,
  aggregate_height: -0.45732763742593724,
  bumpiness: -0.8760059238343398,
  lines_cleared: -0.7669060000039435,
  is_tetris: 0.586012856355073,
  max_height: -0.4893630706798514,
  hole_depth: -0.4356944860942823,
} as const;

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
  return { features, score: scoreFeatures(features), board: cleared };
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

export function listPlacements(sim: Sim): Placement[] {
  const current = sim.piece;
  if (!current) return [];
  const kicks = modeOf(sim.mode).kicks;
  const out: Placement[] = [];

  const consider = (id: PieceId, hold: boolean, from: Piece) => {
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      for (let x = -2; x <= 11; x++) {
        if (!reachable(sim.board, from, rot, x, kicks)) continue;
        const hit = evaluateDrop(sim.board, id, rot, x);
        if (!hit) continue;
        const score = hit.score + modeBias(sim.mode, hit.features) - (hold ? 1e-6 : 0);
        out.push({ hold, rot, x, score });
      }
    }
  };

  consider(current.id, false, current);
  if (sim.canHold) {
    const other = sim.hold ?? sim.next[0];
    if (other) consider(other, true, { id: other, rot: 0, x: 3, y: 0 });
  }
  return out;
}

export function pickPlacement(sim: Sim): Placement | null {
  const all = listPlacements(sim);
  let best: Placement | null = null;
  for (const p of all) if (!best || p.score > best.score) best = p;
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
