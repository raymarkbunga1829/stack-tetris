import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the real TypeScript modules without needing a browser or WebGL.
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
const { advance, createSim } = await load("../src/game/sim.ts");
const { createInput, handlingOf } = await load("../src/game/input.ts");
const { clientToCell, drawWell, fieldLayout } = await load("../src/game/render.ts");
const { themeOf } = await load("../src/game/themes.ts");

test("touch and keyboard honor each preset's delay before repeating movement", () => {
  const originals = new Map(["window", "document", "navigator", "HTMLElement"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  ));
  for (const [key, value] of Object.entries({
    window: new EventTarget(), document: new EventTarget(), navigator: {}, HTMLElement: class {},
  })) Object.defineProperty(globalThis, key, { configurable: true, value });
  try {
    for (const settings of [
      { dasMs: 220, arrMs: 50, sdf: 10 },
      { dasMs: 167, arrMs: 33, sdf: 20 },
      { dasMs: 100, arrMs: 16, sdf: 40 },
    ]) {
      const times = [];
      for (const source of ["touch", "keyboard"]) {
        const input = createInput();
        try {
          const sim = createSim({ seed: 42 });
          if (source === "touch") input.setTouch({ right: true });
          else input.setKeys(["ArrowRight"]);
          const tick = (dt) => {
            const { held, just } = input.sample();
            advance(sim, dt, {
              heldRight: held.right, justRight: just.right, nudge: 0,
              freeze: true, freezeClock: true, ...handlingOf(settings),
            });
          };
          const start = sim.piece.x;
          tick(0);
          assert.equal(sim.piece.x, start + 1, `${source}: immediate first move`);
          let elapsed = 0;
          while (sim.piece.x === start + 1 && elapsed < 400) {
            tick(0.001);
            elapsed += 1;
          }
          assert.ok(Math.abs(elapsed - settings.dasMs) <= 1,
            `${source}: expected ${settings.dasMs}ms, got ${elapsed}ms`);
          times.push(elapsed);
        } finally { input.dispose(); }
      }
      assert.equal(times[0], times[1]);
    }
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("fallback hit testing matches rendered cells at different display scales", () => {
  for (const width of [143, 251, 375]) {
    for (const dpr of [1, 1.5, 2.5]) {
      const rect = { left: 17, top: 23, width, height: 503 };
      const pw = Math.floor(width * dpr), ph = Math.floor(rect.height * dpr);
      const { cell, ox, oy } = fieldLayout(pw, ph);
      for (let col = 0; col < 10; col++) {
        const x = rect.left + (ox + (col + 0.5) * cell) * rect.width / pw;
        const y = rect.top + (oy + 9.5 * cell) * rect.height / ph;
        assert.deepEqual(clientToCell(rect, x, y, pw, ph), { col, row: 9 });
      }
    }
  }
});

test("fallback preserves the board and respects ghost and colorblind settings", () => {
  const sim = createSim({ seed: 42 });
  sim.piece = { id: "O", rot: 0, x: 4, y: 3 };
  sim.board[21][0] = "T";
  const before = JSON.stringify(sim);
  let strokes = 0;
  const letters = [];
  const ctx = {
    setTransform() {}, fillRect() {}, translate() {},
    strokeRect() { strokes++; }, fillText(text) { letters.push(text); },
  };
  const canvas = { width: 500, height: 1000, getContext: () => ctx };
  drawWell(canvas, sim, 0, themeOf("ink"), false, false);
  assert.equal(strokes, 1, "only the frame is outlined when ghost is off");
  assert.deepEqual(letters, []);
  strokes = 0;
  drawWell(canvas, sim, 0, themeOf("ink"), true, true);
  assert.equal(strokes, 5, "four ghost cells plus the frame");
  assert.deepEqual(letters.sort(), ["O", "O", "O", "O", "T"]);
  assert.equal(JSON.stringify(sim), before, "rendering must not reset or mutate the game");
});
