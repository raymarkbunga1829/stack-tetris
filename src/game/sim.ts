import { COIN_FOR_LINES, type PowerId } from "./shop";
import { modeOf, mulberry32, type ModeId } from "./modes";
import { takeSnap, cloneBoard, REPLAY_CAP, type Snap } from "./replay";
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
  T_SPIN_MINI_SCORE,
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
  lockSpark: number;
  dasDir: -1 | 0 | 1;
  dasT: number;
  arrT: number;
  lastRotate: boolean;
  lastKickIndex: number;
  tSpin: boolean;
  tSpinMini: boolean;
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
  maxCombo: number;
  tspins: number;
  stacks: number;
  perfects: number;
  lastPerfect: boolean;
  splits: number[];
  lastDealt: PieceId | null;
  undo: ZenUndo | null;
  omenOn: boolean;
  omenDone: boolean;
  omenAt: number;
  locks: number;
  blessed: boolean;
  omenFalse: boolean;
  curseLeft: number;
  irsReady: boolean;
};

export type ZenUndo = {
  board: Board;
  piece: Piece;
  hold: PieceId | null;
  canHold: boolean;
  bag: PieceId[];
  next: PieceId[];
  score: number;
  lines: number;
  combo: number;
  b2b: boolean;
  lastDealt: PieceId | null;
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
  justFlip: boolean;
  heldCw: boolean;
  heldCcw: boolean;
  heldHold: boolean;
  heldFlip: boolean;
  nudge: number;
  das?: number;
  arr?: number;
  sdf?: number;
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

function rollNes(sim: Sim): PieceId {
  const first = PIECE_IDS[Math.floor(sim.rng() * PIECE_IDS.length)]!;
  if (first !== sim.lastDealt) {
    sim.lastDealt = first;
    return first;
  }
  const again = PIECE_IDS[Math.floor(sim.rng() * PIECE_IDS.length)]!;
  sim.lastDealt = again;
  return again;
}

function fillBag(sim: Sim) {
  if (modeOf(sim.mode).rng === "nes") {
    while (sim.bag.length < 14) sim.bag.push(rollNes(sim));
    return;
  }
  while (sim.bag.length < 14) {
    sim.bag.push(...shuffle(PIECE_IDS, sim.rng));
  }
}

function takeNext(sim: Sim): PieceId {
  fillBag(sim);
  if (sim.curseLeft > 0) {
    sim.curseLeft -= 1;
    const junk: PieceId[] = ["S", "Z", "O", "S", "Z"];
    const id = junk[Math.floor(sim.rng() * junk.length)]!;
    const i = sim.bag.indexOf(id);
    if (i >= 0) sim.bag.splice(i, 1);
    sim.next = sim.bag.slice(0, 5);
    return id;
  }
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
    level: info.startLevel,
    combo: -1,
    b2b: false,
    lastClear: null,
    clearRows: [],
    clearT: 0,
    gravityAcc: 0,
    lockT: 0,
    lockResets: 0,
    lockSpark: 0,
    dasDir: 0,
    dasT: 0,
    arrT: 0,
    lastRotate: false,
    lastKickIndex: -1,
    tSpin: false,
    tSpinMini: false,
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
    maxCombo: 0,
    tspins: 0,
    stacks: 0,
    perfects: 0,
    lastPerfect: false,
    splits: [],
    lastDealt: null,
    undo: null,
    omenOn: false,
    omenDone: false,
    omenAt: 7 + Math.floor(rng() * 6),
    locks: 0,
    blessed: false,
    omenFalse: false,
    curseLeft: 0,
    irsReady: true,
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

export type GhostHit = {
  y: number;
  cells: Cell[];
  contacts: { x: number; y: number; kind: "stack" | "floor" }[];
};

function firstSolidBelow(board: Board, x: number, fromY: number): number {
  if (x < 0 || x >= COLS) return fromY + 1;
  const start = Math.max(fromY + 1, 0);
  for (let y = start; y < ROWS; y++) {
    if (board[y]![x]) return y;
  }
  return ROWS;
}

/** Column first-contact: each mino scans its column; the tightest gap wins. */
export function ghostLanding(sim: Sim): GhostHit | null {
  const p = sim.piece;
  if (!p) return null;
  const now = pieceCells(p);
  if (now.length === 0) return null;
  let drop = ROWS;
  for (const c of now) {
    drop = Math.min(drop, firstSolidBelow(sim.board, c.x, c.y) - c.y - 1);
  }
  if (drop < 0) drop = 0;
  const y = p.y + drop;
  const landed: Piece = { ...p, y };
  if (!fits(sim.board, landed)) return { y: p.y, cells: now, contacts: [] };
  const cells = pieceCells(landed).filter((c) => c.y >= 0 && c.y < ROWS);
  const contacts: GhostHit["contacts"] = [];
  const seen = new Set<string>();
  for (const c of cells) {
    const hit = firstSolidBelow(sim.board, c.x, c.y);
    if (hit >= ROWS) {
      const key = `${c.x}:floor`;
      if (!seen.has(key)) {
        seen.add(key);
        contacts.push({ x: c.x, y: ROWS - 1, kind: "floor" });
      }
    } else {
      const key = `${c.x},${hit}`;
      if (!seen.has(key)) {
        seen.add(key);
        contacts.push({ x: c.x, y: hit, kind: "stack" });
      }
    }
  }
  return { y, cells, contacts };
}

export function ghostY(sim: Sim): number {
  return ghostLanding(sim)?.y ?? sim.piece?.y ?? 0;
}

function zenRescue(sim: Sim) {
  for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + 8; y++) {
    sim.board[y] = Array.from({ length: COLS }, () => null);
  }
}

function spawn(sim: Sim, id: PieceId): boolean {
  const piece: Piece = { id, rot: 0, x: 3, y: 0 };
  while (
    piece.y < HIDDEN_ROWS &&
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
    if (!fits(sim.board, piece) && sim.mode === "zen") {
      zenRescue(sim);
    }
    if (!fits(sim.board, piece)) {
      sim.piece = piece;
      sim.phase = "over";
      return false;
    }
  }
  sim.piece = piece;
  sim.irsReady = true;
  if (!sim.omenDone && sim.locks >= sim.omenAt) {
    sim.omenOn = true;
    sim.omenFalse = sim.rng() < 1 / 7;
  }
  sim.gravityAcc = 0;
  sim.lockT = 0;
  sim.lockResets = 0;
  sim.lastRotate = false;
  sim.lastKickIndex = -1;
  clearSpin(sim);
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
  clearSpin(sim);
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
  clearSpin(sim);
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
    sim.lockSpark = 1;
  }
}

/** A spin only counts once the T is wedged: both corners it faces, plus a heel. */
function tSpinKind(sim: Sim, p: Piece, kickIndex: number): "none" | "mini" | "full" {
  if (p.id !== "T") return "none";
  const solid = (x: number, y: number) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return sim.board[y]![x] !== null;
  };
  const tl = solid(p.x, p.y);
  const tr = solid(p.x + 2, p.y);
  const bl = solid(p.x, p.y + 2);
  const br = solid(p.x + 2, p.y + 2);
  const face: [boolean, boolean] =
    p.rot === 0 ? [tl, tr] : p.rot === 1 ? [tr, br] : p.rot === 2 ? [bl, br] : [tl, bl];
  const heel: [boolean, boolean] =
    p.rot === 0 ? [bl, br] : p.rot === 1 ? [tl, bl] : p.rot === 2 ? [tl, tr] : [tr, br];
  const faces = face.filter(Boolean).length;
  const heels = heel.filter(Boolean).length;
  if (faces === 2 && heels >= 1) return "full";
  // The deepest kick is the tuck that earns a triple, so it scores in full.
  if (faces === 1 && heels === 2) return kickIndex >= 4 ? "full" : "mini";
  return "none";
}

function clearSpin(sim: Sim) {
  sim.tSpin = false;
  sim.tSpinMini = false;
}

export function canRotate(sim: Sim, dir: 1 | -1): boolean {
  return peekKick(sim, dir) != null;
}

export function peekKick(
  sim: Sim,
  dir: 1 | -1,
): { piece: Piece; index: number } | null {
  const p = sim.piece;
  if (!p) return null;
  const to = ((((p.rot + dir) % 4) + 4) % 4) as Rot;
  const kicks = kickTable(sim, p.id, p.rot, to);
  for (let i = 0; i < kicks.length; i++) {
    const k = kicks[i]!;
    const next: Piece = { id: p.id, rot: to, x: p.x + k.x, y: p.y - k.y };
    if (fits(sim.board, next)) return { piece: next, index: i };
  }
  return null;
}

export type CollisionPred = {
  landing: GhostHit;
  rowsLeft: number;
  grounded: boolean;
  lockImminent: boolean;
  blocked: { left: boolean; right: boolean; cw: boolean; ccw: boolean };
  kick: { cw: boolean; ccw: boolean };
};

export function predictCollision(sim: Sim): CollisionPred | null {
  const p = sim.piece;
  if (!p) return null;
  const landing = ghostLanding(sim);
  if (!landing) return null;
  const rowsLeft = Math.max(0, landing.y - p.y);
  const isGrounded = grounded(sim, p);
  return {
    landing,
    rowsLeft,
    grounded: isGrounded,
    lockImminent: isGrounded || rowsLeft <= 1,
    blocked: {
      left: !fits(sim.board, { ...p, x: p.x - 1 }),
      right: !fits(sim.board, { ...p, x: p.x + 1 }),
      cw: !canRotate(sim, 1),
      ccw: !canRotate(sim, -1),
    },
    kick: {
      cw: (peekKick(sim, 1)?.index ?? 0) > 0,
      ccw: (peekKick(sim, -1)?.index ?? 0) > 0,
    },
  };
}

function kickTable(sim: Sim, id: PieceId, from: Rot, to: Rot) {
  if (!modeOf(sim.mode).kicks) return [{ x: 0, y: 0 }];
  return kicksFor(id, from, to);
}

function tryRotate(sim: Sim, dir: 1 | -1 | 2): boolean {
  const p = sim.piece;
  if (!p) return false;
  const to = ((((p.rot + dir) % 4) + 4) % 4) as Rot;
  const kicks = kickTable(sim, p.id, p.rot, to);
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
    const kind = tSpinKind(sim, next, i);
    sim.tSpin = kind !== "none";
    sim.tSpinMini = kind === "mini";
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
  // Falling is a move, so a spin earned upstairs does not pay out down here.
  if (dist > 0) clearSpin(sim);
  return lockPiece(sim);
}

function lockPiece(sim: Sim): "ok" | "clearing" | "over" {
  const p = sim.piece;
  if (!p) return "ok";
  if (sim.mode === "zen") {
    sim.undo = {
      board: cloneBoard(sim.board),
      piece: { ...p },
      hold: sim.hold,
      canHold: sim.canHold,
      bag: sim.bag.slice(),
      next: sim.next.slice(),
      score: sim.score,
      lines: sim.lines,
      combo: sim.combo,
      b2b: sim.b2b,
      lastDealt: sim.lastDealt,
    };
  }
  for (const c of pieceCells(p)) {
    if (c.y < 0 || c.y >= ROWS) continue;
    sim.board[c.y]![c.x] = p.id;
  }
  const omenRows = sim.omenOn ? pieceCells(p).map((c) => c.y) : [];
  const omenLie = sim.omenOn && sim.omenFalse;
  if (sim.omenOn) {
    sim.omenOn = false;
    sim.omenDone = true;
  }
  sim.locks += 1;
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
      const mini = sim.tSpinMini;
      sim.score += (mini ? T_SPIN_MINI_SCORE[0]! : T_SPIN_SCORE[0]!) * sim.level;
      sim.lastClear = mini ? "MINI T-SPIN" : "T-SPIN";
      sim.tspins += 1;
    } else {
      sim.lastClear = null;
    }
    if (!spawn(sim, takeNext(sim))) return "over";
    return "ok";
  }
  sim.clearRows = full;
  sim.clearT = CLEAR_TIME;
  sim.phase = "clearing";
  if (full.length === 4 && omenRows.some((y) => full.includes(y))) {
    if (omenLie) sim.curseLeft = 2;
    else sim.blessed = true;
  }
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
  sim.combo += 1;
  if (sim.combo > sim.maxCombo) sim.maxCombo = sim.combo;

  const tspin = sim.tSpin;
  const mini = sim.tSpin && sim.tSpinMini;
  let pts = (LINE_SCORE[n] ?? 0) * sim.level;
  if (tspin) {
    pts = mini
      ? (T_SPIN_MINI_SCORE[n] ?? T_SPIN_MINI_SCORE[0]!) * sim.level
      : (T_SPIN_SCORE[n] ?? T_SPIN_SCORE[0]!) * sim.level;
  }
  const difficult = n === 4 || tspin;
  if (difficult && sim.b2b) pts = Math.floor(pts * 1.5);
  if (sim.combo > 0) pts += COMBO_SCORE * sim.combo * sim.level;
  sim.score += pts;
  sim.pendingCoins += COIN_FOR_LINES[n] ?? 0;
  sim.b2b = difficult;
  if (tspin) sim.tspins += 1;
  if (n === 4) sim.stacks += 1;
  if (sim.mode !== "zen") {
    sim.level = Math.max(
      modeOf(sim.mode).startLevel,
      Math.floor(sim.lines / LINES_PER_LEVEL) + 1,
    );
  } else sim.level = 1;
  const prevLines = sim.lines - n;
  for (const mark of [10, 20, 30, 40]) {
    if (prevLines < mark && sim.lines >= mark) sim.splits.push(sim.clock);
  }
  sim.lastPerfect = boardEmpty(sim.board);
  if (sim.lastPerfect) {
    sim.score += 2000 * sim.level;
    sim.perfects += 1;
    sim.pendingCoins += 25;
    sim.lastClear = "ALL CLEAR";
  } else {
    sim.lastClear = tspin
      ? `${mini ? "MINI " : ""}T-SPIN${n === 0 ? "" : ` ${n}`}`
      : n === 4
        ? "STACK"
        : n === 3
          ? "TRIPLE"
          : n === 2
            ? "DOUBLE"
              : "SINGLE";
  }
  clearSpin(sim);
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
    sim.dasT = input.das ?? DAS;
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
    sim.arrT += input.arr ?? ARR;
  }
}

export function advance(sim: Sim, dt: number, input: InputFrame): StepEvent {
  const capped = Math.min(dt, 0.1);
  if (sim.slowT > 0) sim.slowT = Math.max(0, sim.slowT - capped);
  if (sim.lockSpark > 0) sim.lockSpark = Math.max(0, sim.lockSpark - capped * 5);
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

  if (sim.irsReady) {
    sim.irsReady = false;
    const primed = applyInitialActions(sim, {
      hold: input.heldHold,
      cw: input.heldCw,
      ccw: input.heldCcw,
      flip: input.justFlip || input.heldFlip,
    });
    if (primed !== "none") return primed;
  }

  if (input.justHold && holdPiece(sim)) return "hold";
  if (input.justFlip && tryRotate(sim, 2)) return "rotate";
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
    ? Math.min(0.05, gravityInterval(sim.level, sim.slowT > 0) / (input.sdf ?? 20))
    : gravityInterval(sim.level, sim.slowT > 0);

  if (!grounded(sim, sim.piece)) {
    sim.lockT = 0;
    const slid = input.justLeft || input.justRight || Math.abs(input.nudge) > 0;
    sim.gravityAcc += capped;
    let ev: StepEvent = slid ? "move" : "none";
    while (sim.piece && sim.gravityAcc >= g) {
      sim.gravityAcc -= g;
      if (!grounded(sim, sim.piece)) {
        sim.piece = { ...sim.piece, y: sim.piece.y + 1 };
        sim.lastRotate = false;
        clearSpin(sim);
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

function boardEmpty(board: Board): boolean {
  for (let y = 0; y < ROWS; y++) {
    if (board[y]!.some((c) => c !== null)) return false;
  }
  return true;
}

export function inDanger(sim: Sim): boolean {
  for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + 6; y++) {
    if (sim.board[y]!.some((c) => c !== null)) return true;
  }
  return false;
}

export function dirtyRows(sim: Sim, max: number): number[] {
  const out: number[] = [];
  for (let y = ROWS - 1; y >= HIDDEN_ROWS && out.length < max; y--) {
    if (sim.board[y]!.some((c) => c !== null)) out.push(y);
  }
  return out;
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
  clearSpin(sim);
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

export function undoZen(sim: Sim): boolean {
  if (sim.mode !== "zen" || !sim.undo) return false;
  const u = sim.undo;
  sim.board = cloneBoard(u.board);
  sim.hold = u.hold;
  sim.canHold = true;
  sim.bag = u.bag.slice();
  sim.next = u.next.slice();
  sim.score = u.score;
  sim.lines = u.lines;
  sim.combo = u.combo;
  sim.b2b = u.b2b;
  sim.lastDealt = u.lastDealt;
  sim.clearRows = [];
  sim.clearT = 0;
  sim.phase = "playing";
  sim.undo = null;
  spawn(sim, u.piece.id);
  return true;
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

export function applyInitialActions(
  sim: Sim,
  p: { hold?: boolean; cw?: boolean; ccw?: boolean; flip?: boolean },
): StepEvent {
  if (sim.phase !== "playing" || !sim.piece) return "none";
  if (p.hold && holdPiece(sim)) return "hold";
  if (p.flip && tryRotate(sim, 2)) return "rotate";
  if (p.cw && tryRotate(sim, 1)) return "rotate";
  if (p.ccw && tryRotate(sim, -1)) return "rotate";
  return "none";
}

export function pulseAction(
  sim: Sim,
  p: {
    left?: boolean;
    right?: boolean;
    cw?: boolean;
    ccw?: boolean;
    flip?: boolean;
    hard?: boolean;
    hold?: boolean;
  },
): StepEvent {
  if (sim.phase !== "playing" || !sim.piece) return "none";
  if (p.hold && holdPiece(sim)) return "hold";
  if (p.flip && tryRotate(sim, 2)) return "rotate";
  if (p.cw && tryRotate(sim, 1)) return "rotate";
  if (p.ccw && tryRotate(sim, -1)) return "rotate";
  if (p.hard) {
    const r = hardDrop(sim);
    return r === "over" ? "over" : "lock";
  }
  if (p.left && tryShift(sim, -1)) return "move";
  if (p.right && tryShift(sim, 1)) return "move";
  return "none";
}
