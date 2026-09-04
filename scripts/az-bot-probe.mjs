#!/usr/bin/env node
/**
 * Does the AZ bot keep up with gravity?
 *
 * Watch bot now slams a whole placement in one tick — hold, rot, column,
 * hard drop — so a level-15 well cannot bury it between pulses. This one
 * starts Watch bot on a phone, waits until the net is in, then jumps the
 * well to level 15 and asks it to keep scoring.
 * Usage: node scripts/az-bot-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
};

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  page = await ctx.newPage();
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

  await page.waitForFunction(() => window.__controlsTest?.getAz?.() === true, {
    timeout: 15000,
  });
  const hud = await page.locator('[data-qa="hud-mode"]').textContent();
  if (!/az|mcts/i.test(hud ?? "")) errors.push(`hud: wanted AZ bot, got "${hud?.trim()}"`);
  const label = await page.locator('[data-qa="watch-label"]').textContent();
  if (!/az|mcts|bot/i.test(label ?? "")) errors.push(`dock: wanted AZ bot, got "${label?.trim()}"`);
  if (await page.locator('[data-qa="pad-hard"]').isVisible()) {
    errors.push("play: Drop pad is still out");
  }

  await page.evaluate(() => window.__controlsTest?.setLevel?.(15));
  const before = await page.evaluate(() => ({
    score: window.__controlsTest?.getScore?.() ?? 0,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    phase: window.__controlsTest?.getPhase?.() ?? "",
  }));
  await page.waitForTimeout(2800);
  const after = await page.evaluate(() => ({
    score: window.__controlsTest?.getScore?.() ?? 0,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    phase: window.__controlsTest?.getPhase?.() ?? "",
    level: window.__controlsTest?.getLevel?.() ?? 0,
  }));
  if (after.phase === "over") {
    errors.push(`level 15: topped out (score ${before.score} → ${after.score})`);
  }
  if (after.score <= before.score && after.lines <= before.lines) {
    errors.push(`level 15: the bot did not keep scoring (${before.score} → ${after.score})`);
  }
  if (after.level < 15) errors.push(`level 15: well dropped to ${after.level}`);
} catch (err) {
  errors.push(String(err).split("\n")[0]);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("az-bot-probe: ok");
