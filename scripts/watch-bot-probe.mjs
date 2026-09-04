#!/usr/bin/env node
/**
 * Does Watch bot play Marathon without a thumb on the pad?
 *
 * The well is the same well. The score is the same table. A linear bot slams
 * rotation, column, hold — no T-spins, no Zap — and a phone has to be able to
 * sit and watch: a Watch bot button on the title, the pad gone, Pause still
 * Pause, Hold and Next still painted, the recap still score and lines and
 * level. Then Marathon has to take the pad back as if nothing happened.
 * Usage: node scripts/watch-bot-probe.mjs [url]
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

const start = async (label) => {
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
    errors.push(`${label}: ${msg}`);
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);
};

const look = () =>
  page.evaluate(() => {
    const recap = [...document.querySelectorAll(".recap li")].map((li) => ({
      k: li.querySelector("span")?.textContent?.trim() ?? "",
      v: li.querySelector("b")?.textContent?.trim() ?? "",
    }));
    return {
      phase: window.__controlsTest?.getPhase?.() ?? null,
      score: window.__controlsTest?.getScore?.() ?? 0,
      lines: window.__controlsTest?.getLines?.() ?? 0,
      level: window.__controlsTest?.getLevel?.() ?? 0,
      mode: window.__controlsTest?.getMode?.() ?? null,
      pad: !!document.querySelector('[data-qa="pad-hard"]'),
      padBox: (() => {
        const el = document.querySelector('[data-qa="pad-hard"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          gone: cs.display === "none" || cs.visibility === "hidden" || r.height < 2,
        };
      })(),
      label: document.querySelector('[data-qa="watch-label"]')?.textContent?.trim() ?? "",
      hud: document.querySelector(".hud em")?.textContent?.trim() ?? "",
      hold: !!document.querySelector(".pocket-hold"),
      next: document.querySelectorAll(".rail-next .pocket").length,
      pause: !!document.querySelector(".hud-pause"),
      powers: !!document.querySelector(".powers"),
      recap,
      recapScore: document.querySelector(".veil.is-polaroid .veil-title")?.textContent?.trim() ?? "",
      credits: window.__controlsTest?.getCredits?.() ?? 0,
    };
  });

try {
  await start("watch");
  const title = await page.locator('[data-qa="watch-bot"]').isVisible();
  if (!title) errors.push("title: Watch bot is not on the title");
  await page.locator('[data-qa="watch-bot"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForFunction(
    () => (window.__controlsTest?.getScore?.() ?? 0) > 0 && (window.__controlsTest?.getMode?.() ?? "") === "watch",
    { timeout: 12000 },
  );
  const playing = await look();
  if (playing.mode !== "watch") errors.push(`play: mode is ${playing.mode}, wanted watch`);
  if (!/watch|az|mcts/i.test(playing.hud))
    errors.push(`play: HUD does not say Watch/AZ bot ("${playing.hud}")`);
  if (!/watch|az|mcts|bot/i.test(playing.label))
    errors.push(`play: dock does not say Watch/AZ bot ("${playing.label}")`);
  if (playing.pad && playing.padBox && !playing.padBox.gone)
    errors.push("play: Drop pad is still out while the bot is playing");
  if (!playing.hold) errors.push("play: Hold pocket is gone");
  if (playing.next < 3) errors.push(`play: Next only has ${playing.next} pockets`);
  if (!playing.pause) errors.push("play: Pause is gone");
  if (playing.powers) errors.push("play: power bar is out on a watch run");
  if (playing.credits !== 80) errors.push(`play: credits moved to ${playing.credits}`);

  await page.locator("button.hud-pause").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "paused", {
    timeout: 4000,
  });
  const scoreAtPause = await page.evaluate(() => window.__controlsTest?.getScore?.() ?? 0);
  await page.waitForTimeout(400);
  const paused = await look();
  if (paused.phase !== "paused") errors.push(`pause: phase is ${paused.phase}`);
  if (paused.score !== scoreAtPause) errors.push("pause: the bot still scored while paused");
  await page.locator(".pause-card .play-btn").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 4000,
  });

  await page.evaluate(() => window.__controlsTest.topOut());
  await page.waitForSelector(".veil.is-polaroid", { timeout: 8000 });
  await page.waitForTimeout(200);
  const over = await look();
  const keys = over.recap.map((r) => r.k.toLowerCase());
  if (!over.recapScore) errors.push("recap: score is missing");
  if (!keys.includes("lines")) errors.push("recap: lines is missing");
  if (!keys.includes("level")) errors.push("recap: level is missing");

  await page.locator(".veil.is-polaroid .veil-x").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", {
    timeout: 6000,
  });
  await page.context().close();

  await start("marathon");
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  const skip = page.locator(".coach-skip");
  if (await skip.count()) await skip.click({ force: true });
  await page.waitForTimeout(300);
  const marathon = await look();
  if (marathon.mode !== "marathon") errors.push(`marathon: mode is ${marathon.mode}`);
  if (!marathon.pad || marathon.padBox?.gone) errors.push("marathon: Drop pad did not come back");
  const before = marathon.score;
  await page.locator('[data-qa="pad-hard"]').dispatchEvent("pointerdown", {
    bubbles: true,
    pointerId: 1,
    pointerType: "touch",
  });
  await page.waitForTimeout(250);
  const after = await look();
  if (after.score <= before) errors.push("marathon: Drop no longer scores");
  const holdBefore = await page.evaluate(() => window.__controlsTest.getHold());
  await page.locator('[data-qa="pad-hold"]').dispatchEvent("pointerdown", {
    bubbles: true,
    pointerId: 2,
    pointerType: "touch",
  });
  await page.waitForTimeout(200);
  const holdAfter = await page.evaluate(() => window.__controlsTest.getHold());
  if (!holdAfter || holdAfter === holdBefore) errors.push("marathon: Hold no longer parks a piece");
} catch (err) {
  errors.push(String(err).split("\n")[0]);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("watch-bot-probe: ok");
