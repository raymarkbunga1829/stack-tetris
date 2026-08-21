#!/usr/bin/env node
/**
 * Does the first thing the coach asks for actually move a piece?
 *
 * A stranger's first coin puts one card on the screen, and card one used to
 * say "Finger on the well. Slide left or right." — one gesture, no fallback.
 * The well does slide, but it can go quietly dead: every touch on it is
 * captured, and a finger that gets away without an up leaves its stroke behind
 * for good. A leftover stroke reads as a second finger, the recogniser stops
 * emitting drag, and from then on the well ignores every slide while the pad
 * plays on. So the very first instruction was a bet.
 *
 * This one plays card one four ways — the pad arrows it now names, a slide on
 * the well, a slide on a well that is already holding a ghost finger, and the
 * arrow keys — and after each asks the only question that matters: did the
 * piece move, and did the card move on? Then it walks the rest of the deck to
 * the end, because rotate, Hold and Drop were never the ones lying.
 * Usage: node scripts/coach-slide-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];

/** A stranger on a phone: no save, no coach skipped, first coin of their life. */
const start = async (label) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForTimeout(700);
  const touch = await ctx.newCDPSession(page);
  return { ctx, page, touch };
};

const card = (page) =>
  page.evaluate(() => ({
    kicker: document.querySelector(".coach-kicker")?.textContent ?? null,
    title: document.querySelector(".coach-title")?.textContent ?? null,
    hint: document.querySelector(".coach-hint")?.textContent ?? null,
    x: window.__controlsTest.getX(),
    rot: window.__controlsTest.getRot(),
    hold: window.__controlsTest.getPiece?.() ?? null,
    score: window.__controlsTest.getScore(),
  }));

const wellBox = (page) =>
  page.evaluate(() => {
    const b = document.querySelector(".well").getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });

/** A thumb laid on the well and dragged sideways, one frame at a time. */
const slide = async (page, touch, span = 0.4) => {
  const b = await wellBox(page);
  const y = Math.round(b.y + b.h * 0.5);
  const x0 = b.x + b.w * 0.28;
  const at = (px) => [{ x: Math.round(px), y }];
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x0) });
  for (let i = 1; i <= 10; i++) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: at(x0 + (b.w * span * i) / 10),
    });
    await page.waitForTimeout(22);
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(180);
};

/** What card one asks of a player, done four ways. */
const taught = {
  "the pad arrows the card names": async (page) => {
    await page.locator('[data-qa="pad-right"]').tap();
    await page.waitForTimeout(180);
  },
  "a slide across the well": async (page, touch) => slide(page, touch),
  "a slide on a well holding a ghost finger": async (page, touch) => {
    // A touch the phone took for a system swipe: down, then never an up.
    const b = await wellBox(page);
    await page.evaluate(
      ([x, y]) => window.__controlsTest.feedGesture("down", 99, x, y, performance.now()),
      [Math.round(b.x + b.w * 0.5), Math.round(b.y + b.h * 0.5)],
    );
    await slide(page, touch);
  },
  "the left arrow key": async (page) => {
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(180);
  },
};

const results = {};

for (const [name, play] of Object.entries(taught)) {
  const { ctx, page, touch } = await start(name);
  const before = await card(page);
  await play(page, touch);
  const after = await card(page);
  results[name] = {
    said: before.hint,
    onCard: before.kicker,
    moved: after.x !== before.x,
    advanced: after.kicker !== before.kicker,
    nowOnCard: after.kicker,
    nowSays: after.title,
  };
  await ctx.close();
}

// A finger that lands and twitches has not slid anywhere. The card must wait.
{
  const { ctx, page, touch } = await start("twitch");
  const b = await wellBox(page);
  const before = await card(page);
  const y = Math.round(b.y + b.h * 0.5);
  const x = Math.round(b.x + b.w * 0.5);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 1, y }] });
  await page.waitForTimeout(60);
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 2, y }] });
  await page.waitForTimeout(160);
  const after = await card(page);
  results.twitch = { moved: after.x !== before.x, advanced: after.kicker !== before.kicker };
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await ctx.close();
}

// The rest of the deck: rotate, Hold, Drop, and out.
{
  const { ctx, page, touch } = await start("deck");
  const walk = [];
  await slide(page, touch);
  walk.push(await card(page));
  await page.locator('[data-qa="pad-cw"]').tap();
  await page.waitForTimeout(200);
  walk.push(await card(page));
  await page.locator('[data-qa="pad-hold"]').tap();
  await page.waitForTimeout(200);
  walk.push(await card(page));
  await page.locator('[data-qa="pad-hard"]').tap();
  await page.waitForTimeout(300);
  walk.push({
    ...(await card(page)),
    gone: await page.evaluate(() => !document.querySelector(".coach-card")),
  });
  results.deck = walk.map((c) => ({ onCard: c.kicker, says: c.title, gone: c.gone ?? false }));
  await ctx.close();
}

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];

for (const [name, r] of Object.entries(taught).map(([n]) => [n, results[n]])) {
  if (!r.moved) fail.push(`${name}: the piece did not move`);
  if (!r.advanced) fail.push(`${name}: the piece moved but card one stayed up`);
}

// Card one has to name a control the player can see, spelled the way the pad
// spells it, not only a gesture they have to guess at.
const said = results["a slide across the well"].said ?? "";
if (!said.includes("←") || !said.includes("→")) {
  fail.push(`card one does not name the pad arrows: "${said}"`);
}
if (!/well|stack/i.test(said)) fail.push(`card one no longer names the well: "${said}"`);

if (results.twitch.advanced && !results.twitch.moved) {
  fail.push("a twitch that moved nothing still ticked card one off");
}

const deck = results.deck;
if (deck[0]?.onCard !== "2 of 4") fail.push(`the slide did not reach card two: ${deck[0]?.onCard}`);
if (deck[1]?.onCard !== "3 of 4") fail.push(`rotate did not reach card three: ${deck[1]?.onCard}`);
if (deck[2]?.onCard !== "4 of 4") fail.push(`Hold did not reach card four: ${deck[2]?.onCard}`);
if (!deck[3]?.gone) fail.push("Drop did not put the coach away");

// A stored save always differs from what the server guessed, and every run here
// starts from one, so the hydration grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
