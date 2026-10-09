import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const modules = new Map();
function moduleUrl(file) {
  if (modules.has(file.href)) return modules.get(file.href);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from ["'](\.\.?\/[^"']+)["']/g, (_, path) =>
    `from ${JSON.stringify(moduleUrl(new URL(`${path}.ts`, file)))}`);
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  modules.set(file.href, url);
  return url;
}
const load = (file) => import(moduleUrl(new URL(file, import.meta.url)));
const { createSim } = await load("../src/game/sim.ts");
const { drawWell } = await load("../src/game/render.ts");
const { themeOf } = await load("../src/game/themes.ts");

// WebGL does not run under node, so the 3D well is checked at the source:
// anything drawn at the live piece's origin has to be the live piece itself.
test("3D well only draws the live piece's own shape at the live piece's position", () => {
  const src = readFileSync(new URL("../src/game/well3d.ts", import.meta.url), "utf8");
  const calls = [...src.matchAll(/cellsOf\(([^,]+),[^)]*sim\.piece\.x/g)];
  assert.ok(calls.length >= 3, "expected the piece, its rim and the ghost to be found");
  for (const [call, id] of calls) {
    assert.equal(id.trim(), "sim.piece.id", `foreign shape drawn on the live piece: ${call}`);
  }
  assert.doesNotMatch(src, /cellsOf\(\s*sim\??\.hold/, "the held piece belongs in HOLD, not the well");
});

test("2D fallback well paints the same cells whatever is in hold", () => {
  const paint = (hold) => {
    const sim = createSim({ seed: 7 });
    sim.piece = { id: "S", rot: 0, x: 4, y: 6 };
    sim.hold = hold;
    sim.phase = "playing";
    const fills = [];
    let fillStyle = "";
    const ctx = {
      setTransform() {}, translate() {}, strokeRect() {}, fillText() {},
      set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
      fillRect(x, y, w, h) { fills.push(`${fillStyle}@${x},${y},${w},${h}`); },
    };
    drawWell({ width: 300, height: 600, getContext: () => ctx }, sim, 0, themeOf("ink"), true, false);
    return fills;
  };
  const bare = paint(null);
  for (const hold of ["O", "I", "T", "S", "Z", "J", "L"]) {
    assert.deepEqual(paint(hold), bare, `holding ${hold} changed the well`);
  }
});
