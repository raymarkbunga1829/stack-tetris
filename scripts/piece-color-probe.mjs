#!/usr/bin/env node
/**
 * Does the falling piece read in its own colour, with a visible ghost?
 *
 * Plays a few pieces on a phone and a desktop viewport, holds once, lets the
 * next piece fall a little and screenshots the well while it is in the air.
 * Usage: node scripts/piece-color-probe.mjs [url] [outDir] [tag]
 * THEME=neon picks a skin. WAIT=ms lets the piece fall further. PIECE=O waits for that piece to be falling; CLEAR=0 turns Clear well off (bloom path).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";
const out = process.argv[3] || "/tmp/piece-color";
const tag = process.argv[4] || "shot";
mkdirSync(out, { recursive: true });

const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
  ...(process.env.CLEAR === "0" ? { clearWell: false } : {}),
  ...(process.env.THEME ? { theme: process.env.THEME, themes: ["ink", process.env.THEME] } : {}),
};

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: "desktop", viewport: { width: 1024, height: 640 }, hasTouch: false, isMobile: false },
  { name: "desktop-wide", viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false },
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
      deviceScaleFactor: size.isMobile ? 2 : 1,
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
    await page.waitForTimeout(1200);

    const press = async (code, wait = 90, hold = 40) => {
      await page.evaluate((c) => window.__controlsTest.setKeys([c]), code);
      await page.waitForTimeout(hold);
      await page.evaluate(() => window.__controlsTest.setKeys([]));
      await page.waitForTimeout(wait);
    };
    const plan = [-4, 3, 0, -2, 4];
    for (const shift of plan) {
      for (let i = 0; i < Math.abs(shift); i++) await press(shift < 0 ? "ArrowLeft" : "ArrowRight", 70);
      await press("Space", 260);
    }
    for (let i = 0; i < 4; i++) {
      await press("KeyC", 300, 140);
      if (await page.evaluate(() => window.__controlsTest.getHold())) break;
    }
    for (let i = 0; process.env.PIECE && i < 10; i++) {
      if ((await page.evaluate(() => window.__controlsTest.getPiece())) === process.env.PIECE) break;
      await press(i % 2 ? "ArrowRight" : "ArrowLeft", 60);
      await press(i % 2 ? "ArrowRight" : "ArrowLeft", 60);
      await press("Space", 260);
    }
    await page.waitForTimeout(Number(process.env.WAIT || 900));
    const state = await page.evaluate(() => ({
      piece: window.__controlsTest.getPiece(),
      hold: window.__controlsTest.getHold(),
      y: window.__controlsTest.getY(),
      well: window.__controlsTest.getWell(),
    }));
    console.log(size.name, JSON.stringify(state));
    if (!state.hold) errors.push(`${size.name}: hold is empty after pressing hold`);
    if (state.well.lost || state.well.cells <= 0) errors.push(`${size.name}: well drew nothing`);
    await page.screenshot({ path: `${out}/${tag}-${size.name}.png` });
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
