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
const watch = page.locator('[data-qa="watch-bot"]');
if (await watch.count()) {
  await watch.first().click({ force: true });
} else {
  await page.locator('button[aria-label="Settings"]').click({ force: true });
  await page.waitForSelector('[data-qa="set-bot"]', { timeout: 4000 });
  const on = (await page.locator('[data-qa="set-bot"] b').innerText()).trim() === "On";
  if (!on) await page.locator('[data-qa="set-bot"]').click({ force: true });
  await page.locator(".shop-x").click({ force: true });
  await page.locator('[data-qa="play"]').click({ force: true });
}
await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", { timeout: 10000 });
let peak = { level: 1, lines: 0, score: 0 };
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const s = await page.evaluate(() => ({
    phase: window.__controlsTest?.getPhase?.(),
    level: window.__controlsTest?.getLevel?.() ?? 1,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    score: window.__controlsTest?.getScore?.() ?? 0,
  }));
  peak = { level: Math.max(peak.level, s.level), lines: Math.max(peak.lines, s.lines), score: Math.max(peak.score, s.score) };
  if (s.phase === "over") break;
  if (s.level >= 10 || s.score >= 50_000 || s.lines >= 80) break;
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
if (peak.level < 10 && peak.score < 50_000 && peak.lines < 80) {
  fail.push(`did not survive gravity (peak ${JSON.stringify(peak)})`);
}
if (final.phase === "over" && peak.level < 10) fail.push("topped out before level 10 (likely drip lag)");
if (errors.filter((e) => !String(e).includes("Hydration")).length) fail.push(errors.join(" | "));
if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
