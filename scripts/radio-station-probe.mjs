#!/usr/bin/env node
/**
 * Can a player pick what the cabinet plays?
 *
 * Reads the notes the music bus actually starts, so "I picked Redline" has to
 * show up as different pitches coming out of the well — not just a lit button.
 * Also checks Auto is where an old save wakes up, and that a pick survives a
 * reload.
 * Usage: node scripts/radio-station-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=document-user-activation-required",
  ],
});

/** Every pitch an oscillator is given, in order. The bed is the only thing humming in a quiet window. */
const probe = () => {
  window.__radio = { notes: [] };
  const Real = window.AudioContext || window.webkitAudioContext;
  const Patched = function (...args) {
    const ctx = new Real(...args);
    const make = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const osc = make();
      const set = osc.frequency.setValueAtTime.bind(osc.frequency);
      osc.frequency.setValueAtTime = (v, t) => {
        window.__radio.notes.push(Math.round(v));
        return set(v, t);
      };
      return osc;
    };
    return ctx;
  };
  Patched.prototype = Real.prototype;
  window.AudioContext = Patched;
  window.webkitAudioContext = Patched;
};

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(probe);
// Seeded once, not on every load: the reload has to read back what the player picked.
await context.addInitScript((s) => {
  if (!localStorage.getItem("stack-tetris-v1")) localStorage.setItem("stack-tetris-v1", s);
}, JSON.stringify({ version: 4, onboarded: true, played: true, tipSeen: true }));

const errors = [];
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));

const open = async () => {
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(600);
};

/** Let the bed run with nobody touching the pad, then read what it played. */
const listen = async (ms = 1400) => {
  await page.evaluate(() => {
    window.__radio.notes = [];
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__radio.notes.slice());
};

/** Settings is in the footer at the title and behind the pause card mid-run. */
const openSettings = async () => {
  const foot = page.locator('footer.foot button[aria-label="Settings"]');
  if (await foot.isVisible()) {
    await foot.click({ force: true });
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.locator('[data-qa="pause-settings"]').click({ force: true });
  }
  await page.waitForTimeout(250);
};

const lit = (id) =>
  page.locator(`[data-qa="station-${id}"]`).evaluate((el) => el.className.includes("is-on"));

const results = {};

await open();
await page.locator('[data-qa="play"]').click({ force: true });
await page.waitForTimeout(1200);
results.autoNotes = await listen();

await openSettings();
results.namedStations = await page
  .locator("[data-qa='radio-auto'] button, [data-qa='radio-now'] button, [data-qa='radio-cabinet'] button")
  .evaluateAll((els) => els.map((e) => e.textContent.trim()));
results.nowShelf = await page
  .locator("[data-qa='radio-now'] button")
  .evaluateAll((els) => els.map((e) => e.textContent.trim()));
results.cabinetShelf = await page
  .locator("[data-qa='radio-cabinet'] button")
  .evaluateAll((els) => els.map((e) => e.textContent.trim()));
results.shelfLabels = await page
  .locator("[data-qa='radio-now'] .shop-kicker, [data-qa='radio-cabinet'] .shop-kicker")
  .evaluateAll((els) => els.map((e) => e.textContent.trim()));
results.autoLitFirst = await lit("auto");

await page.locator('[data-qa="station-blitz"]').click({ force: true });
await page.waitForTimeout(200);
results.pickedNotes = await listen();
results.blurb = await page.locator("[data-qa='station-blurb']").textContent();
results.saved = await page.evaluate(
  () => JSON.parse(localStorage.getItem("stack-tetris-v1")).station,
);

// The pick is a setting, not a mood: it is still there after a reload, on a mode
// that has a bed of its own.
await open();
await openSettings();
results.litAfterReload = await lit("blitz");
await page.locator(".shop-x").click({ force: true });
await page.waitForTimeout(200);
await page.locator('[data-qa="play"]').click({ force: true });
await page.waitForTimeout(1200);
results.reloadNotes = await listen();

console.log(
  JSON.stringify(
    {
      namedStations: results.namedStations,
      nowShelf: results.nowShelf,
      cabinetShelf: results.cabinetShelf,
      shelfLabels: results.shelfLabels,
      autoLitFirst: results.autoLitFirst,
      blurb: results.blurb,
      saved: results.saved,
      litAfterReload: results.litAfterReload,
      autoNotes: [...new Set(results.autoNotes)].sort((a, b) => a - b),
      pickedNotes: [...new Set(results.pickedNotes)].sort((a, b) => a - b),
      reloadNotes: [...new Set(results.reloadNotes)].sort((a, b) => a - b),
      errors,
    },
    null,
    2,
  ),
);

// Pitches only Redline's bed has. Nothing the pad can fire lands on them.
const REDLINE = [466, 415, 155];
const heard = (notes) => REDLINE.some((f) => notes.includes(f));

const fail = [];
if (results.namedStations.length !== 16) fail.push("the dial is not sixteen picks wide");
if (results.namedStations[0] !== "Auto") fail.push("Auto is not the first pick");
if (results.namedStations.filter((n) => n === "Auto").length !== 1) {
  fail.push("Auto is on the dial more than once");
}
if (results.namedStations.some((n) => /^Track \d/.test(n) || !n)) {
  fail.push("a station has no name");
}
if (results.shelfLabels?.join(" / ") !== "Now / Cabinet") {
  fail.push("the shelves are not labeled Now and Cabinet");
}
const NOW = ["Back Room", "Rain Check", "Coast Road", "Sky Deck", "Two Step"];
const CABINET = [
  "Long Haul",
  "Pace Car",
  "Redline",
  "Dawn Shift",
  "Token Row",
  "Old Cabinet",
  "Still Water",
  "Clean Hands",
  "Ghost Light",
  "Last Call",
];
if (JSON.stringify(results.nowShelf) !== JSON.stringify(NOW)) {
  fail.push("the Now shelf is not the five modern stations");
}
if (JSON.stringify(results.cabinetShelf) !== JSON.stringify(CABINET)) {
  fail.push("the Cabinet shelf is not the ten older stations");
}
if (!results.autoLitFirst) fail.push("an old save did not wake up on Auto");
if (heard(results.autoNotes)) fail.push("Auto played a bed nobody asked for");
if (!results.autoNotes.length) fail.push("Auto played nothing at all");
if (!heard(results.pickedNotes)) fail.push("picking a station did not change the tune");
if (!results.blurb?.trim()) fail.push("the picked station says nothing about itself");
if (results.saved !== "blitz") fail.push("the pick did not reach the save");
if (!results.litAfterReload) fail.push("the pick did not survive a reload");
if (!heard(results.reloadNotes)) fail.push("the next run went back to the mode's bed");
// A stored save always differs from what the server guessed, so hydration says so on every page here.
const real = errors.filter((e) => !e.startsWith("Hydration failed"));
if (real.length) fail.push(`page errors: ${real.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
