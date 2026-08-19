#!/usr/bin/env node
/**
 * Can a first-run player read the strip while the well is falling?
 *
 * Reads the HUD on a 390px phone the way a player does — a word for every
 * number, the pocket in view, nothing shoved into the well — then checks the
 * counters each mode swaps in, and buys a Shield to watch the credits move.
 * Usage: node scripts/hud-read-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

const start = async (label, save, viewport = { width: 390, height: 844 }) => {
  const ctx = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  if (save) {
    await page.addInitScript(
      (s) => localStorage.setItem("stack-tetris-v1", s),
      JSON.stringify(save),
    );
  }
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 6000,
  });
  const skip = page.locator(".coach-skip");
  if (await skip.count()) await skip.click({ force: true });
  await page.waitForTimeout(250);
};

/** Every cell as a player sees it, plus the room the strip takes. */
const strip = () =>
  page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    const hud = document.querySelector(".hud");
    const doc = document.documentElement;
    const cells = [...document.querySelectorAll(".hud-cell")];
    const rect = (el) => el.getBoundingClientRect();
    const pause = document.querySelector(".hud-pause");
    // A cell that gives up room does not shrink, it prints over its neighbour,
    // so the boxes have to be measured and not just the row.
    let lean = 0;
    for (let i = 1; i < cells.length; i++) {
      lean = Math.max(lean, Math.round(rect(cells[i - 1]).right - rect(cells[i]).left));
    }
    const cut = [...document.querySelectorAll(".hud-cell b, .hud-cell span")].reduce(
      (worst, el) => Math.max(worst, el.scrollWidth - el.clientWidth),
      0,
    );
    return {
      cells: cells.map((el) => ({
        label: el.querySelector("span")?.textContent?.trim() ?? "",
        value: el.querySelector("b")?.textContent?.trim() ?? "",
      })),
      // Hidden by a media query still has text, so ask whether it is on screen.
      mode:
        [...document.querySelectorAll(".hud em")]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.textContent.trim())[0] ?? null,
      pause: pause?.textContent?.trim() ?? null,
      hud: box(hud),
      well: box(document.querySelector(".well")),
      spill: hud ? hud.scrollWidth - hud.clientWidth : null,
      pageSpill: doc.scrollWidth - doc.clientWidth,
      lean,
      cut,
      pauseOut: pause ? Math.round(rect(pause).right - rect(hud).right) : null,
      bag: document.querySelector(".bag-strip b")?.textContent?.trim() ?? null,
    };
  });

/** Six figures on the board and a four-figure pocket: the widest the strip gets. */
const fatten = () =>
  page.evaluate(() => {
    const fat = { Score: "999,999", Lines: "999", "Lines left": "999", Credits: "9,999" };
    document.querySelectorAll(".hud-cell").forEach((el) => {
      const word = el.querySelector("span")?.textContent?.trim();
      const value = fat[word];
      if (value) el.querySelector("b").textContent = value;
    });
  });

const credits = () => page.evaluate(() => window.__controlsTest.getCredits());

const results = {};

// A first run: Marathon, 80 CR in pocket, powers on the bar wearing prices.
await start("first-run");
results.marathon = await strip();
results.marathonCredits = await credits();

// The strip stays readable behind the pause card.
await page.locator(".hud-pause").click({ force: true });
await page.waitForTimeout(200);
results.paused = await strip();
await page.locator(".pause-card .play-btn").click({ force: true });
await page.waitForTimeout(200);

// Buying a Shield off the bar is the whole point of showing CR: 80 goes to 10.
await page.locator('[data-qa="pwr-shield"]').click({ force: true });
await page.waitForTimeout(350);
results.afterShield = {
  cr: (await page.locator('[data-qa="hud-cr"] b').textContent()).trim(),
  credits: await credits(),
  shopOpen: (await page.locator(".shop").count()) > 0,
};

// Blitz carries a clock, a wallet and the longest nameplate in the cabinet.
await start("blitz", { version: 4, onboarded: true, mode: "blitz", credits: 2500 });
results.blitz = await strip();
await fatten();
results.blitzFat = await strip();

// Sprint counts down to 40 and has no powers, so no wallet in the strip.
await start("sprint", { version: 4, onboarded: true, mode: "sprint", sprintBest: 62.4 });
results.sprint = await strip();
results.sprintPace = await page
  .locator(".hud small")
  .textContent()
  .catch(() => null);

// Finesse grades twenty pieces instead of counting lines.
await start("finesse", { version: 4, onboarded: true, mode: "finesse" });
results.finesse = await strip();

// An old 320px phone with everything at once: the numbers keep the room and
// the nameplate is what gives.
await start(
  "small",
  { version: 4, onboarded: true, mode: "blitz", credits: 9999 },
  { width: 320, height: 568 },
);
await fatten();
results.small = await strip();

console.log(JSON.stringify({ ...results, errors }, null, 2));

const labels = (r) => r.cells.map((c) => c.label);
const fail = [];
const named = (r, where) => {
  for (const c of r.cells) {
    if (!c.label) fail.push(`${where}: a number sits in the strip with no word for it`);
    if (!c.value) fail.push(`${where}: ${c.label} has a word but no number`);
  }
};
const fits = (r, where, pit = 620) => {
  if (r.spill > 1) fail.push(`${where}: the strip runs past the cabinet`);
  if (r.pageSpill > 1) fail.push(`${where}: the page scrolls sideways`);
  if (r.lean > 0) fail.push(`${where}: two cells print over each other`);
  if (r.cut > 0) fail.push(`${where}: a number is cut off mid-digit`);
  if (r.pauseOut > 1) fail.push(`${where}: Pause is pushed out of the strip`);
  if (r.hud.bottom > r.well.top) fail.push(`${where}: the strip sits on the well`);
  if (r.hud.h > 46) fail.push(`${where}: the strip is a panel, not a slim bar`);
  if (r.well.h < pit) fail.push(`${where}: the strip ate the pit (${r.well.h}px well)`);
};

named(results.marathon, "Marathon");
fits(results.marathon, "Marathon");
if (labels(results.marathon).join("/") !== "Score/Level/Lines/Credits")
  fail.push(`Marathon reads ${labels(results.marathon).join(" ")}`);
if (results.marathon.cells[3]?.value !== String(results.marathonCredits))
  fail.push("the strip and the save disagree about credits");
if (results.marathon.mode !== "Marathon") fail.push("the mode lost its nameplate");
if (results.marathon.bag !== "13in bag") fail.push("the count under Next is still a bare number");

if (labels(results.paused).join("/") !== "Score/Level/Lines/Credits")
  fail.push("the strip goes unreadable while paused");
if (results.paused.pause !== "Paused") fail.push("pause stopped saying it is paused");

if (results.afterShield.credits !== 10) fail.push("the Shield did not cost 70 CR");
if (results.afterShield.cr !== "10") fail.push("the strip did not follow the spend");
if (results.afterShield.shopOpen) fail.push("buying off the bar opened the Store");

named(results.blitz, "Blitz");
fits(results.blitz, "Blitz");
if (labels(results.blitz).join("/") !== "Score/Time/Lines/Credits")
  fail.push(`Blitz reads ${labels(results.blitz).join(" ")}`);
if (!/^\d:\d\d$/.test(results.blitz.cells[1]?.value ?? ""))
  fail.push("the Blitz clock is not a clock");
fits(results.blitzFat, "Blitz at 999,999");

named(results.sprint, "Sprint");
fits(results.sprint, "Sprint");
if (labels(results.sprint).join("/") !== "Score/Time/Lines left")
  fail.push(`Sprint reads ${labels(results.sprint).join(" ")}`);
if (results.sprint.cells[2]?.value !== "40") fail.push("Sprint does not open on forty lines");
if (!results.sprintPace) fail.push("Sprint lost its pace against the PB");

named(results.finesse, "Finesse");
fits(results.finesse, "Finesse");
if (labels(results.finesse).join("/") !== "Score/Pieces/Clean")
  fail.push(`Finesse reads ${labels(results.finesse).join(" ")}`);
if (!results.finesse.cells[1]?.value.endsWith("/20"))
  fail.push("Finesse does not count out of twenty");

named(results.small, "320px");
fits(results.small, "320px", 340);
if (labels(results.small).join("/") !== "Score/Time/Lines/Credits")
  fail.push(`a 320px phone reads ${labels(results.small).join(" ")}`);
if (results.small.mode) fail.push("a 320px phone keeps the nameplate over the numbers");
if (results.small.pause !== "Pause") fail.push("a 320px phone loses the Pause button");

// A stored save always differs from what the server guessed, so only the first run must be clean.
const firstRunErrors = errors.filter((e) => e.startsWith("first-run:"));
if (firstRunErrors.length) fail.push(`first-run page errors: ${firstRunErrors.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
