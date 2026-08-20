#!/usr/bin/env node
/**
 * Read the power bar on a phone. Does each pad say what it is?
 *
 * The glyphs were the whole story at 390px: the empty pads at least wore a
 * price, but an owned Zap read as the number 1 and nothing else, so a first-run
 * player had five lit squares and a guessing game. Desktop had the names the
 * whole time. So this one reads the bar the way a player does — the name it
 * paints, not the aria-label underneath it — at phone width, at the narrowest
 * phone we care about, in landscape, and on a desktop it must not regress. Then
 * it checks the bar stayed a pad: inside the cabinet, off the well, tappable.
 * Usage: node scripts/power-name-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

const NAMES = {
  zap: "Zap",
  slow: "Slow",
  shield: "Shield",
  quake: "Quake",
  pick: "Pick",
};

const PRICE = { shield: "70CR", quake: "90CR" };

/** A first-run player: coach behind them, 80 CR, Zap and Slow and Pick in hand. */
const start = async (label, viewport) => {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: viewport.width < 900,
    isMobile: viewport.width < 900,
  });
  page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem(
      "stack-tetris-v1",
      JSON.stringify({
        version: 4,
        onboarded: true,
        tipSeen: true,
        a2hs: true,
        mode: "marathon",
        credits: 80,
        inv: { zap: 1, slow: 1, shield: 0, quake: 0, pick: 1 },
      }),
    );
  });
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

/** What the bar says, and whether it says it on screen or only to a reader. */
const read = () =>
  page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    };
    const bar = document.querySelector(".powers");
    const cab = document.querySelector(".cabinet");
    const well = document.querySelector(".well");
    return {
      bar: bar ? box(bar) : null,
      cabinet: cab ? { ...box(cab), spill: cab.scrollHeight - cab.clientHeight } : null,
      well: well ? box(well) : null,
      pads: [...document.querySelectorAll(".pwr")].map((el) => {
        const span = el.querySelector("span");
        const cs = span ? getComputedStyle(span) : null;
        return {
          id: el.dataset.qa?.replace("pwr-", "") ?? null,
          pad: box(el),
          // The painted name: hidden, clipped to nothing, or actually readable.
          name: span?.textContent?.trim() ?? null,
          shown: cs
            ? cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.5
            : false,
          nameBox: span ? box(span) : null,
          ink: cs ? Math.round(parseFloat(cs.fontSize) * 100) / 100 : null,
          tell: el.querySelector("b")?.textContent?.trim() ?? null,
          spill: el.scrollWidth - el.clientWidth,
        };
      }),
    };
  });

const results = {};
results.phone = { size: "390x844" };
await start("phone", { width: 390, height: 844 });
results.phone.bar = await read();

// The narrowest phone still in the wild, where the pad has the least to give.
await start("narrow", { width: 320, height: 844 });
results.narrow = await read();

// Sideways, where the bar lives in a column beside the well instead of under it.
await start("landscape", { width: 844, height: 390 });
results.landscape = await read();

// And the width that already worked, which must keep working.
await start("desktop", { width: 1280, height: 900 });
results.desktop = await read();

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];
const ids = Object.keys(NAMES);

const namesThePowers = (r, where) => {
  if (!r.bar) {
    fail.push(`${where}: there is no power bar on the page`);
    return;
  }
  for (const id of ids) {
    const pad = r.pads.find((p) => p.id === id);
    if (!pad) {
      fail.push(`${where}: the bar has no ${NAMES[id]} pad`);
      continue;
    }
    if (pad.name !== NAMES[id]) {
      fail.push(`${where}: the ${id} pad reads "${pad.name}" instead of ${NAMES[id]}`);
      continue;
    }
    if (!pad.shown || !pad.nameBox?.w) {
      fail.push(`${where}: ${NAMES[id]} is on the pad but not on the screen — only the glyph shows`);
      continue;
    }
    if (pad.ink < 8) fail.push(`${where}: ${NAMES[id]} is set at ${pad.ink}px, too small to read`);
    // A name that runs past its own pad is not a name, it is a smear.
    if (pad.nameBox.w > pad.pad.w || pad.spill > 0)
      fail.push(`${where}: ${NAMES[id]} is ${pad.nameBox.w}px wide on a ${pad.pad.w}px pad`);
    if (pad.pad.h < 28) fail.push(`${where}: the ${id} pad shrank to ${pad.pad.h}px tall to fit`);
  }
  // The empty ones still have to sell themselves.
  for (const [id, price] of Object.entries(PRICE)) {
    const pad = r.pads.find((p) => p.id === id);
    if (pad?.tell !== price)
      fail.push(`${where}: empty ${NAMES[id]} shows "${pad?.tell}" instead of ${price}`);
  }
  // And the owned ones keep the count that says how many are left.
  for (const id of ["zap", "slow", "pick"]) {
    const pad = r.pads.find((p) => p.id === id);
    if (pad?.tell !== "1") fail.push(`${where}: owned ${NAMES[id]} lost its count`);
  }
};

const staysAPad = (r, where) => {
  if (!r.bar || !r.cabinet || !r.well) return;
  if (r.cabinet.spill > 0)
    fail.push(`${where}: the cabinet scrolls by ${r.cabinet.spill}px — the bar pushed it open`);
  if (r.bar.bottom > r.cabinet.bottom || r.bar.right > r.cabinet.right)
    fail.push(`${where}: the bar hangs off the cabinet`);
  const over = Math.min(r.bar.bottom, r.well.bottom) - Math.max(r.bar.y, r.well.y);
  const beside = Math.min(r.bar.right, r.well.right) - Math.max(r.bar.x, r.well.x);
  if (over > 0 && beside > 0) fail.push(`${where}: the bar sits on the well by ${over}px`);
  if (r.bar.h > 72) fail.push(`${where}: the bar grew to ${r.bar.h}px — that is a spreadsheet`);
};

namesThePowers(results.phone.bar, "at 390px");
staysAPad(results.phone.bar, "at 390px");
namesThePowers(results.narrow, "at 320px");
staysAPad(results.narrow, "at 320px");
namesThePowers(results.landscape, "sideways");
staysAPad(results.landscape, "sideways");
namesThePowers(results.desktop, "on desktop");
staysAPad(results.desktop, "on desktop");

// A stored save always differs from what the server guessed, so the hydration
// grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
