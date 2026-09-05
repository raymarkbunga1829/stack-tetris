#!/usr/bin/env node
/**
 * Does Bot plays drive Sprint, skip Finesse, and rest legally in Classic?
 *
 * Watch bot stays the Marathon shortcut. Every other mode (except Finesse)
 * can be handed to the same bot from the title toggle or the Modes sheet.
 * The well is still the real sim — no second physics, no score injection.
 * Usage: node scripts/bot-modes-probe.mjs [url]
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
    const pad = document.querySelector('[data-qa="pad-hard"]');
    const padBox = pad
      ? (() => {
          const r = pad.getBoundingClientRect();
          const cs = getComputedStyle(pad);
          return {
            gone: cs.display === "none" || cs.visibility === "hidden" || r.height < 2,
          };
        })()
      : null;
    return {
      phase: window.__controlsTest?.getPhase?.() ?? null,
      score: window.__controlsTest?.getScore?.() ?? 0,
      lines: window.__controlsTest?.getLines?.() ?? 0,
      level: window.__controlsTest?.getLevel?.() ?? 0,
      mode: window.__controlsTest?.getMode?.() ?? null,
      bot: !!window.__controlsTest?.getBot?.(),
      banner: window.__controlsTest?.getBanner?.() ?? "",
      pad: !!pad,
      padGone: !pad || !!padBox?.gone,
      label: document.querySelector('[data-qa="watch-label"]')?.textContent?.trim() ?? "",
      hud: document.querySelector('[data-qa="hud-mode"]')?.textContent?.trim()
        ?? document.querySelector(".hud em")?.textContent?.trim()
        ?? "",
      start: document.querySelector('[data-qa="play"]')?.textContent?.trim() ?? "",
      skip: document.querySelector('[data-qa="bot-skip"]')?.textContent?.trim() ?? "",
      hold: !!document.querySelector(".pocket-hold"),
      next: document.querySelectorAll(".rail-next .pocket").length,
      pause: !!document.querySelector(".hud-pause"),
      powers: !!document.querySelector(".powers"),
      recap,
      recapScore: document.querySelector(".veil.is-polaroid .veil-title")?.textContent?.trim() ?? "",
      credits: window.__controlsTest?.getCredits?.() ?? 0,
    };
  });

const armBot = async () => {
  await page.locator('button[aria-label="Settings"]').click({ force: true });
  await page.waitForSelector('[data-qa="set-bot"]', { timeout: 4000 });
  if ((await page.locator('[data-qa="set-bot"] b').innerText()).trim() !== "On") {
    await page.locator('[data-qa="set-bot"]').click({ force: true });
  }
  await page.locator(".shop-x").click({ force: true });
  await page.waitForTimeout(150);
};

try {
  await start("title");
  if (await page.locator('[data-qa="bot-plays"]').count())
    errors.push("title: Bot plays should live in Settings, not on the well");
  if (await page.locator('[data-qa="watch-bot"]').isVisible())
    errors.push("title: Watch bot showed with ES bot off");
  await page.locator('button[aria-label="Settings"]').click({ force: true });
  await page.waitForSelector('[data-qa="set-bot"]', { timeout: 4000 });
  await page.locator('[data-qa="set-bot"]').click({ force: true });
  await page.locator(".shop-x").click({ force: true });
  await page.waitForTimeout(200);
  if (!(await page.locator('[data-qa="watch-bot"]').isVisible()))
    errors.push("title: Watch bot did not appear after ES bot On");
  await page.locator('[data-qa="mode-more"]').click({ force: true });
  await page.waitForSelector('[data-qa="sheet-mode-finesse"]', { timeout: 4000 });
  if (await page.locator('[data-qa="sheet-bot-plays"]').count())
    errors.push("modes: Bot on should not sit under the mode list");
  await page.locator(".shop-veil.is-modes .shop-x").click({ force: true });
  await page.context().close();

  await start("sprint");
  await page.locator('[data-qa="mode-sprint"]').click({ force: true });
  await armBot();
  const armed = await look();
  if (!armed.start.toLowerCase().includes("sprint") && !armed.start.toLowerCase().includes("watch"))
    errors.push(`sprint title: Start says "${armed.start}", wanted Watch Sprint`);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForFunction(
    () => (window.__controlsTest?.getScore?.() ?? 0) > 0 && (window.__controlsTest?.getMode?.() ?? "") === "sprint",
    { timeout: 14000 },
  );
  const playing = await look();
  if (playing.mode !== "sprint") errors.push(`sprint: mode is ${playing.mode}, wanted sprint`);
  if (!playing.bot) errors.push("sprint: getBot is false");
  if (!/bot|es|watch/i.test(playing.hud))
    errors.push(`sprint: HUD does not say Bot/ES ("${playing.hud}")`);
  if (!/sprint|bot|es|watch/i.test(playing.label))
    errors.push(`sprint: dock does not say Bot / Sprint ("${playing.label}")`);
  if (!playing.padGone) errors.push("sprint: Drop pad is still out while the bot is playing");
  if (!playing.hold) errors.push("sprint: Hold pocket is gone");
  if (playing.next < 3) errors.push(`sprint: Next only has ${playing.next} pockets`);
  if (!playing.pause) errors.push("sprint: Pause is gone");
  if (playing.powers) errors.push("sprint: power bar is out on a bot run");
  if (playing.credits !== 80) errors.push(`sprint: credits moved to ${playing.credits}`);

  await page.locator("button.hud-pause").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "paused", {
    timeout: 4000,
  });
  const scoreAtPause = await page.evaluate(() => window.__controlsTest?.getScore?.() ?? 0);
  await page.waitForTimeout(400);
  const paused = await look();
  if (paused.phase !== "paused") errors.push(`sprint pause: phase is ${paused.phase}`);
  if (paused.score !== scoreAtPause) errors.push("sprint pause: the bot still scored while paused");
  await page.locator(".pause-card .play-btn").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 4000,
  });

  await page.evaluate(() => window.__controlsTest.topOut());
  await page.waitForSelector(".veil.is-polaroid", { timeout: 8000 });
  await page.waitForTimeout(200);
  const over = await look();
  const keys = over.recap.map((r) => r.k.toLowerCase());
  if (!over.recapScore) errors.push("sprint recap: score is missing");
  if (!keys.includes("lines") && !keys.includes("lines left") && !keys.some((k) => k.includes("line")))
    errors.push("sprint recap: lines is missing");
  if (!keys.includes("level") && !keys.includes("time"))
    errors.push("sprint recap: level/time is missing");
  const retry = await page.locator(".veil.is-polaroid .play-btn").textContent();
  if (!/watch again/i.test(retry ?? ""))
    errors.push(`sprint recap: Retry says "${retry}", wanted Watch again`);
  await page.locator(".veil.is-polaroid .veil-x").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", {
    timeout: 6000,
  });
  await page.context().close();

  await start("finesse");
  await armBot();
  await page.locator('[data-qa="mode-more"]').click({ force: true });
  await page.waitForSelector('[data-qa="sheet-mode-finesse"]', { timeout: 4000 });
  if (await page.locator('[data-qa="sheet-bot-plays"]').count())
    errors.push("finesse: Modes sheet still has Bot plays");
  await page.locator('[data-qa="sheet-mode-finesse"]').click({ force: true });
  await page.waitForTimeout(300);
  const skipped = await look();
  if (skipped.bot) errors.push("finesse: picking Finesse left the bot on");
  if (skipped.phase !== "title") errors.push(`finesse: phase is ${skipped.phase}, wanted title`);
  const msg = `${skipped.skip} ${skipped.banner}`.toLowerCase();
  if (msg.indexOf("finesse") < 0)
    errors.push(`finesse: no skip message ("${skipped.skip}" / "${skipped.banner}")`);
  await page.locator('button[aria-label="Settings"]').click({ force: true });
  await page.waitForSelector('[data-qa="set-bot"]', { timeout: 4000 });
  const finesseRow = page.locator('[data-qa="set-bot"]');
  if (await finesseRow.isEnabled()) {
    await finesseRow.click({ force: true });
    await page.waitForTimeout(200);
  }
  const refusedOn = (await page.locator('[data-qa="set-bot"] b').innerText()).trim();
  await page.locator(".shop-x").click({ force: true });
  const refused = await look();
  if (refused.bot || refusedOn === "On") errors.push("finesse: ES bot turned on in Finesse");
  if (refused.phase !== "title") errors.push(`finesse refuse: phase is ${refused.phase}`);
  await page.context().close();

  await start("classic");
  await page.locator('[data-qa="mode-more"]').click({ force: true });
  await page.waitForSelector('[data-qa="sheet-mode-classic"]', { timeout: 4000 });
  await page.locator('[data-qa="sheet-mode-classic"]').click({ force: true });
  await page.waitForTimeout(150);
  await armBot();
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForFunction(
    () =>
      (window.__controlsTest?.getScore?.() ?? 0) > 0 &&
      (window.__controlsTest?.getMode?.() ?? "") === "classic",
    { timeout: 14000 },
  );
  const classic = await look();
  if (classic.mode !== "classic") errors.push(`classic: mode is ${classic.mode}`);
  if (!classic.bot) errors.push("classic: getBot is false");
  if (!classic.padGone) errors.push("classic: Drop pad is still out");
  if (classic.powers) errors.push("classic: power bar is out on Classic");
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
  if (marathon.bot) errors.push("marathon: human Start was driven by the bot");
  if (marathon.padGone) errors.push("marathon: Drop pad did not come back");
  if (marathon.hud.toLowerCase().indexOf("bot") >= 0)
    errors.push(`marathon: HUD still says Bot ("${marathon.hud}")`);
} catch (err) {
  errors.push(String(err).split("\n")[0]);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("bot-modes-probe: ok");
