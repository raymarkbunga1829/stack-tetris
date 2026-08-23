#!/usr/bin/env node
/**
 * Do the new stations sound modern, or just faster?
 *
 * Watches what the music bus builds, not what the dial says: a pulse bed is a
 * pair of oscillators and nothing else, while a modern bed has to show filters,
 * a kit (noise slices and a sine kick) and a delay. Also keeps the old beds
 * honest — Old Cabinet still has to come out as bare as it always was.
 * Usage: node scripts/radio-modern-probe.mjs [url]
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

/** Every pitch the bus asks for, every node it builds, and every source it starts. */
const probe = () => {
  const zero = () => ({ notes: [], waves: [], filters: 0, sources: 0, delays: 0 });
  window.__rack = zero();
  window.__rackReset = () => {
    const keep = window.__rack.delays;
    window.__rack = zero();
    window.__rack.delays = keep;
  };
  const Real = window.AudioContext || window.webkitAudioContext;
  const Patched = function (...args) {
    const ctx = new Real(...args);
    const osc = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const node = osc();
      const set = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (v, t) => {
        window.__rack.notes.push(Math.round(v));
        return set(v, t);
      };
      const start = node.start.bind(node);
      // The shape is chosen after the node is born, so read it on the way out.
      node.start = (...a) => {
        window.__rack.waves.push(node.type);
        return start(...a);
      };
      return node;
    };
    const filter = ctx.createBiquadFilter.bind(ctx);
    ctx.createBiquadFilter = () => {
      window.__rack.filters += 1;
      return filter();
    };
    const delay = ctx.createDelay.bind(ctx);
    ctx.createDelay = (...a) => {
      window.__rack.delays += 1;
      return delay(...a);
    };
    const buffer = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const node = buffer();
      const start = node.start.bind(node);
      node.start = (...a) => {
        window.__rack.sources += 1;
        return start(...a);
      };
      return node;
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

/** Nobody touches the pad: whatever shows up in the window is the bed. */
const listen = async (ms) => {
  await page.evaluate(() => window.__rackReset());
  await page.waitForTimeout(ms);
  return page.evaluate(() => ({
    notes: [...new Set(window.__rack.notes)].sort((a, b) => a - b),
    waves: [...new Set(window.__rack.waves)].sort(),
    filters: window.__rack.filters,
    sources: window.__rack.sources,
    delays: window.__rack.delays,
  }));
};

/**
 * A pick has to land on the air within a step or two, mid-run, with no reload.
 * The window opens before the tap so the front of the new bed is inside it.
 */
const tune = async (id, ms) => {
  await page.evaluate(() => window.__rackReset());
  await page.locator(`[data-qa="station-${id}"]`).click({ force: true });
  await page.waitForTimeout(ms);
  return page.evaluate(() => ({
    notes: [...new Set(window.__rack.notes)].sort((a, b) => a - b),
    waves: [...new Set(window.__rack.waves)].sort(),
    filters: window.__rack.filters,
    sources: window.__rack.sources,
    delays: window.__rack.delays,
  }));
};

// Pitches the front of each bed plays, and how long that front takes. All of the
// pitches have to turn up, or something else is on the air.
const HEADS = {
  classic: { ms: 2600, notes: [196, 220, 247, 147, 165, 185, 98] },
  house: { ms: 2200, notes: [523, 440, 659, 330, 262, 110] },
  lofi: { ms: 2600, notes: [523, 494, 330, 131] },
  synthwave: { ms: 1800, notes: [880, 784, 330, 262, 110, 220] },
  future: { ms: 1800, notes: [880, 784, 698, 523, 440, 349, 87] },
  garage: { ms: 1800, notes: [523, 659, 440, 392, 330, 110, 82] },
};

await open();
await page.locator('[data-qa="play"]').click({ force: true });
await page.waitForTimeout(1200);
await openSettings();

const heard = {};
for (const [id, head] of Object.entries(HEADS)) heard[id] = await tune(id, head.ms);

const names = await page
  .locator(".radio-dial button")
  .evaluateAll((els) => els.map((e) => e.textContent.trim()));

// Quiet still means quiet, kit or no kit.
await page.locator(".mix-row input").first().fill("0");
await page.waitForTimeout(250);
const quiet = await listen(1200);

await page.locator(".mix-row input").first().fill("1");
await page.waitForTimeout(200);
await page.locator(".shop-x").click({ force: true });

// The pick is a setting: a modern bed has to be on the air again next run.
await open();
await openSettings();
const litAfterReload = await page
  .locator('[data-qa="station-garage"]')
  .evaluate((el) => el.className.includes("is-on"));
await page.locator(".shop-x").click({ force: true });
await page.waitForTimeout(200);
await page.locator('[data-qa="play"]').click({ force: true });
await page.waitForTimeout(1000);
// Mid-loop this time, so the window has to be wide enough for a whole pass of the bed.
const afterReload = await listen(4200);

console.log(JSON.stringify({ names, heard, quiet, litAfterReload, afterReload, errors }, null, 2));

const MODERN = ["house", "lofi", "synthwave", "future", "garage"];
const missing = (got, want) => want.filter((f) => !got.notes.includes(f));

const fail = [];
for (const [id, head] of Object.entries(HEADS)) {
  const gap = missing(heard[id], head.notes);
  if (gap.length) fail.push(`${id} did not play its own notes (missing ${gap.join(", ")})`);
}
for (const id of MODERN) {
  const got = heard[id];
  if (!got.filters) fail.push(`${id} ran without a filter, so it is still a bare oscillator`);
  if (!got.sources) fail.push(`${id} played no kit`);
  if (!got.waves.includes("sine")) fail.push(`${id} played no kick`);
  if (!got.delays) fail.push(`${id} never built the delay`);
}
for (const id of ["house", "synthwave", "future"]) {
  if (!heard[id].waves.includes("sawtooth")) fail.push(`${id} lost its saws`);
}
// Old Cabinet is the control: pulse pair, triangle bass, nothing else.
if (heard.classic.filters) fail.push("Old Cabinet grew a filter");
if (heard.classic.sources) fail.push("Old Cabinet grew a kit");
if (heard.classic.waves.some((w) => w !== "custom" && w !== "triangle")) {
  fail.push(`Old Cabinet changed voice: ${heard.classic.waves.join(", ")}`);
}
if (names.length !== 16) fail.push("the dial is not sixteen picks wide");
if (names[0] !== "Auto") fail.push("Auto is not the first pick");
for (const n of ["Back Room", "Rain Check", "Coast Road", "Sky Deck", "Two Step"]) {
  if (!names.includes(n)) fail.push(`${n} is not on the dial`);
}
if (quiet.notes.length || quiet.sources) fail.push("a modern bed played over a muted radio");
if (!litAfterReload) fail.push("the modern pick did not survive a reload");
if (missing(afterReload, HEADS.garage.notes).length) {
  fail.push("the next run went back to another bed");
}
// A stored save always differs from what the server guessed, so hydration says so on every page here.
const real = errors.filter((e) => !e.startsWith("Hydration failed"));
if (real.length) fail.push(`page errors: ${real.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
