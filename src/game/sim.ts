import { COIN_FOR_LINES, type PowerId } from "./shop";
import { modeOf, mulberry32, type ModeId } from "./modes";
import { takeSnap, REPLAY_CAP, type Snap } from "./replay";
import { cellsOf, kicksFor } from "./pieces";
import {
  ARR,
  CLEAR_TIME,
  COLS,
  COMBO_SCORE,
  DAS,
  HIDDEN_ROWS,
  LINE_SCORE,
  LINES_PER_LEVEL,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  PIECE_IDS,
  ROWS,
  T_SPIN_SCORE,
  type Cell,
  type Phase,
  type PieceId,
  type Rot,
} from "./types";

export type Piece = {
  id: PieceId;
  rot: Rot;
  x: number;
  y: number;
};

export type Board = (PieceId | null)[][];

export type Sim = {
  phase: Phase;
  board: Board;
  piece: Piece | null;
  hold: PieceId | null;
  canHold: boolean;
  bag: PieceId[];
  next: PieceId[];
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: boolean;
  lastClear: string | null;
  clearRows: number[];
  clearT: number;
  gravityAcc: number;
  lockT: number;
  lockResets: number;
  dasDir: -1 | 0 | 1;
  dasT: number;
  arrT: number;
  lastRotate: boolean;
  lastKickIndex: number;
  tSpin: boolean;
  slowT: number;
  shield: boolean;
  pendingCoins: number;
  mode: ModeId;
  timeLeft: number | null;
  lineGoal: number | null;
  clock: number;
  won: boolean;
  history: Snap[];
  rng: () => number;
};

export type InputFrame = {
  heldLeft: boolean;
  heldRight: boolean;
  justLeft: boolean;
  justRight: boolean;
  softDrop: boolean;
  justHard: boolean;
  justCw: boolean;
  justCcw: boolean;
  justHold: boolean;
  nudge: number;
};

export type StepEvent =
  | "none"
  | "move"
  | "rotate"
  | "hold"
  | "lock"
  | "clear"
  | "tetris"
  | "tspin"
  | "over"
  | "win";

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null),
  );
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function fillBag(sim: Sim) {
  while (sim.bag.length < 14) {
    sim.bag.push(...shuffle(PIECE_IDS, sim.rng));
  }
}

function takeNext(sim: Sim): PieceId {
  fillBag(sim);
  const id = sim.bag.shift()!;
  sim.next = sim.bag.slice(0, 5);
  return id;
}

export type NewGame = {
  mode?: ModeId;
  seed?: number;
};

export function createSim(opts: NewGame = {}): Sim {
  const mode = opts.mode ?? "marathon";
  const info = modeOf(mode);
  const rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
  const sim: Sim = {
    phase: "playing",
    board: emptyBoard(),
    piece: null,
    hold: null,
    canHold: true,
    bag: [],
    next: [],
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    b2b: false,
    lastClear: null,
    clearRows: [],
    clearT: 0,
    gravityAcc: 0,
    lockT: 0,
    lockResets: 0,
    dasDir: 0,
    dasT: 0,
    arrT: 0,
    lastRotate: false,
    lastKickIndex: -1,
    tSpin: false,
    slowT: 0,
    shield: false,
    pendingCoins: 0,
    mode,
    timeLeft: info.seconds,
    lineGoal: info.lines,
    clock: 0,
    won: false,
    history: [],
    rng,
  };
  fillBag(sim);
  sim.next = sim.bag.slice(0, 5);
  spawn(sim, takeNext(sim));
  return sim;
}

export function gravityInterval(level: number, slow = false): number {
  const lv = Math.max(1, Math.min(level, 20));
  const sec = Math.pow(0.8 - (lv - 1) * 0.007, lv - 1);
  const base = Math.max(0.0167, sec);
  return slow ? base * 3.2 : base;
}

function pieceCells(p: Piece): Cell[] {
  return cellsOf(p.id, p.rot, p.x, p.y);
}

export function fits(board: Board, p: Piece): boolean {
  for (const c of pieceCells(p)) {
    if (c.x < 0 || c.x >= COLS || c.y >= ROWS) return false;
    if (c.y >= 0 && board[c.y]![c.x]) return false;
  }
  return true;
}

function grounded(sim: Sim, p: Piece): boolean {
  return !fits(sim.board, { ...p, y: p.y + 1 });
}

export function ghostY(sim: Sim): number {
  const p = sim.piece;
  if (!p) return 0;
  let y = p.y;
  while (fits(sim.board, { ...p, y: y + 1 })) y += 1;
  return y;
}

function spawn(sim: Sim, id: PieceId): boolean {
  const piece: Piece = { id, rot: 0, x: 3, y: 0 };
  while (
    cellsOf(piece.id, piece.rot, piece.x, piece.y).every((c) => c.y < HIDDEN_ROWS) &&
    fits(sim.board, { ...piece, y: piece.y + 1 })
  ) {
    piece.y += 1;
  }
  if (!fits(sim.board, piece)) {
    if (sim.shield) {
      sim.shield = false;
      for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + 6; y++) {
        sim.board[y] = Array.from({ length: COLS }, () => null);
      }
    }
    if (!fits(sim.board, piece)) {
      sim.piece = piece;
      sim.phase = "over";
      return false;
    }
  }
  sim.piece = piece;
  sim.gravityAcc = 0;
  sim.lockT = 0;
  sim.lockResets = 0;
  sim.lastRotate = false;
  sim.lastKickIndex = -1;
  sim.tSpin = false;
  return true;
}

export function dragPiece(sim: Sim, col: number, boardRow?: number): boolean {
  if (!sim.piece || (sim.phase !== "playing" && sim.phase !== "clearing")) {
    return false;
  }
  let moved = false;
  let guard = 0;
  while (sim.piece && sim.piece.x < col && tryShift(sim, 1) && guard++ < COLS) {
    moved = true;
  }
  guard = 0;
  while (sim.piece && sim.piece.x > col && tryShift(sim, -1) && guard++ < COLS) {
    moved = true;
  }
  if (boardRow == null || !sim.piece) return moved;
  const lowest = () =>
    Math.max(
      ...cellsOf(sim.piece!.id, sim.piece!.rot, sim.piece!.x, sim.piece!.y).map(
        (c) => c.y,
      ),
    );
  guard = 0;
  while (sim.piece && lowest() < boardRow && tryFall(sim) && guard++ < ROWS) {
    moved = true;
  }
  return moved;
}

function tryFall(sim: Sim): boolean {
  const p = sim.piece;
  if (!p || grounded(sim, p)) return false;
  sim.piece = { ...p, y: p.y + 1 };
  sim.lastRotate = false;
  sim.tSpin = false;
  if (grounded(sim, sim.piece)) sim.lockT = 0;
  return true;
}

function tryShift(sim: Sim, dx: number): boolean {
  const p = sim.piece;
  if (!p) return false;
  const next = { ...p, x: p.x + dx };
  if (!fits(sim.board, next)) return false;
  sim.piece = next;
  sim.lastRotate = false;
  sim.tSpin = false;
  bumpLock(sim);
  return true;
}

function bumpLock(sim: Sim) {
  const p = sim.piece;
  if (!p || !grounded(sim, p)) {
    sim.lockT = 0;
    return;
  }
  if (sim.lockResets < MAX_LOCK_RESETS) {
    sim.lockT = 0;
    sim.lockResets += 1;
  }
}

function tCornersFilled(sim: Sim, p: Piece): number {
  const corners: Cell[] = [
    { x: p.x, y: p.y },
    { x: p.x + 2, y: p.y },
    { x: p.x, y: p.y + 2 },
    { x: p.x + 2, y: p.y + 2 },
  ];
  let n = 0;
  for (const c of corners) {
    if (c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS) {
      n += 1;
      continue;
    }
    if (sim.board[c.y]![c.x]) n += 1;
  }
  return n;
}

function tryRotate(sim: Sim, dir: 1 | -1): boolean {
  const p = sim.piece;
  if (!p) return false;
  const to = ((((p.rot + dir) % 4) + 4) % 4) as Rot;
  const kicks = kicksFor(p.id, p.rot, to);
  for (let i = 0; i < kicks.length; i++) {
    const k = kicks[i]!;
    const next: Piece = {
      id: p.id,
      rot: to,
      x: p.x + k.x,
      y: p.y - k.y,
    };
    if (!fits(sim.board, next)) continue;
    sim.piece = next;
    sim.lastRotate = true;
    sim.lastKickIndex = i;
    sim.tSpin = next.id === "T" && tCornersFilled(sim, next) >= 3;
    bumpLock(sim);
    return true;
  }
  return false;
}

function hardDrop(sim: Sim): "ok" | "clearing" | "over" {
  const p = sim.piece;
  if (!p) return "ok";
  const y = ghostY(sim);
  const dist = y - p.y;
  sim.piece = { ...p, y };
  sim.score += dist * 2;
  sim.lastRotate = false;
  return lockPiece(sim);
}

function lockPiece(sim: Sim): "ok" | "clearing" | "over" {
  const p = sim.piece;
  if (!p) return "ok";
  for (const c of pieceCells(p)) {
    if (c.y < 0 || c.y >= ROWS) continue;
    sim.board[c.y]![c.x] = p.id;
  }
  const full: number[] = [];
  for (let y = 0; y < ROWS; y++) {
    if (sim.board[y]!.every((cell) => cell !== null)) full.push(y);
  }
  sim.piece = null;
  sim.canHold = true;
  sim.history.push(takeSnap(sim.board, null, sim.score, sim.lines));
  if (sim.history.length > REPLAY_CAP) sim.history.shift();
  if (full.length === 0) {
    sim.combo = -1;
    if (sim.tSpin) {
      sim.score += T_SPIN_SCORE[0]! * sim.level;
      sim.lastClear = "T-SPIN";
    } else {
      sim.lastClear = null;
    }
    if (!spawn(sim, takeNext(sim))) return "over";
    return "ok";
  }
  sim.clearRows = full;
  sim.clearT = CLEAR_TIME;
  sim.phase = "clearing";
  return "clearing";
}

function finishClear(sim: Sim): "ok" | "win" | "over" {
  const n = sim.clearRows.length;
  const rows = new Set(sim.clearRows);
  const kept: Board = [];
  for (let y = 0; y < ROWS; y++) {
    if (!rows.has(y)) kept.push(sim.board[y]!);
  }
  while (kept.length < ROWS) kept.unshift(Array.from({ length: COLS }, () => null));
  sim.board = kept;
  sim.clearRows = [];
  sim.lines += n;
  sim.level = Math.floor(sim.lines / LINES_PER_LEVEL) + 1;
  sim.combo += 1;

  const tspin = sim.tSpin;
  let pts = (LINE_SCORE[n] ?? 0) * sim.level;
  if (tspin) pts = (T_SPIN_SCORE[n] ?? T_SPIN_SCORE[0]!) * sim.level;
  const difficult = n === 4 || tspin;
  if (difficult && sim.b2b) pts = Math.floor(pts * 1.5);
  if (sim.combo > 0) pts += COMBO_SCORE * sim.combo * sim.level;
  sim.score += pts;
  sim.pendingCoins += COIN_FOR_LINES[n] ?? 0;
  sim.b2b = difficult;
  sim.lastClear = tspin
    ? n === 0
      ? "T-SPIN"
      : `T-SPIN ${n}`
    : n === 4
      ? "STACK"
      : n === 3
        ? "TRIPLE"
        : n === 2
          ? "DOUBLE"
          : "SINGLE";
  sim.tSpin = false;
  sim.phase = "playing";
  if (sim.lineGoal && sim.lines >= sim.lineGoal) {
    sim.won = true;
    sim.phase = "over";
    sim.lastClear = "CLEAR";
    return "win";
  }
  if (!spawn(sim, takeNext(sim))) return "over";
  return "ok";
}

function holdPiece(sim: Sim): boolean {
  if (!sim.canHold || !sim.piece) return false;
  const current = sim.piece.id;
  const stored = sim.hold;
  sim.hold = current;
  sim.canHold = false;
  if (stored) spawn(sim, stored);
  else spawn(sim, takeNext(sim));
  return true;
}

function handleShift(sim: Sim, input: InputFrame, dt: number) {
  const dir: -1 | 0 | 1 = input.heldLeft && !input.heldRight
    ? -1
    : input.heldRight && !input.heldLeft
      ? 1
      : 0;

  if (input.justLeft && !input.justRight) tryShift(sim, -1);
  else if (input.justRight && !input.justLeft) tryShift(sim, 1);

  if (dir === 0) {
    sim.dasDir = 0;
    sim.dasT = 0;
    sim.arrT = 0;
    return;
  }
  if (sim.dasDir !== dir) {
    sim.dasDir = dir;
    sim.dasT = DAS;
    sim.arrT = 0;
    return;
  }
  sim.dasT -= dt;
  if (sim.dasT > 0) return;
  sim.arrT -= dt;
  while (sim.arrT <= 0) {
    if (!tryShift(sim, dir)) {
      sim.arrT = 0;
      break;
    }
    sim.arrT += ARR;
  }
}

export function advance(sim: Sim, dt: number, input: InputFrame): StepEvent {
  const capped = Math.min(dt, 0.1);
  if (sim.slowT > 0) sim.slowT = Math.max(0, sim.slowT - capped);
  if (sim.phase === "over" || sim.phase === "paused" || sim.phase === "title") {
    return "none";
  }
  if (sim.phase === "playing") {
    sim.clock += capped;
    if (sim.timeLeft != null) {
      sim.timeLeft -= capped;
      if (sim.timeLeft <= 0) {
        sim.timeLeft = 0;
        sim.phase = "over";
        sim.won = true;
        sim.lastClear = "TIME";
        return "win";
      }
    }
  }

  if (sim.phase === "clearing") {
    sim.clearT -= capped;
    if (sim.clearT <= 0) {
      const n = sim.clearRows.length;
      const wasT = sim.tSpin;
      const ended = finishClear(sim);
      if (ended === "win") return "win";
      if (ended === "over") return "over";
      if (wasT) return "tspin";
      return n === 4 ? "tetris" : "clear";
    }
    return "none";
  }

  if (!sim.piece) return "none";

  if (input.justHold && holdPiece(sim)) return "hold";
  if (input.justCw && tryRotate(sim, 1)) return "rotate";
  if (input.justCcw && tryRotate(sim, -1)) return "rotate";
  if (input.justHard) {
    const r = hardDrop(sim);
    return r === "over" ? "over" : "lock";
  }

  if (input.nudge) {
    const dir = Math.sign(input.nudge);
    const steps = Math.min(COLS, Math.abs(input.nudge));
    for (let i = 0; i < steps; i++) tryShift(sim, dir);
  }
  handleShift(sim, input, capped);

  const g = input.softDrop
    ? Math.min(0.05, gravityInterval(sim.level, sim.slowT > 0) / 20)
    : gravityInterval(sim.level, sim.slowT > 0);

  if (!grounded(sim, sim.piece)) {
    sim.lockT = 0;
    sim.gravityAcc += capped;
    let ev: StepEvent = "none";
    while (sim.piece && sim.gravityAcc >= g) {
      sim.gravityAcc -= g;
      if (!grounded(sim, sim.piece)) {
        sim.piece = { ...sim.piece, y: sim.piece.y + 1 };
        sim.lastRotate = false;
        sim.tSpin = false;
        if (input.softDrop) sim.score += 1;
        ev = "move";
      }
    }
    return ev;
  }

  sim.gravityAcc = 0;
  sim.lockT += capped;
  if (sim.lockT >= LOCK_DELAY) {
    const r = lockPiece(sim);
    return r === "over" ? "over" : "lock";
  }
  return "none";
}

export function applyPower(sim: Sim, id: PowerId): boolean {
  if (sim.phase !== "playing" && sim.phase !== "clearing") return false;
  if (id === "slow") {
    sim.slowT = 12;
    sim.lastClear = "SLOW";
    return true;
  }
  if (id === "shield") {
    sim.shield = true;
    sim.lastClear = "SHIELD";
    return true;
  }
  if (id === "zap") {
    let target = -1;
    for (let y = ROWS - 1; y >= HIDDEN_ROWS; y--) {
      if (sim.board[y]!.some((c) => c !== null)) {
        target = y;
        break;
      }
    }
    if (target < 0) return false;
    sim.board[target] = Array.from({ length: COLS }, () => null);
    compactBoard(sim);
    sim.lastClear = "ZAP";
    return true;
  }
  if (id === "quake") {
    let n = 0;
    for (let y = ROWS - 1; y >= HIDDEN_ROWS && n < 2; y--) {
      if (sim.board[y]!.some((c) => c !== null)) {
        sim.board[y] = Array.from({ length: COLS }, () => null);
        n += 1;
      }
    }
    if (n === 0) return false;
    compactBoard(sim);
    sim.lastClear = "QUAKE";
    return true;
  }
  return false;
}

export function pickFromNext(sim: Sim, index: number): boolean {
  if (sim.phase !== "playing" && sim.phase !== "clearing") return false;
  if (!sim.piece) return false;
  fillBag(sim);
  if (index < 0 || index >= 5 || !sim.bag[index]) return false;
  const chosen = sim.bag[index]!;
  sim.bag[index] = sim.piece.id;
  sim.next = sim.bag.slice(0, 5);
  spawn(sim, chosen);
  sim.lockT = 0;
  sim.lockResets = 0;
  sim.gravityAcc = 0;
  sim.lastRotate = false;
  sim.tSpin = false;
  sim.lastClear = "PICK";
  return true;
}

function compactBoard(sim: Sim) {
  const kept: Board = [];
  for (let y = 0; y < ROWS; y++) {
    if (y < HIDDEN_ROWS || sim.board[y]!.some((c) => c !== null)) {
      kept.push(sim.board[y]!);
    }
  }
  while (kept.length < ROWS) {
    kept.splice(HIDDEN_ROWS, 0, Array.from({ length: COLS }, () => null));
  }
  if (kept.length > ROWS) kept.splice(HIDDEN_ROWS, kept.length - ROWS);
  sim.board = kept;
}

export function pauseToggle(sim: Sim) {
  if (sim.phase === "playing") sim.phase = "paused";
  else if (sim.phase === "paused") sim.phase = "playing";
}

export function visibleCells(sim: Sim): { x: number; y: number; id: PieceId }[] {
  const out: { x: number; y: number; id: PieceId }[] = [];
  for (let y = HIDDEN_ROWS; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = sim.board[y]![x];
      if (id) out.push({ x, y: y - HIDDEN_ROWS, id });
    }
  }
  return out;
}
