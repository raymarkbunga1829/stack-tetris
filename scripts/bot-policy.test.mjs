import assert from "node:assert/strict";
import test from "node:test";

/** Same weights as src/game/bot.ts — a Tetris must not outscore a single on this table. */
const W = {
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
};

function score(f) {
  let n = 0;
  for (const k of Object.keys(W)) n += W[k] * f[k];
  return n;
}

test("the table prefers a single over a Tetris", () => {
  const base = {
    landing_height: 1,
    eroded_cells: 0,
    row_transitions: 20,
    col_transitions: 20,
    holes: 0,
    well_sum: 0,
    aggregate_height: 4,
    bumpiness: 2,
    lines_cleared: 0,
    is_tetris: 0,
    max_height: 1,
    hole_depth: 0,
  };
  const single = score({ ...base, eroded_cells: 1, lines_cleared: 1, is_tetris: 0 });
  const tetris = score({ ...base, eroded_cells: 4, lines_cleared: 4, is_tetris: 1 });
  assert.ok(single > tetris);
});

test("sprint bias rewards a clear more than a taller stack", () => {
  const bias = (lines, height) => 1.8 * lines - 0.2 * height;
  assert.ok(bias(1, 4) > bias(0, 1));
});
