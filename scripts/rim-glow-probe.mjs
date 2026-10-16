#!/usr/bin/env node
/**
 * Does the falling piece's glow stay inside the shaft?
 *
 * Stages pieces at spawn (top rows) and over a high stack in every skin, on a
 * phone and a desktop viewport, with and without Clear well. Each frame is
 * compared with the same board while the piece is still in the hidden rows,
 * so the only difference is the visible piece and its glow:
 *
 *   chrome  the lip, the space above the well, both rails and the cabinet
 *           beside the well must not move toward the piece colour
 *   halo    the shaft right next to the piece must still light up
 *
 * Usage: node scripts/rim-glow-probe.mjs [url] [outDir]
 *   SKINS=ink,neon   only these skins
 *   ONLY=phone|desktop   one viewport
 *   CASES=spawn-Z,stack-I   only these cases
 *   SHOTS=1   save full-viewport screenshots of every staged frame
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const url = checkedUrl(process.argv[2] || "http://127.0.0.1:8080/?qa=1");
const out = process.argv[3] || "/tmp/rim-glow";
mkdirSync(out, { recursive: true });

const themesSrc = readFileSync(join(HERE, "../src/game/themes.ts"), "utf8");
const SKINS = (process.env.SKINS || [...new Set([...themesSrc.matchAll(/id: "(\w+)",[\s\S]*?fill: \{/g)].map((m) => m[1]))].join(",")).split(",");

/**
 * sRGB distance x255 between a chrome region and its no-piece baseline. The
 * ghost and danger pulses alone move it by about 5; a bloomed piece glow moved
 * it by 15 to 110.
 */
export const CHROME_MAX = 8;
/** The shaft just below the piece must brighten at least this much (x255); about 12 with no glow. */
export const HALO_MIN = 20;

const HIGH = [
  "Z.......L.",
  "ZZS....LLJ",
  "TSS..OO.JJ",
  "TTT..OO.LJ",
  "IIII..ZZL.",
  "JJ.SS..ZZL",
  "J.SS.OO.LL",
  "JTTT.OO.IL",
  "ZZT..LLLI.",
  ".ZZ.JL..IS",
  "OO..JJJ.SS",
  "OO.IIII..S",
  "LLL.TTT.ZZ",
  "L..SST..JZ",
  "IIOOTT.SSJ",
  "IIOOTT.SSJ",
];
/** One floor mino: an empty well with the piece hidden reads as blank and drops to the 2D well. */
const FLOOR = ["J........."];
const CASES = [
  { name: "spawn-Z", rows: FLOOR, piece: { id: "Z", rot: 0, x: 3, y: -1 } },
  { name: "spawn-Z2", rows: FLOOR, piece: { id: "Z", rot: 0, x: 3, y: 0 } },
  { name: "spawn-O", rows: FLOOR, piece: { id: "O", rot: 0, x: 3, y: 0 } },
  { name: "spawn-T", rows: FLOOR, piece: { id: "T", rot: 0, x: 3, y: 0 } },
  { name: "spawn-L-edge", rows: FLOOR, piece: { id: "L", rot: 0, x: 7, y: 0 } },
  { name: "stack-I", rows: HIGH, piece: { id: "I", rot: 0, x: 3, y: 0 } },
  { name: "stack-S-edge", rows: HIGH, piece: { id: "S", rot: 0, x: 0, y: 1 } },
];

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, dpr: 2 },
  { name: "desktop", viewport: { width: 1024, height: 640 }, hasTouch: false, isMobile: false, dpr: 1 },
].filter((s) => !process.env.ONLY || s.name === process.env.ONLY);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const failures = [];
const report = [];
try {
  for (const skin of SKINS) for (const size of SIZES) for (const clearWell of [true, false]) await runSkin(skin, size, clearWell);
} finally {
  await browser.close();
}
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const worst = report.reduce((m, r) => Math.max(m, r.chrome), 0);
if (failures.length) {
  console.error(`${failures.length} rim-glow failures (worst chrome shift ${worst.toFixed(1)}):\n` + failures.slice(0, 80).join("\n"));
  process.exit(1);
}
console.log(`ok: ${report.length} frames, worst chrome shift ${worst.toFixed(1)}, out ${out}`);

async function runSkin(skin, size, clearWell) {
  const label = `${skin}/${size.name}${clearWell ? "" : "/bloom"}`;
  const ctx = await browser.newContext({
    viewport: size.viewport,
    hasTouch: size.hasTouch,
    isMobile: size.isMobile,
    deviceScaleFactor: size.dpr,
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  const save = { version: 4, onboarded: true, tipSeen: true, holeSeen: true, a2hs: true, mode: "marathon", credits: 80, theme: skin, themes: ["ink", skin], clearWell };
  await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(save));
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    // The lock chip sits over the space above the well; it is DOM, not glow.
    await page.addStyleTag({ content: ".well canvas { animation: none !important; } .pred-chip { visibility: hidden !important; }" });
    await page.clock.runFor(600);
    await page.locator('[data-qa="play"]').dispatchEvent("pointerdown");
    await page.clock.runFor(200);
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", null, { timeout: 15000 });
    const skip = page.locator(".coach-skip");
    if (await skip.count()) await skip.dispatchEvent("click");
    if (await page.evaluate(() => window.__controlsTest.getIntro())) {
      await page.evaluate(() => window.__controlsTest.setKeys(["ArrowDown"]));
      await page.clock.runFor(34);
      await page.evaluate(() => window.__controlsTest.setKeys([]));
    }
    await page.clock.runFor(500);

    for (const c of CASES.filter((k) => !process.env.CASES || process.env.CASES.split(",").includes(k.name))) {
      const hidden = { ...c.piece, y: -2 };
      const base = await frame(page, c.rows, hidden, c.piece);
      const lit = await frame(page, c.rows, c.piece, c.piece);
      if (process.env.SHOTS === "1") {
        const tag = `${skin}-${size.name}${clearWell ? "" : "-bloom"}-${c.name}`;
        writeFileSync(join(out, `${tag}.png`), lit.shot);
        if (process.env.SHOTS_BASE === "1") writeFileSync(join(out, `${tag}-base.png`), base.shot);
      }
      const chromeShift = Math.max(...Object.keys(base.regions).filter((k) => k !== "halo").map((k) => dist(base.regions[k], lit.regions[k])));
      const halo = dist(base.regions.halo, lit.regions.halo);
      const worstRegion = Object.keys(base.regions)
        .filter((k) => k !== "halo")
        .sort((a, b) => dist(base.regions[b], lit.regions[b]) - dist(base.regions[a], lit.regions[a]))[0];
      report.push({ label, case: c.name, chrome: chromeShift, worstRegion, halo });
      if (chromeShift > CHROME_MAX) failures.push(`${label}/${c.name}: ${worstRegion} shifted ${chromeShift.toFixed(1)} toward the piece`);
      if (halo < HALO_MIN) failures.push(`${label}/${c.name}: no glow beside the piece (${halo.toFixed(1)})`);
    }
  } catch (err) {
    failures.push(`${label}: ${String(err).split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
}

/** Stage `piece` and sample the regions around where `around` is drawn. */
async function frame(page, rows, piece, around) {
  await page.evaluate(([r, p]) => window.__controlsTest.stage({ rows: r, piece: p }), [rows, piece]);
  await page.clock.runFor(400);
  const shot = await page.screenshot({ animations: "allow" });
  const regions = await page.evaluate(
    async ({ png, piece }) => {
      const pt = (x, y) => { const p = window.__controlsTest.cellPoint(x, y); if (!p) throw new Error(`no point ${x},${y} phase=${window.__controlsTest.getPhase()} ${JSON.stringify(window.__controlsTest.getWell())}`); return p; };
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = innerWidth;
      c.height = innerHeight;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, c.width, c.height);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      // Mean colour over a box spanned by two cell coordinates.
      const box = (c0, r0, c1, r1) => {
        const a = pt(c0, r0);
        const b = pt(c1, r1);
        const x0 = Math.round(Math.min(a.x, b.x));
        const x1 = Math.round(Math.max(a.x, b.x));
        const y0 = Math.round(Math.min(a.y, b.y));
        const y1 = Math.round(Math.max(a.y, b.y));
        let r = 0;
        let gg = 0;
        let bb = 0;
        let n = 0;
        for (let y = Math.max(0, y0); y <= Math.min(c.height - 1, y1); y++)
          for (let x = Math.max(0, x0); x <= Math.min(c.width - 1, x1); x++) {
            const o = (y * c.width + x) * 4;
            r += data[o];
            gg += data[o + 1];
            bb += data[o + 2];
            n += 1;
          }
        return n ? { r: r / n, g: gg / n, b: bb / n } : { r: 0, g: 0, b: 0 };
      };
      const row = piece.y + 1;
      return {
        lip: box(-0.5, -0.85, 9.5, -0.6),
        above: box(-0.5, -2.6, 9.5, -1.1),
        leftRail: box(-0.9, 0, -0.64, 5),
        rightRail: box(9.64, 0, 9.9, 5),
        leftCabinet: box(-1.6, -1, -0.95, 5),
        rightCabinet: box(9.95, -1, 10.6, 5),
        halo: box(piece.x - 0.4, row + 1.15, piece.x + 2.4, row + 1.45),
      };
    },
    { png: shot.toString("base64"), piece: around },
  );
  return { shot, regions };
}

function dist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
