#!/usr/bin/env node
/**
 * When the wallet jumps, does the money say where it came from?
 *
 * Parks a piece the way a player does — the C key, then the Hold pad, then the
 * pocket itself — with the daily goal "Hold a piece" open in the book, and
 * reads what the well says while 50 CR lands: the goal has to name itself, call
 * itself a daily goal, and show the credits, all in one card a thumb cannot
 * miss. Then it checks the money is real and the swap still happened, that a
 * second park pays nothing twice, and that a book with no Hold goal in it pays
 * nothing at all.
 * Usage: node scripts/goal-paid-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

/** The real pool, so the book a probe writes is a book the game could deal. */
const HOLD = { kind: "hold", label: "Hold a piece", target: 1, reward: 50 };
const LINES = { kind: "lines", label: "Clear 25 lines", target: 25, reward: 50 };
const LEVEL = { kind: "level", label: "Reach level 8", target: 8, reward: 80 };

/** A player who knows the controls, 80 CR in pocket, today's goals open. */
const start = async (label, items = [HOLD, LINES, LEVEL]) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  await page.addInitScript((book) => {
    // The book is stamped with the shared Manila day or the game deals a new one.
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    localStorage.setItem(
      "stack-tetris-v1",
      JSON.stringify({
        version: 4,
        onboarded: true,
        tipSeen: true,
        mode: "marathon",
        credits: 80,
        missions: {
          date,
          items: book.map((m) => ({ ...m, id: `${date}-${m.kind}`, progress: 0, done: false })),
        },
      }),
    );
  }, items);
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 6000,
  });
  await page.waitForTimeout(450);
};

/** The wallet, the pocket, and whatever the well is saying about either. */
const look = () =>
  page.evaluate(() => {
    const card = document.querySelector(".banner.is-goal");
    const plain = document.querySelector(".banner:not(.is-goal)");
    const parked = document.querySelector(".pocket-hold .mini:not(.empty)");
    const well = document.querySelector(".well");
    const inside = (el) => {
      if (!el || !well) return null;
      const a = el.getBoundingClientRect();
      const b = well.getBoundingClientRect();
      return {
        spill: Math.round(Math.max(b.left - a.left, a.right - b.right)),
        top: Math.round(a.top - b.top),
        wrap: el.scrollWidth - el.clientWidth,
      };
    };
    return {
      phase: window.__controlsTest.getPhase(),
      credits: window.__controlsTest.getCredits(),
      cr: document.querySelector('[data-qa="hud-cr"] b')?.textContent?.trim() ?? null,
      piece: window.__controlsTest.getPiece(),
      parked: parked?.getAttribute("aria-label") ?? null,
      card: card
        ? {
            name: card.querySelector("b")?.textContent?.trim() ?? "",
            why: card.querySelector("em")?.textContent?.trim() ?? "",
            live: card.getAttribute("aria-live"),
            fit: inside(card),
          }
        : null,
      plain: plain?.textContent?.trim() ?? null,
    };
  });

/** The goals as the player reads them back in the cabinet. */
const book = async () => {
  await page.locator(".hud-pause").click({ force: true });
  await page.waitForTimeout(200);
  await page.locator('[data-qa="pause-modes"]').click({ force: true });
  await page.waitForTimeout(300);
  return page.evaluate(() =>
    [...document.querySelectorAll(".missions li")].map((li) => ({
      label: li.querySelector("span")?.textContent?.trim() ?? "",
      pays: li.querySelector("em")?.textContent?.trim() ?? null,
      state: li.querySelector("b")?.textContent?.trim() ?? "",
      done: li.classList.contains("is-done"),
    })),
  );
};

const park = {
  /** C, held for a frame the way a finger holds it. */
  key: async () => {
    await page.keyboard.down("KeyC");
    await page.waitForTimeout(60);
    await page.keyboard.up("KeyC");
  },
  /** The Hold pad under a thumb. */
  pad: async () => {
    await page
      .locator('[data-qa="pad-hold"]')
      .dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true, bubbles: true });
  },
  /** The pocket itself, which is also a button. */
  pocket: async () => {
    await page
      .locator(".pocket-hold")
      .dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true, bubbles: true });
  },
};

/** One park, read on the frame it pays and again once the card has had its say. */
const parkOnce = async (how) => {
  const before = await look();
  await how();
  await page.waitForTimeout(220);
  const paid = await look();
  return { before, paid };
};

const results = {};

// The C key: 80 CR in pocket, the goal open, the piece about to be parked.
await start("keys");
results.keys = await parkOnce(park.key);
// The card is a beat, not a sign: it clears itself and the money stays.
await page.waitForTimeout(2600);
results.keysLater = await look();
// A second park is not a second payday.
await page.waitForTimeout(1400);
results.keysAgain = (await parkOnce(park.key)).paid;
results.keysBook = await book();

// The same park under a thumb, on the pad.
await start("pad");
results.pad = await parkOnce(park.pad);

// And on the pocket, which is where a first-run player reaches.
await start("pocket");
results.pocket = await parkOnce(park.pocket);

// A book with no Hold goal in it: the swap still happens, the wallet does not move.
await start("no-goal", [
  LINES,
  LEVEL,
  { ...HOLD, kind: "sprint", label: "Finish a Sprint 40", target: 1, reward: 70 },
]);
results.noGoal = await parkOnce(park.key);

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];

const paidWell = ({ before, paid }, where) => {
  if (before.card) fail.push(`${where}: a goal card was already up before the park`);
  if (before.credits !== 80) fail.push(`${where}: the run did not open on 80 CR`);
  if (paid.plain === "+50 CR") fail.push(`${where}: the bare credit toast is still firing`);
  if (!paid.card) {
    fail.push(`${where}: 50 CR landed with nothing on screen to explain it`);
    return;
  }
  if (paid.card.name !== "Hold a piece")
    fail.push(`${where}: the card says "${paid.card.name}", not the goal that paid`);
  if (!/daily goal/i.test(paid.card.why))
    fail.push(`${where}: nothing calls it a daily goal, so it still reads as free money`);
  if (!paid.card.why.includes("50 CR"))
    fail.push(`${where}: the card does not show the 50 CR it just paid`);
  if (paid.card.live !== "polite") fail.push(`${where}: the payout is silent to a screen reader`);
  if (paid.card.fit.spill > 1) fail.push(`${where}: the card runs past the well`);
  if (paid.card.fit.wrap > 1) fail.push(`${where}: the goal name is cut off`);
  if (paid.card.fit.top < 0) fail.push(`${where}: the card sits above the well`);
  if (paid.credits !== 130) fail.push(`${where}: the wallet holds ${paid.credits}, not 130`);
  if (paid.cr !== "130") fail.push(`${where}: the strip reads ${paid.cr} after the payout`);
  if (!paid.parked) fail.push(`${where}: Hold no longer parks a piece`);
  if (paid.parked && paid.piece === before.piece)
    fail.push(`${where}: the piece in play never swapped`);
  if (paid.phase !== "playing") fail.push(`${where}: the park ended the run`);
};

paidWell(results.keys, "C");
paidWell(results.pad, "the Hold pad");
paidWell(results.pocket, "the pocket");

if (results.keysLater.card) fail.push("the goal card never leaves the well");
if (results.keysLater.credits !== 130) fail.push("the 50 CR did not stick");
if (results.keysAgain.card) fail.push("a second park pays the same goal twice");
if (results.keysAgain.credits !== 130) fail.push("a second park moved the wallet again");

const hold = results.keysBook.find((m) => m.label === "Hold a piece");
if (!hold) fail.push("the cabinet does not list the goal that paid");
else {
  if (!hold.done) fail.push("the paid goal is not marked done in the book");
  if (!hold.pays || !hold.pays.includes("50 CR"))
    fail.push("the book still hides what the goal pays");
}

if (!results.noGoal.paid.parked) fail.push("with no Hold goal open, Hold stopped parking pieces");
if (results.noGoal.paid.card) fail.push("a goal nobody was given still names itself");
if (results.noGoal.paid.credits !== 80) fail.push("a goal nobody was given still paid out");

// A stored save always differs from what the server guessed, so the hydration
// grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
