import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// nextCoach lives next to the card. Slice off the JSX so we can load it
// without a React runtime — same transpile trick as the other game tests.
const raw = readFileSync(new URL("../src/components/coach-card.tsx", import.meta.url), "utf8");
const start = raw.indexOf("const ORDER");
assert.notEqual(start, -1, "nextCoach helpers still start at const ORDER");
const { outputText } = ts.transpileModule(raw.slice(start), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { nextCoach } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("hard drop on Slide walks the card — it cannot stay stuck on drag", () => {
  assert.equal(nextCoach("drag", "hard"), "rotate");
  assert.equal(nextCoach("drag", "flick"), "rotate");
  assert.notEqual(nextCoach("drag", "hard"), "drag");
});

test("hard/flick walks one step from every earlier card toward done", () => {
  assert.equal(nextCoach("rotate", "hard"), "hold");
  assert.equal(nextCoach("rotate", "flick"), "hold");
  assert.equal(nextCoach("hold", "hard"), "drop");
  assert.equal(nextCoach("hold", "flick"), "drop");
  assert.equal(nextCoach("drop", "hard"), "done");
  assert.equal(nextCoach("drop", "flick"), "done");
});

test("taught actions still complete their own step", () => {
  for (const label of ["drag", "swipe", "left", "right"]) {
    assert.equal(nextCoach("drag", label), "rotate", label);
  }
  for (const label of ["tap", "two-finger", "cw", "ccw"]) {
    assert.equal(nextCoach("rotate", label), "hold", label);
  }
  for (const label of ["hold", "long-press"]) {
    assert.equal(nextCoach("hold", label), "drop", label);
  }
});

test("later taught actions also walk an earlier card forward", () => {
  assert.equal(nextCoach("drag", "cw"), "rotate");
  assert.equal(nextCoach("drag", "hold"), "rotate");
  assert.equal(nextCoach("rotate", "hold"), "hold");
});

test("earlier actions and unknowns leave the card where it is", () => {
  assert.equal(nextCoach("rotate", "left"), "rotate");
  assert.equal(nextCoach("hold", "cw"), "hold");
  assert.equal(nextCoach("drop", "hold"), "drop");
  assert.equal(nextCoach("drag", "soft"), "drag");
});

test("slamming through the deck from card one reaches done", () => {
  let step = "drag";
  const walk = [];
  for (let i = 0; i < 4; i++) {
    step = nextCoach(step, "hard");
    walk.push(step);
  }
  assert.deepEqual(walk, ["rotate", "hold", "drop", "done"]);
});
