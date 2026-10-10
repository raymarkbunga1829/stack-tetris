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
const tone = await load("../src/game/piece-tone.ts");
const { THEMES, themeOf } = await load("../src/game/themes.ts");

const LIVE_LIFT = 1.15;
const PLACED_LIFT = 1;
const hsv = (c) => tone.rgbToHsv(c);
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d) * 360;
};

test("every mino in every skin keeps its hue and never loses saturation, at any lift", () => {
  for (const theme of THEMES) {
    for (const [id, hex] of Object.entries(theme.fill)) {
      const src = hsv(tone.hexToRgb(hex));
      for (const lift of [PLACED_LIFT, LIVE_LIFT, tone.MAX_LIFT, 2.8, 10]) {
        const out = hsv(tone.pieceTone(hex, lift));
        if (src.s > 0.05) assert.ok(hueGap(src.h, out.h) < 3, `${theme.id} ${id} at ${lift}: hue drifted`);
        assert.ok(out.s >= src.s - 1e-6, `${theme.id} ${id} at ${lift}: lost saturation`);
      }
    }
  }
});

test("no lift, lock pop or flash can push a mino past MAX_LIFT toward white", () => {
  for (const theme of THEMES) {
    for (const hex of Object.values(theme.fill)) {
      assert.deepEqual(tone.pieceTone(hex, 10), tone.pieceTone(hex, tone.MAX_LIFT));
    }
  }
});

test("house minos go in saturated, not pastel", () => {
  for (const [id, hex] of Object.entries(themeOf("ink").fill)) {
    for (const lift of [PLACED_LIFT, LIVE_LIFT]) {
      const c = tone.pieceTone(hex, lift);
      assert.ok(hsv(c).s >= 0.75, `ink ${id} at lift ${lift} is pastel (s=${hsv(c).s.toFixed(2)})`);
    }
  }
});

test("grey and pale skins keep their own look", () => {
  for (const id of ["monolith", "lcd", "quiet"]) {
    for (const [pid, hex] of Object.entries(themeOf(id).fill)) {
      const src = hsv(tone.hexToRgb(hex));
      const out = hsv(tone.pieceTone(hex, 1));
      if (src.s * src.v < 0.1) assert.ok(Math.abs(out.s - src.s) < 0.02, `${id} ${pid} was re-saturated`);
    }
  }
});

test("yellow stays yellow instead of sinking to olive", () => {
  for (const id of ["ink", "deuter", "night", "neon"]) {
    const o = tone.pieceTone(themeOf(id).fill.O, LIVE_LIFT);
    assert.ok(hsv(o).v >= 0.8 && hsv(o).s >= 0.8, `${id} O came out ${JSON.stringify(o)}`);
  }
});

test("the ghost outline holds contrast against the pit in every skin, and never fades out", () => {
  for (const theme of THEMES) {
    const pit = tone.hexToRgb(theme.pit);
    for (const [id, hex] of Object.entries(theme.fill)) {
      for (let now = 0; now < 4000; now += 97) {
        const idle = tone.ghostLook(hex, theme.pit, now, null);
        assert.ok(idle.edge >= 0.85 && idle.edge <= 1, `${theme.id} ${id}: idle ghost outline ${idle.edge.toFixed(2)}`);
        const locking = tone.ghostLook(hex, theme.pit, now, 0.6);
        assert.ok(locking.edge >= 0.7 && locking.edge <= 1, `${theme.id} ${id}: locking ghost faded to ${locking.edge.toFixed(2)}`);
      }
      const look = tone.ghostLook(hex, theme.pit, 0, null);
      assert.equal(look.fill, undefined, "the ghost is an outline only");
      const c = tone.contrast(look.tone, pit);
      assert.ok(c >= tone.GHOST_CONTRAST - 1e-6, `${theme.id} ${id}: ghost contrast ${c.toFixed(2)} on the pit`);
    }
  }
});

test("on the house skin the ghost is the piece colour itself", () => {
  const theme = themeOf("ink");
  for (const [id, hex] of Object.entries(theme.fill)) {
    const g = tone.ghostLook(hex, theme.pit, 0, null).tone;
    assert.ok(hueGap(hsv(g).h, hsv(tone.hexToRgb(hex)).h) < 3, `${id}: ghost is not the piece colour`);
    assert.ok(hsv(g).s >= 0.7, `${id}: ghost colour is washed out`);
  }
});
