#!/usr/bin/env node
/**
 * Does the Drop pad stay under the thumb while a piece locks?
 *
 * Hard drop is the one pad button that must never miss, and twice on the live
 * PWA a tap went nowhere. The slam flash used to restart by remounting the
 * button, so React threw the node away on the frame a piece landed — and a
 * phone aims a touch before it delivers it, so a finger already pointed at the
 * old node lands on nothing. So this one keeps a single grip on the pad the way
 * a thumb does, mashes it through a dozen locks, and asks after every tap
 * whether the piece actually slammed. Then it fires the tap a phone had already
 * aimed, at the node it aimed at, across a lock the keyboard caused. Space is
 * the control: it never went through the pad, and it has to keep working.
 * Usage: node scripts/drop-tap-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

/** A player who already knows the controls, on a phone, in Marathon. */
const start = async (label) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  await page.addInitScript(
    (s) => localStorage.setItem("stack-tetris-v1", s),
    JSON.stringify({ version: 4, onboarded: true, tipSeen: true, a2hs: true, mode: "marathon" }),
  );
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 6000,
  });
  const skip = page.locator(".coach-skip");
  if (await skip.count()) await skip.click({ force: true });
  await page.waitForTimeout(400);
};

/** Count every time the pad hands the Drop button a different node. */
const watchPad = () =>
  page.evaluate(() => {
    const seen = document.querySelector('[data-qa="pad-hard"]');
    window.__pad = { swaps: 0, node: seen, started: !!seen };
    const act = document.querySelector(".pad-act");
    if (!act) return;
    new MutationObserver(() => {
      const now = document.querySelector('[data-qa="pad-hard"]');
      if (now === window.__pad.node) return;
      window.__pad.swaps += 1;
      window.__pad.node = now;
    }).observe(act, { childList: true, subtree: true });
  });

const padChurn = () => page.evaluate(() => ({ swaps: window.__pad.swaps, gone: !window.__pad.node }));

const look = () =>
  page.evaluate(() => ({
    phase: window.__controlsTest.getPhase(),
    score: window.__controlsTest.getScore(),
  }));

/**
 * Spread the next piece across the well so a dozen slams have somewhere to go.
 * A hard drop that falls nowhere scores nothing, and this probe reads the score
 * to know a tap landed.
 */
const spread = (i) =>
  page.evaluate((n) => {
    const t = window.__controlsTest;
    const steps = (n % 5) - 2;
    for (let k = 0; k < Math.abs(steps); k++) (steps < 0 ? t.tapLeft : t.tapRight)();
  }, i);

/**
 * A dozen slams, and after each one: did the piece move, and did the button
 * survive being tapped? The grip is taken once, like a thumb that never lifts
 * off the pad, so a button React replaced mid-run is a tap that goes nowhere.
 */
const mash = async (slam, count = 12) => {
  const taps = [];
  for (let i = 0; i < count; i++) {
    await spread(i);
    const before = await look();
    if (before.phase !== "playing") break;
    let threw = null;
    try {
      await slam();
    } catch (e) {
      threw = e.message.split("\n")[0];
    }
    await page.waitForTimeout(110);
    const after = await look();
    taps.push({ threw, slammed: after.score > before.score, phase: after.phase });
  }
  return { taps, ...(await padChurn()) };
};

const results = {};

// One grip on the Drop pad, mashed through the locks it causes.
await start("pad");
await watchPad();
const grip = await page.$('[data-qa="pad-hard"]');
results.pad = await mash(() => grip.tap());

// The same mashing on Space, which never touched the pad and must not change.
await start("keys");
await watchPad();
results.keys = await mash(async () => {
  await page.keyboard.down("Space");
  await page.waitForTimeout(30);
  await page.keyboard.up("Space");
});

/**
 * The swallow itself. A phone hit-tests a touch on one thread and delivers it
 * on another, so the pointerdown arrives at the node the screen was showing
 * when the finger landed — not whatever React put there in between. Space locks
 * the piece here, so the pad is the only thing on trial.
 */
await start("queued");
await watchPad();
results.queued = await page.evaluate(async () => {
  const t = window.__controlsTest;
  const aimed = document.querySelector('[data-qa="pad-hard"]');
  const before = t.getScore();
  t.setKeys(["Space"]);
  await new Promise((r) => setTimeout(r, 30));
  t.setKeys([]);
  await new Promise((r) => setTimeout(r, 90));
  const locked = t.getScore();
  const live = document.querySelector('[data-qa="pad-hard"]');
  aimed.dispatchEvent(
    new PointerEvent("pointerdown", { pointerId: 7, isPrimary: true, bubbles: true, cancelable: true }),
  );
  await new Promise((r) => setTimeout(r, 140));
  return {
    replaced: live !== aimed,
    attached: aimed.isConnected,
    slammed: t.getScore() > locked,
    before,
    locked,
    after: t.getScore(),
    phase: t.getPhase(),
  };
});

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];

const everyTapSlams = (r, where) => {
  if (!r.taps.length) {
    fail.push(`${where}: nothing was tapped, so nothing was tested`);
    return;
  }
  if (r.taps.length < 12) fail.push(`${where}: the run ended after ${r.taps.length} slams`);
  const lost = r.taps.filter((t) => t.threw);
  if (lost.length)
    fail.push(`${where}: ${lost.length} of ${r.taps.length} taps hit nothing — ${lost[0].threw}`);
  const quiet = r.taps.filter((t) => !t.threw && !t.slammed);
  if (quiet.length)
    fail.push(`${where}: ${quiet.length} of ${r.taps.length} slams did not move the piece`);
};

everyTapSlams(results.pad, "mashing the Drop pad");
everyTapSlams(results.keys, "mashing Space");

if (results.pad.gone) fail.push("the Drop pad left the cabinet mid-run");
if (results.pad.swaps)
  fail.push(`the Drop button was replaced ${results.pad.swaps} times while being tapped`);
if (results.keys.swaps)
  fail.push(`locking with Space replaced the Drop button ${results.keys.swaps} times`);

if (results.queued.replaced)
  fail.push("a lock swapped the Drop node the phone had already aimed a touch at");
if (!results.queued.attached) fail.push("the Drop node a touch was aimed at is no longer in the page");
if (!results.queued.slammed)
  fail.push("a tap that landed during a lock was swallowed — the next piece did not slam");

// A stored save always differs from what the server guessed, and every run here
// starts from one, so the hydration grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
