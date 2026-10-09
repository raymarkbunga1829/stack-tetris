import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const urls = new Map();

/** Transpile a game module and its relative imports into data: URLs. */
function moduleUrl(path) {
  const href = new URL(path, import.meta.url).href;
  const cached = urls.get(href);
  if (cached) return cached;
  const source = readFileSync(new URL(href), "utf8");
  // Transpile first so type-only imports (replay.ts -> sim.ts) drop out before resolving.
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const linked = outputText.replace(/from "(\.\/[^"]+)"/g, (_, rel) => {
    const dep = new URL(`${rel}.ts`, href).href;
    return `from ${JSON.stringify(moduleUrl(dep))}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString("base64")}`;
  urls.set(href, url);
  return url;
}

const sim = await import(moduleUrl("../src/game/sim.ts"));
const { ROWS, COLS, HIDDEN_ROWS } = await import(moduleUrl("../src/game/types.ts"));

const IDLE = {
  heldLeft: false,
  heldRight: false,
  justLeft: false,
  justRight: false,
  softDrop: false,
  justHard: false,
  justCw: false,
  justCcw: false,
  justHold: false,
  justFlip: false,
  heldCw: false,
  heldCcw: false,
  heldHold: false,
  heldFlip: false,
  nudge: 0,
};

/** Fill every visible row except the given columns, leaving the hidden rows empty. */
function fillStack(s, openCols = [], fromRow = HIDDEN_ROWS) {
  for (let y = fromRow; y < ROWS; y++) {
    s.board[y] = Array.from({ length: COLS }, (_, x) => (openCols.includes(x) ? null : "J"));
  }
}

test("a hold that cannot spawn the swapped piece reports a top-out", () => {
  const s = sim.createSim({ mode: "marathon", seed: 7 });
  sim.advance(s, 1 / 60, IDLE);
  // Bury the spawn area so nothing new can enter, then leave the live piece where it is.
  for (let y = 0; y < ROWS; y++) s.board[y] = Array.from({ length: COLS }, () => "J");
  const ev = sim.advance(s, 1 / 60, { ...IDLE, justHold: true });
  assert.equal(s.phase, "over");
  assert.equal(ev, "over");
});

test("pick refuses a piece that has no room to spawn", () => {
  const s = sim.createSim({ mode: "marathon", seed: 3 });
  for (let y = 0; y < ROWS; y++) s.board[y] = Array.from({ length: COLS }, () => "J");
  const live = s.piece.id;
  assert.equal(sim.pickFromNext(s, 1), false);
  assert.equal(s.phase, "playing");
  assert.equal(s.piece.id, live);
});

test("zap and quake wait until a line clear has finished", () => {
  const s = sim.createSim({ mode: "marathon", seed: 11 });
  fillStack(s, [0], ROWS - 3);
  s.board[ROWS - 2] = Array.from({ length: COLS }, () => "J");
  s.piece = null;
  s.clearRows = [ROWS - 2];
  s.clearT = 0.2;
  s.phase = "clearing";
  assert.equal(sim.applyPower(s, "zap"), false);
  assert.equal(sim.applyPower(s, "quake"), false);
  assert.deepEqual(s.clearRows, [ROWS - 2]);
  assert.ok(s.board[ROWS - 2].every((c) => c !== null));
});
