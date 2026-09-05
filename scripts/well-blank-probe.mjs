#!/usr/bin/env node
/**
 * Does Watch bot keep a visible well past level 30?
 *
 * Live ES bot used to slam every rAF at think=0 once gravity hardened, then
 * the WebGL well went blank around lv17 while the sim kept scoring. This
 * starts Watch bot on a phone, jumps the well to 30, and asks that the
 * canvas still has cells, Pause still pauses, and Leave restores the title
 * well without a reload.
 * Usage: node scripts/well-blank-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
  botPlay: true,
};

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(SAVE));
  page.on("pageerror", (e) => {
    const msg = e.message.split("\n")[0];
    if (/Hydration failed|Minified React error #418|#423|#425/.test(msg)) return;
    errors.push(`page: ${msg}`);
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);

  if (!(await page.locator('[data-qa="watch-bot"]').isVisible())) {
    errors.push("title: Watch bot is not on the title");
  }
  await page.locator('[data-qa="watch-bot"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForFunction(() => (window.__controlsTest?.getScore?.() ?? 0) > 0, {
    timeout: 12000,
  });

  await page.evaluate(() => window.__controlsTest?.setLevel?.(30));
  const before = await page.evaluate(() => ({
    score: window.__controlsTest?.getScore?.() ?? 0,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    level: window.__controlsTest?.getLevel?.() ?? 0,
    well: window.__controlsTest?.getWell?.() ?? null,
  }));
  await page.waitForTimeout(2800);
  const after = await page.evaluate(() => ({
    score: window.__controlsTest?.getScore?.() ?? 0,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    phase: window.__controlsTest?.getPhase?.() ?? "",
    level: window.__controlsTest?.getLevel?.() ?? 0,
    well: window.__controlsTest?.getWell?.() ?? null,
  }));
  if (after.phase === "over") {
    errors.push(`level 30: topped out (score ${before.score} → ${after.score})`);
  }
  if (after.score <= before.score && after.lines <= before.lines) {
    errors.push(`level 30: the bot did not keep scoring (${before.score} → ${after.score})`);
  }
  if (after.level < 30) errors.push(`level 30: well dropped to ${after.level}`);
  if (after.well?.lost) errors.push("level 30: well renderer is lost");
  if ((after.well?.cells ?? 0) <= 0) errors.push(`level 30: well drew 0 cells (${JSON.stringify(after.well)})`);
  if ((after.well?.w ?? 0) < 8 || (after.well?.h ?? 0) < 8) {
    errors.push(`level 30: canvas shrank to ${after.well?.w}×${after.well?.h}`);
  }

  const pauseBtn = page.locator("button.hud-pause");
  if (!(await pauseBtn.isVisible())) errors.push("pause: Pause button is not visible");
  await pauseBtn.click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "paused", {
    timeout: 4000,
  });
  const scoreAtPause = await page.evaluate(() => window.__controlsTest?.getScore?.() ?? 0);
  await page.waitForTimeout(400);
  const pausedScore = await page.evaluate(() => window.__controlsTest?.getScore?.() ?? 0);
  if (pausedScore !== scoreAtPause) errors.push("pause: the bot still scored while paused");
  await page.locator(".pause-card .play-btn").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 4000,
  });

  await page.locator('[data-qa="watch-leave"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", {
    timeout: 6000,
  });
  await page.waitForTimeout(500);
  const title = await page.evaluate(() => ({
    phase: window.__controlsTest?.getPhase?.() ?? "",
    well: window.__controlsTest?.getWell?.() ?? null,
  }));
  if (title.phase !== "title") errors.push(`leave: phase is ${title.phase}`);
  if (title.well?.lost) errors.push("leave: title well renderer is lost");
  if ((title.well?.w ?? 0) < 8 || (title.well?.h ?? 0) < 8) {
    errors.push(`leave: title canvas shrank to ${title.well?.w}×${title.well?.h}`);
  }
} catch (err) {
  errors.push(String(err).split("\n")[0]);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("well-blank-probe: ok");
