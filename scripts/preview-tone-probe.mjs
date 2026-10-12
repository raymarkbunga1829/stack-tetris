#!/usr/bin/env node
/**
 * Do the Next queue and Hold box show each piece in the well's colour?
 *
 * Starts a Marathon run on a phone and a desktop viewport, holds once (so the
 * Hold box is in its spent, dimmed state), and screenshots the whole cabinet
 * plus each rail. It also checks every preview cell is painted with
 * pieceTone() of that piece's skin colour, the same tone the well uses.
 * Usage: node scripts/preview-tone-probe.mjs [url] [outDir] [tag]
 * THEME=lcd picks a skin. ONLY=phone|desktop runs one viewport.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import ts from "typescript";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";
const out = process.argv[3] || "/tmp/preview-tone";
const tag = process.argv[4] || process.env.THEME || "ink";
mkdirSync(out, { recursive: true });

const load = (file) => {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
};
const { pieceTone } = await load("../src/game/piece-tone.ts");
const { themeOf } = await load("../src/game/themes.ts");
const skin = themeOf(process.env.THEME || "ink");
const rgb = ({ r, g, b }) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
  ...(process.env.THEME ? { theme: process.env.THEME, themes: ["ink", process.env.THEME] } : {}),
};

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: "desktop", viewport: { width: 1024, height: 640 }, hasTouch: false, isMobile: false },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

try {
  const only = process.env.ONLY;
  for (const size of SIZES.filter((s) => !only || s.name === only)) {
    const ctx = await browser.newContext({
      viewport: size.viewport,
      hasTouch: size.hasTouch,
      isMobile: size.isMobile,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(SAVE));
    page.on("pageerror", (e) => {
      const msg = e.message.split("\n")[0];
      if (/Hydration failed|Minified React error #418|#423|#425/.test(msg)) return;
      errors.push(`${size.name}: ${msg}`);
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(500);
    await page.locator('[data-qa="play"]').dispatchEvent("pointerdown");
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", { timeout: 8000 });
    await page.waitForTimeout(900);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__controlsTest.setKeys(["KeyC"]));
      await page.waitForTimeout(140);
      await page.evaluate(() => window.__controlsTest.setKeys([]));
      await page.waitForTimeout(300);
      if (await page.evaluate(() => window.__controlsTest.getHold())) break;
    }
    await page.waitForTimeout(500);

    const cells = await page.evaluate(() =>
      [...document.querySelectorAll(".rail .mini[aria-label]")].map((m) => ({
        name: m.getAttribute("aria-label"),
        hold: !!m.closest(".pocket-hold"),
        spent: !!m.closest(".pocket-hold.is-spent"),
        bg: getComputedStyle(m.querySelector(".mini-cell")).backgroundColor,
      })),
    );
    const { GEM_NAME } = await load("../src/game/themes.ts");
    const idOf = Object.fromEntries(Object.entries(GEM_NAME).map(([id, n]) => [n, id]));
    if (!cells.some((c) => c.hold)) errors.push(`${size.name}: hold box is empty after pressing hold`);
    if (!cells.some((c) => !c.hold)) errors.push(`${size.name}: next queue is empty`);
    for (const c of cells) {
      const want = rgb(pieceTone(skin.fill[idOf[c.name]]));
      if (c.bg !== want) errors.push(`${size.name}: ${c.hold ? "hold" : "next"} ${c.name} is ${c.bg}, well tone is ${want}`);
    }
    console.log(size.name, JSON.stringify(cells));

    await page.screenshot({ timeout: 90000, path: `${out}/${tag}-${size.name}.png` });
    const clips = await page.evaluate(() =>
      [...document.querySelectorAll(".rail")].map((rail) => {
        const r = rail.getBoundingClientRect();
        const last = [...rail.querySelectorAll(".pocket")].pop()?.getBoundingClientRect();
        const pad = 8;
        return {
          x: Math.max(0, r.x - pad),
          y: Math.max(0, r.y - pad),
          width: r.width + pad * 2,
          height: (last ? last.bottom - r.y : r.height) + pad * 2,
        };
      }),
    );
    for (const [i, clip] of clips.entries()) {
      await page.screenshot({ clip, timeout: 90000, path: `${out}/${tag}-${size.name}-${i ? "next" : "hold"}.png` });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok: screenshots in ${out}`);
