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

const LIVE_LIFT = 1.42;
const PLACED_LIFT = 1.28;
const hsv = (c) => tone.rgbToHsv(c);
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d) * 360;
};

test("the live piece stays under the luminance cap and keeps its hue", () => {
  for (const theme of THEMES) {
    for (const [id, hex] of Object.entries(theme.fill)) {
      const src = hsv(tone.hexToRgb(hex));
      const live = tone.pieceTone(hex, LIVE_LIFT);
      const out = hsv(live);
      const chroma = src.s * src.v;
      const vivid = chroma >= 0.28 && src.v - chroma / 2 <= 0.8;
      const ceiling = tone.LIFT_LUMA_CAP * (hueGap(src.h, 54 / 360) < 26 ? 1 + tone.YELLOW_HEADROOM : 1);
      const cap = vivid ? ceiling : Math.max(tone.LIFT_LUMA_CAP, tone.luma(tone.hexToRgb(hex)) * 1.3);
      assert.ok(tone.luma(live) <= cap + 1e-6, `${theme.id} ${id}: live luma ${tone.luma(live).toFixed(3)} is past ${cap.toFixed(3)}`);
      if (src.s > 0.05) assert.ok(hueGap(src.h, out.h) < 3, `${theme.id} ${id}: hue drifted`);
      assert.ok(out.s >= src.s - 1e-6, `${theme.id} ${id}: live piece lost saturation`);
    }
  }
});

test("house minos go in saturated, not pastel", () => {
  for (const [id, hex] of Object.entries(themeOf("ink").fill)) {
    for (const lift of [PLACED_LIFT, LIVE_LIFT]) {
      const c = tone.pieceTone(hex, lift);
      assert.ok(hsv(c).s >= 0.75, `ink ${id} at lift ${lift} is pastel (s=${hsv(c).s.toFixed(2)})`);
      const ceiling = tone.LIFT_LUMA_CAP * (hueGap(hsv(tone.hexToRgb(hex)).h, 54 / 360) < 26 ? 1 + tone.YELLOW_HEADROOM : 1);
      assert.ok(tone.luma(c) <= ceiling + 1e-6, `ink ${id} at lift ${lift} is too bright to stay coloured`);
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

test("lock flashes still bloom", () => {
  const flash = tone.pieceTone(themeOf("ink").flash, 2.2);
  assert.ok(tone.luma(flash) > 0.7);
});

test("the ghost is a visible outline in the piece colour, not a placed mino", () => {
  for (const [id, hex] of Object.entries(themeOf("ink").fill)) {
    for (let now = 0; now < 4000; now += 97) {
      const idle = tone.ghostLook(hex, now, null);
      assert.ok(idle.edge >= 0.7 && idle.edge <= 1, `${id}: idle ghost outline ${idle.edge.toFixed(2)}`);
      assert.ok(idle.fill > 0 && idle.fill <= 0.2, `${id}: ghost fill would pass for a mino`);
      const locking = tone.ghostLook(hex, now, 0.6);
      assert.ok(locking.edge >= 0.45 && locking.edge <= 1, `${id}: locking ghost vanished`);
    }
    const g = tone.ghostLook(hex, 0, null).tone;
    assert.ok(hueGap(hsv(g).h, hsv(tone.hexToRgb(hex)).h) < 3, `${id}: ghost is not the piece colour`);
    assert.ok(hsv(g).s >= 0.75, `${id}: ghost colour is washed out`);
  }
});

test("3D well wiring: unlit outline ghost, own env on minos, cabinet never chases the piece", () => {
  const src = readFileSync(new URL("../src/game/well3d.ts", import.meta.url), "utf8");
  assert.match(src, /new THREE\.InstancedMesh\(ghostEdgeGeo, ghostEdgeMat/);
  assert.match(src, /const ghostEdgeMat = new THREE\.MeshBasicMaterial/);
  assert.match(src, /ghostLook\(theme\.fill\[sim\.piece\.id\]/);
  const solid = src.slice(src.indexOf("const solidMat"), src.indexOf("const overlayMat"));
  assert.match(solid, /envMap: envTex/, "without its own envMap the room light ignores envMapIntensity");
  assert.doesNotMatch(src, /trimMat\.(color|emissive)\.set\(live/);
  assert.doesNotMatch(src, /(jewel|shaft)\.color\.set\(live/);
  assert.match(src, /pieceTone\(hexCol, lift\)/);
});
