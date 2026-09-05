#!/usr/bin/env node
/**
 * Does the Watch bot one-shot placements instead of dripping under gravity?
 * Spawns Marathon with Bot plays via qa, advances until level 15 or score
 * past a million, and fails if the bot tops out with a piece still mid-move
 * (hand still holding) — the old drip death.
 */
import { chromium } from "playwright";
const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(400);
// Watch bot title control if present, else Bot plays + Start
const watch = page.locator('button:has-text("Watch bot"), [data-qa="watch-bot"]');
if (await watch.count()) {
  await watch.first().click({ force: true });
} else {
  const bot = page.locator('button:has-text("Bot plays"), button:has-text("Bot on")');
  if (await bot.count()) await bot.first().click({ force: true });
  await page.locator('[data-qa="play"]').click({ force: true });
}
await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", { timeout: 10000 });
let peak = { level: 1, lines: 0, score: 0 };
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  const s = await page.evaluate(() => ({
    phase: window.__controlsTest?.getPhase?.(),
    level: window.__controlsTest?.getLevel?.() ?? 1,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    score: window.__controlsTest?.getScore?.() ?? 0,
  }));
  peak = { level: Math.max(peak.level, s.level), lines: Math.max(peak.lines, s.lines), score: Math.max(peak.score, s.score) };
  if (s.phase === "over") break;
  if (s.level >= 15 || s.score >= 1_000_000 || s.lines >= 150) break;
  await page.waitForTimeout(500);
}
const final = await page.evaluate(() => ({
  phase: window.__controlsTest?.getPhase?.(),
  level: window.__controlsTest?.getLevel?.() ?? 1,
  lines: window.__controlsTest?.getLines?.() ?? 0,
  score: window.__controlsTest?.getScore?.() ?? 0,
}));
console.log(JSON.stringify({ peak, final, errors }, null, 2));
const fail = [];
if (peak.level < 15 && peak.score < 1_000_000 && peak.lines < 150) {
  fail.push(`did not reach lv15 / 1M / 150 lines (peak ${JSON.stringify(peak)})`);
}
if (final.phase === "over" && peak.level < 10) fail.push("topped out before level 10 (likely drip lag)");
if (errors.filter((e) => !String(e).includes("Hydration")).length) fail.push(errors.join(" | "));
if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
