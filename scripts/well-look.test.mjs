import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Static guards for the things that used to wash minos out. The rendered check
 * is scripts/well-look-probe.mjs; these catch the same regressions without a
 * browser, in places the probe deliberately pins (the canvas slam animation).
 */
const well = readFileSync(new URL("../src/game/well3d.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const block = (src, start) => {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `${start} is missing`);
  let depth = 0;
  for (let j = src.indexOf("{", i); j < src.length; j++) {
    if (src[j] === "{") depth += 1;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
};

test("minos, live piece, ghost, shards and marks are drawn in the front pass only", () => {
  assert.match(well, /front\.add\(solids, live, ghosts\)/);
  assert.match(well, /front\.add\(shards\)/);
  assert.match(well, /front\.add\(pips\)/);
  for (const mesh of ["solids", "live", "ghosts", "shards", "pips"]) {
    assert.doesNotMatch(well, new RegExp(`scene\\.add\\([^)]*\\b${mesh}\\b`), `${mesh} is back in the lit scene`);
  }
  for (const veil of ["dangerVeil", "slowVeil", "shieldShell", "pcFlash", "sweepMesh", "zapMesh", "haze", "god"]) {
    assert.doesNotMatch(well, new RegExp(`front\\.add\\([^)]*\\b${veil}\\b`), `${veil} would draw over the minos`);
  }
});

test("the front pass renders after bloom and tone mapping, over a cleared depth buffer", () => {
  const frame = block(well, "function renderFrame()");
  const composed = frame.indexOf("composer.render()");
  const front = frame.indexOf("renderer.render(front, camera)");
  assert.ok(composed >= 0 && front > composed, "front pass must come after the composer");
  assert.ok(frame.indexOf("renderer.clearDepth()") < front);
  assert.doesNotMatch(well, /renderer\.render\(scene, camera\);\s*\n\s*else composer\.render\(\);\s*\n\s*\}/, "a render path skips the front pass");
});

test("the gem material is unlit, untoned and unfogged; the ghost is untoned", () => {
  const gem = block(well, "function makeGemMaterial()");
  assert.match(gem, /new THREE\.ShaderMaterial/);
  assert.match(gem, /toneMapped: false/);
  assert.match(gem, /fog: false/);
  assert.match(gem, /lights: false/);
  assert.doesNotMatch(gem, /envMap|emissive|clearcoat|iridescence|sheenColor/);
  assert.match(block(well, "const ghostEdgeMat"), /toneMapped: false/);
  assert.doesNotMatch(well, /MeshPhysicalMaterial\(\{[^}]*\}\);\s*\n\s*const solids/);
});

test("lock pops keep the piece's own colour instead of the skin's flash white", () => {
  assert.doesNotMatch(well, /thump \? theme\.flash/);
  assert.doesNotMatch(well, /multiplyScalar\([^)]*\);\s*\n\s*(solids|live|shards)\.setColorAt/);
});

test("the frame, lip, jewel and shaft light follow the falling piece, and its glow sits in the bloomed scene", () => {
  assert.match(well, /accentGoal\.setRGB\(/, "the accent no longer tracks the live piece");
  for (const target of ["trimMat.emissive", "lipMat.emissive", "jewel.color", "godMat.color"]) {
    assert.match(well, new RegExp(`${target.replace(".", "\\.")}\\.copy\\(accent\\)`), `${target} is pinned to the skin`);
  }
  assert.match(well, /shaft\.color\.copy\(themeShaft\)\.lerp\(accent/);
  assert.match(well, /scene\.add\(glowCells\)/);
  assert.doesNotMatch(well, /front\.add\([^)]*\bglowCells\b/);
  assert.match(well, /new UnrealBloomPass\(.*,\s*0\.72\)/, "bloom threshold moved off 0.72");
});

test("nothing in CSS brightens the canvas or tints the well in danger", () => {
  const slam = block(css, "@keyframes well-slam");
  assert.doesNotMatch(slam, /filter/, "well-slam must stay transform-only");
  for (const m of css.matchAll(/([^{}]*\.well canvas[^{}]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[2], /filter\s*:/, `${m[1].trim()} filters the canvas`);
  }
  assert.doesNotMatch(css, /\.is-(danger|brink) \.well::(before|after)/, "danger tint over the canvas");
});
