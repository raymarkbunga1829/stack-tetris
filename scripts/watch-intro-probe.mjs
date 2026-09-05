#!/usr/bin/env node
/**
 * Does Watch bot keep the well bright, and does the Watch intro stay gone?
 *
 * The Watch start card used to remount on every line clear (stuck ui.intro +
 * playing↔clearing), and skip-bloom left the pit looking unlit. Watch bot
 * no longer paints that card at all — the HUD already says ES bot. This
 * starts Watch on a phone, asserts the overlay never appears, jumps to
 * lv30, and asks that the well still has cells and light.
 * Usage: node scripts/watch-intro-probe.mjs [url]
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
};

const introVisible = (page) => page.locator('[data-qa="mode-intro"]').isVisible().catch(() => false);
const introText = (page) =>
  page.locator('[data-qa="mode-intro"] b').innerText().catch(() => "");

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

  await page.waitForTimeout(280);
  const atStart = {
    intro: await introVisible(page),
    text: (await introText(page)).trim(),
    hook: await page.evaluate(() => window.__controlsTest?.getIntro?.() ?? null),
  };
  if (atStart.intro) errors.push(`start: Watch intro showed "${atStart.text}"`);
  if (atStart.hook) errors.push(`start: getIntro is ${atStart.hook}`);

  await page.waitForTimeout(1600);
  const afterCard = {
    intro: await introVisible(page),
    hook: await page.evaluate(() => window.__controlsTest?.getIntro?.() ?? null),
    phase: await page.evaluate(() => window.__controlsTest?.getPhase?.() ?? ""),
  };
  if (afterCard.intro) errors.push("after start: Watch intro is on the well");
  if (afterCard.hook) errors.push(`after start: getIntro is still ${afterCard.hook}`);

  await page.waitForFunction(() => (window.__controlsTest?.getScore?.() ?? 0) > 0, {
    timeout: 12000,
  });
  await page.evaluate(() => window.__controlsTest?.setLevel?.(30));
  await page.waitForTimeout(400);

  let cameBack = 0;
  let lastHook = null;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250);
    if (await introVisible(page)) cameBack += 1;
    lastHook = await page.evaluate(() => window.__controlsTest?.getIntro?.() ?? null);
    if (lastHook) cameBack += 1;
  }
  if (cameBack > 0) {
    errors.push(`lv30: Watch intro came back ${cameBack} time(s) (hook ${lastHook})`);
  }

  const after = await page.evaluate(() => ({
    score: window.__controlsTest?.getScore?.() ?? 0,
    lines: window.__controlsTest?.getLines?.() ?? 0,
    phase: window.__controlsTest?.getPhase?.() ?? "",
    level: window.__controlsTest?.getLevel?.() ?? 0,
    well: window.__controlsTest?.getWell?.() ?? null,
    intro: window.__controlsTest?.getIntro?.() ?? null,
  }));
  if (after.phase === "over") {
    errors.push(`lv30: topped out (score ${after.score})`);
  }
  if (after.level < 30) errors.push(`lv30: well dropped to ${after.level}`);
  if (after.intro) errors.push(`lv30: getIntro is ${after.intro}`);
  if (after.well?.lost) errors.push("lv30: well renderer is lost");
  if ((after.well?.cells ?? 0) <= 0) {
    errors.push(`lv30: well drew 0 cells (${JSON.stringify(after.well)})`);
  }
  const luma = after.well?.luma ?? 0;
  if (luma > 0 && luma < 18) {
    errors.push(`lv30: well luma ${luma.toFixed(1)} is too dark`);
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
console.log("watch-intro-probe: ok");
