#!/usr/bin/env node
/**
 * Does the first title belong to Start, or to the install nag?
 *
 * The Add-to-Home-Screen row mounted on any title that was not standalone and
 * had never been dismissed — which includes the very first one a player ever
 * sees. So a stranger opened Stack and the loudest full-width row under the
 * mode tabs was an offer to install a game they had not played a piece of. The
 * offer now waits for a run. This one opens the game cold and reads the title
 * the way a stranger reads it, plays a run and comes home to check the offer
 * turns up, reloads to check it stuck, dismisses it and reloads again, and
 * makes sure an installed player is never asked twice.
 * Usage: node scripts/install-offer-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

/** A phone in a browser. `save` is what the player brought with them, if any. */
const open = async (label, { save = null, installed = false } = {}) => {
  await page?.context().close();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  if (save)
    await page.addInitScript(
      (s) => localStorage.setItem("stack-tetris-v1", s),
      JSON.stringify(save),
    );
  // The home-screen copy, where the manifest already got what it wanted.
  if (installed)
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "standalone", { get: () => true }),
    );
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(600);
};

const reload = async () => {
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(600);
};

/** What the title is offering, and what the offer is sitting on top of. */
const look = () =>
  page.evaluate(() => {
    const seen = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent ?? "").trim(),
        w: Math.round(r.width),
        h: Math.round(r.height),
        gone: cs.display === "none" || cs.visibility === "hidden" || r.height < 1,
      };
    };
    return {
      phase: window.__controlsTest?.getPhase?.() ?? null,
      standalone: navigator.standalone === true,
      played: !!JSON.parse(localStorage.getItem("stack-tetris-v1") || "{}").played,
      dismissed: !!JSON.parse(localStorage.getItem("stack-tetris-v1") || "{}").a2hs,
      bar: seen('[data-qa="a2hs"]'),
      install: seen(".a2hs .install"),
      dismiss: seen(".a2hs-x"),
      start: seen('[data-qa="play"]'),
      chips: document.querySelectorAll('[data-qa^="mode-"]').length,
      // Any way in at all: the row is not the only thing that could ask.
      asks: [...document.querySelectorAll("button, a")]
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => /install|home screen/i.test(t)),
    };
  });

/** A run: Start, past the coach, a few pieces down the well. */
const play = async (slams = 4) => {
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  const skip = page.locator(".coach-skip");
  if (await skip.count()) await skip.click({ force: true });
  await page.waitForTimeout(400);
  for (let i = 0; i < slams; i++) {
    await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);
};

/** Quit to the title the plain way: pause, then Home. No run is recorded. */
const quitHome = async () => {
  await page.locator(".hud-pause").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "paused", {
    timeout: 6000,
  });
  await page.waitForTimeout(300);
  await page.locator(".pause-card .text-btn").filter({ hasText: "Home" }).click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", {
    timeout: 6000,
  });
  await page.waitForTimeout(500);
};

/** Stack straight up until the lid arrives, then leave the card for the title. */
const buryAndHome = async () => {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(90);
    const phase = await page.evaluate(() => window.__controlsTest.getPhase());
    if (phase === "over") break;
  }
  // The burial has a beat of its own: the wash, the coin flash, then the card.
  await page.waitForSelector(".veil.is-polaroid .veil-x", { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.locator(".veil.is-polaroid .veil-x").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", {
    timeout: 6000,
  });
  await page.waitForTimeout(500);
};

const results = {};

// A stranger, nothing stored, first title ever.
await open("stranger");
results.firstTitle = await look();

// They played. Coming home, the offer is welcome.
await play();
results.midRun = await look();
await quitHome();
results.afterRun = await look();

// And it is still welcome next time they open the tab.
await reload();
results.nextVisit = await look();

// Dismiss has to stay dismissed, here and after a reload.
await page.locator(".a2hs-x").click({ force: true });
await page.waitForTimeout(400);
results.dismissed = await look();
await reload();
results.dismissedAgain = await look();

// A run that ends the other way: buried, then Home off the card.
await open("buried");
await play(0);
await buryAndHome();
results.afterBurial = await look();

// The home-screen copy already installed. Never ask.
await open("installed", {
  save: { version: 4, onboarded: true, tipSeen: true, played: true, mode: "marathon" },
  installed: true,
});
results.installed = await look();

// A save from before the flag: scores on the board means they have played.
await open("veteran", {
  save: {
    version: 4,
    onboarded: true,
    tipSeen: true,
    mode: "marathon",
    high: 2400,
    scores: [{ mode: "marathon", score: 2400, lines: 12, clock: 71, won: false, t: 1 }],
  },
});
results.veteran = await look();

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];

const asking = (r) => !!r.bar && !r.bar.gone;

const noNag = (r, where) => {
  if (asking(r)) fail.push(`${where}: the install row is up (${r.bar.w}x${r.bar.h})`);
  if (r.asks.length) fail.push(`${where}: the title still asks — "${r.asks.join('", "')}"`);
};

const offers = (r, where) => {
  if (!r.bar) fail.push(`${where}: the install offer never came back`);
  else if (r.bar.gone) fail.push(`${where}: the install row is on the page but hidden`);
  if (!r.install || r.install.gone) fail.push(`${where}: the offer has nothing to install with`);
  if (!r.dismiss || r.dismiss.gone) fail.push(`${where}: the offer cannot be dismissed`);
};

// The first title is the whole point: Start and the cabinet, nothing else.
noNag(results.firstTitle, "the first title");
if (results.firstTitle.played) fail.push("a stranger is marked as having played");
if (!results.firstTitle.start || results.firstTitle.start.gone)
  fail.push("the first title has no Start on it");
if (results.firstTitle.start && !/start/i.test(results.firstTitle.start.text))
  fail.push(`the first title reads "${results.firstTitle.start.text}" where Start should be`);
if (results.firstTitle.chips < 3)
  fail.push(`the first title only shows ${results.firstTitle.chips} mode tabs`);

// Nothing about the row belongs in a run either.
noNag(results.midRun, "mid-run");

offers(results.afterRun, "back on the title after a run");
if (!results.afterRun.played) fail.push("a run was played and the save did not notice");
offers(results.nextVisit, "on the next visit");
offers(results.afterBurial, "back on the title after a burial");

if (asking(results.dismissed)) fail.push("Dismiss did not take the row down");
if (!results.dismissed.dismissed) fail.push("Dismiss was not written to the save");
noNag(results.dismissedAgain, "after a reload, once dismissed");

noNag(results.installed, "already installed");

offers(results.veteran, "for a player who arrived with scores");

// A stored save always differs from what the server guessed, and most runs here
// start from one, so the hydration grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
