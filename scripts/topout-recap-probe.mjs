#!/usr/bin/env node
/**
 * Does the player get to see the death they just earned?
 *
 * Slams pieces into the lid the way a player does — Drop held down, Drop
 * spammed, on the keyboard and on the pad — and watches the whole beat: the
 * red "Topped out" wash, the coin flash, then the card with the epitaph and
 * the cause. The slam that buries the stack must not pay for the next run,
 * and the card must still take a coin once it has been up long enough to read.
 * Usage: node scripts/topout-recap-probe.mjs [url]
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
    JSON.stringify({ version: 4, onboarded: true, mode: "marathon", tipSeen: true }),
  );
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 6000,
  });
  await page.waitForTimeout(400);
};

const look = () =>
  page.evaluate(() => ({
    phase: window.__controlsTest.getPhase(),
    score: window.__controlsTest.getScore(),
    wash: !!document.querySelector(".banner.is-topout"),
    coin: (document.querySelector(".veil-kicker")?.textContent ?? "").includes("Insert coin"),
    card: !!document.querySelector(".veil.is-polaroid"),
    epitaph: document.querySelector(".veil.is-polaroid .veil-kicker")?.textContent ?? null,
    cause: document.querySelector(".veil-hint.is-cause")?.textContent ?? null,
    shown: document.querySelector(".veil.is-polaroid .veil-title")?.textContent ?? null,
    share: !!document.querySelector(".share-run"),
    watch: !!document.querySelector('[data-qa="watch-last-over"]'),
  }));

const drop = {
  /** Space, down and up, the way a thumb on a keyboard does it. */
  keys: async (hold = 40) => {
    await page.keyboard.down("Space");
    await page.waitForTimeout(hold);
    await page.keyboard.up("Space");
  },
  /** The Drop pad, which fires the moment the finger lands. */
  pad: async () => {
    await page
      .locator('[data-qa="pad-hard"]')
      .dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true, bubbles: true });
  },
};

/** Stack straight up with no sideways help: the lid comes for you in a dozen pieces. */
const bury = async (slam, gap = 90) => {
  for (let i = 0; i < 60; i++) {
    await slam();
    await page.waitForTimeout(gap);
    const seen = await look();
    if (seen.phase === "over") return seen;
  }
  return null;
};

/** Keep slamming through the death, then read what the cabinet ended up showing. */
const slamThrough = async (slam, gap = 90) => {
  let sawWash = false;
  let sawCoin = false;
  let restarted = false;
  for (let i = 0; i < 30; i++) {
    await slam();
    await page.waitForTimeout(gap);
    const seen = await look();
    if (seen.wash) sawWash = true;
    if (seen.coin) sawCoin = true;
    if (seen.phase === "playing") restarted = true;
    if (seen.card) break;
  }
  return { ...(await look()), sawWash, sawCoin, restarted };
};

const results = {};

// A run buried on the keyboard, with the player still hammering Space.
await start("keys");
results.keysDeath = await bury(drop.keys);
results.keysAfter = await slamThrough(drop.keys);
// The card is up and has been readable for a beat: now Space is a coin again.
await page.waitForTimeout(600);
await drop.keys();
await page.waitForTimeout(400);
results.keysAgain = await look();

// The same burial on the Drop pad, spammed the way a thumb spams it.
await start("pad");
results.padDeath = await bury(drop.pad, 110);
results.padAfter = await slamThrough(drop.pad, 110);
await page.waitForTimeout(600);
await drop.pad();
await page.waitForTimeout(400);
results.padAgain = await look();

// Holding Drop down across the whole death must not eat the card either.
await start("held");
results.heldDeath = await bury(drop.keys);
await page.keyboard.down("Space");
await page.waitForTimeout(2600);
results.heldAfter = await look();
await page.keyboard.up("Space");

// Play again is still the plain way off the card.
const again = page.locator(".veil.is-polaroid .play-btn");
if (await again.count()) {
  await again.click({ force: true });
  await page.waitForTimeout(500);
}
results.playAgain = await look();

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];
const buried = (death, where) => {
  if (!death) {
    fail.push(`${where}: the well never buried the stack, so nothing was tested`);
    return;
  }
  if (!death.wash) fail.push(`${where}: the burial never said it topped out`);
  if (death.score <= 0) fail.push(`${where}: the run died with nothing to show`);
};
const carded = (after, death, where) => {
  if (!death) return;
  if (after.restarted) fail.push(`${where}: the slam that buried the run started the next one`);
  if (!after.card) fail.push(`${where}: the run ended with no card`);
  if (!after.sawCoin) fail.push(`${where}: the coin flash between the wash and the card is gone`);
  if (!after.epitaph) fail.push(`${where}: the card does not name the run`);
  if (!after.cause) fail.push(`${where}: the card does not say the stack reached the top`);
  if (after.shown !== death.score.toLocaleString())
    fail.push(`${where}: the card shows ${after.shown}, not the ${death.score} that was played`);
  if (!after.share) fail.push(`${where}: no Share clip on the card`);
  if (!after.watch) fail.push(`${where}: no Watch last on the card`);
};

buried(results.keysDeath, "Space");
carded(results.keysAfter, results.keysDeath, "Space");
if (results.keysAgain.phase !== "playing")
  fail.push("Space will not start the next run once the card is up");

buried(results.padDeath, "the Drop pad");
carded(results.padAfter, results.padDeath, "the Drop pad");
if (results.padAgain.phase !== "playing")
  fail.push("the Drop pad will not start the next run once the card is up");

buried(results.heldDeath, "a held Drop");
if (results.heldAfter.phase !== "over")
  fail.push("a held Drop starts the next run over the card");
if (!results.heldAfter.card) fail.push("a held Drop ate the card");

if (results.playAgain.phase !== "playing") fail.push("Play again no longer plays again");

// A stored save always differs from what the server guessed, and every run here
// starts from one, so the hydration grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
