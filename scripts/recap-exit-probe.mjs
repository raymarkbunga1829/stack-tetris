#!/usr/bin/env node
/**
 * Once the card is up, can a player find the way out?
 *
 * The well marquee ("HI 66", or the theme name) and the card's Home button both
 * lived in the top-right corner of the well, and the marquee painted on top. So
 * the only exit besides Play again read as "HI 66 · × · HOME" stacked in a 44px
 * box — a smear, not a button. The marquee now steps aside while the card is up
 * and Home is a pill that says Home. This one buries a run on a phone, hit-tests
 * every part of the button to be sure nothing paints over it, does it again on a
 * named theme, then checks Home still goes home, the marquee comes back on the
 * title, and Play again, Share clip and Watch last are all still on the card.
 * Usage: node scripts/recap-exit-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

/** A phone, a player who knows the controls, and whatever they have on the board. */
const open = async (label, save = {}) => {
  await page?.context().close();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  await page.addInitScript(
    (s) => localStorage.setItem("stack-tetris-v1", s),
    JSON.stringify({
      version: 4,
      onboarded: true,
      tipSeen: true,
      played: true,
      mode: "marathon",
      ...save,
    }),
  );
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(600);
};

/** What the corner of the well is showing, and what a thumb would actually hit. */
const look = () =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent ?? "").trim(),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        px: Math.round(parseFloat(cs.fontSize)),
        gone:
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          parseFloat(cs.opacity) < 0.05 ||
          r.height < 1,
      };
    };
    const home = document.querySelector(".veil.is-polaroid .veil-x");
    const well = document.querySelector(".well");
    // A pill, so read inside the rounded ends: every one of these is thumb.
    const covered = [];
    // The marquee takes no taps, so a hit-test cannot see it. Measure the boxes.
    const sharing = [];
    if (home && well) {
      const r = home.getBoundingClientRect();
      const wr = well.getBoundingClientRect();
      for (const fy of [0.3, 0.5, 0.7])
        for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          const hit = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
          if (hit !== home && !home.contains(hit))
            covered.push(
              `${Math.round(fx * 100)}/${Math.round(fy * 100)}: ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : "nothing"}`,
            );
        }
      for (const el of well.querySelectorAll("*")) {
        if (el === home || el.contains(home) || home.contains(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05)
          continue;
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        // The pit and the card's own wash sit behind everything: not clutter.
        if (b.width > wr.width * 0.6 && b.height > wr.height * 0.6) continue;
        const ow = Math.round(Math.min(r.right, b.right) - Math.max(r.left, b.left));
        const oh = Math.round(Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
        if (ow > 1 && oh > 1)
          sharing.push(
            `${(el.className || el.tagName).toString().trim()} "${(el.textContent ?? "").trim().slice(0, 20)}" ${ow}x${oh}`,
          );
      }
    }
    return {
      phase: window.__controlsTest?.getPhase?.() ?? null,
      card: !!document.querySelector(".veil.is-polaroid"),
      home: box(".veil.is-polaroid .veil-x"),
      marquee: box(".marquee"),
      covered,
      sharing,
      again: box(".veil.is-polaroid .play-btn"),
      share: !!document.querySelector(".share-run"),
      watch: !!document.querySelector('[data-qa="watch-last-over"]'),
    };
  });

/** Stack straight up until the lid arrives, then let the card settle. */
const bury = async ({ start = true } = {}) => {
  if (start) {
    await page.locator('[data-qa="play"]').click({ force: true });
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
      timeout: 8000,
    });
    const skip = page.locator(".coach-skip");
    if (await skip.count()) await skip.click({ force: true });
  }
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(90);
    if (await page.evaluate(() => window.__controlsTest.getPhase() === "over")) break;
  }
  // The burial has a beat of its own: the wash, the coin flash, then the card.
  await page.waitForSelector(".veil.is-polaroid .veil-x", { timeout: 10000 });
  await page.waitForTimeout(700);
};

const results = {};

// A player with a score on the board, so the marquee has an HI to shout.
await open("hi", { high: 66 });
await bury();
results.hiCard = await look();

// Home is the way out, and the title keeps its marquee.
await page.locator(".veil.is-polaroid .veil-x").click({ force: true });
await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", {
  timeout: 6000,
});
await page.waitForTimeout(500);
results.afterHome = await look();

// A named theme puts words in the marquee instead of a number. Same corner.
await open("theme", { high: 66, theme: "blood", themes: ["ink", "blood"] });
await bury();
results.themeCard = await look();

// Play again is still the plain way back into a run.
await page.locator(".veil.is-polaroid .play-btn").click({ force: true });
await page.waitForTimeout(600);
results.playAgain = await look();

// And Watch last still runs the burial back instead of leaving the card up.
await bury({ start: false });
await page.locator('[data-qa="watch-last-over"]').click({ force: true });
await page.waitForTimeout(700);
results.watchLast = {
  ...(await look()),
  stop: !!(await page.locator(".watch-stop").count()),
};

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];

const exit = (r, where) => {
  if (!r.card) {
    fail.push(`${where}: no card came up, so nothing was read`);
    return;
  }
  if (!r.home) {
    fail.push(`${where}: the card has no way out but Play again`);
    return;
  }
  if (r.home.gone) fail.push(`${where}: Home is on the card but not showing`);
  if (!/^home$/i.test(r.home.text))
    fail.push(`${where}: the exit reads "${r.home.text}" where Home should be`);
  if (r.home.h < 44 || r.home.w < 44)
    fail.push(`${where}: Home is ${r.home.w}x${r.home.h}, smaller than a thumb`);
  if (r.home.px < 10) fail.push(`${where}: Home is set at ${r.home.px}px, too small to read`);
  if (r.marquee && !r.marquee.gone)
    fail.push(`${where}: the marquee is still up saying "${r.marquee.text}"`);
  if (r.sharing.length)
    fail.push(`${where}: something shares Home's box — ${r.sharing.join(" | ")}`);
  if (r.covered.length)
    fail.push(`${where}: something eats the tap on Home — ${r.covered.join(" | ")}`);
  if (r.home.x < 0 || r.home.x + r.home.w > 390)
    fail.push(`${where}: Home runs off the phone at x ${r.home.x}`);
  if (!r.again || r.again.gone) fail.push(`${where}: Play again is gone`);
  if (!r.share) fail.push(`${where}: no Share clip on the card`);
  if (!r.watch) fail.push(`${where}: no Watch last on the card`);
};

exit(results.hiCard, "with a high score up");
exit(results.themeCard, "on Blood Moon");

if (results.afterHome.phase !== "title") fail.push("Home no longer goes home");
if (results.afterHome.card) fail.push("Home left the card up");
if (!results.afterHome.marquee || results.afterHome.marquee.gone)
  fail.push("the title lost its marquee");
if (results.playAgain.phase !== "playing") fail.push("Play again no longer plays again");
if (results.watchLast.card) fail.push("Watch last left the card up");
if (!results.watchLast.stop) fail.push("Watch last no longer runs the replay back");

// A stored save always differs from what the server guessed, and every run here
// starts from one, so the hydration grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
