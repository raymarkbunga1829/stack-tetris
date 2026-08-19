#!/usr/bin/env node
/**
 * Does the radio play for a first-run player?
 *
 * Counts the sources the bus actually starts, and where the AudioContext was born:
 * a context made outside a gesture is the one browsers refuse to open.
 * Usage: node scripts/audio-probe.mjs [url]
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

const probe = () => {
  const log = [];
  window.__audio = { log, ctxs: [], sources: 0, lost: 0 };
  const Real = window.AudioContext || window.webkitAudioContext;
  const Patched = function (...args) {
    const ctx = new Real(...args);
    window.__audio.ctxs.push(ctx);
    const act = navigator.userActivation;
    log.push(`born state=${ctx.state} inGesture=${act ? act.isActive : "n/a"}`);
    return ctx;
  };
  Patched.prototype = Real.prototype;
  window.AudioContext = Patched;
  window.webkitAudioContext = Patched;
  for (const proto of [OscillatorNode.prototype, AudioBufferSourceNode.prototype]) {
    const start = proto.start;
    proto.start = function (...a) {
      window.__audio.sources += 1;
      const ctx = window.__audio.ctxs[0];
      if (ctx && ctx.state !== "running") window.__audio.lost += 1;
      return start.apply(this, a);
    };
  }
};

const read = () =>
  page.evaluate(() => ({
    ctx: window.__audio.ctxs.map((c) => c.state),
    sources: window.__audio.sources,
    lostToLockedBus: window.__audio.lost,
    radio: [...document.querySelectorAll("footer.foot button")]
      .map((b) => b.textContent)
      .find((t) => t.startsWith("Radio")),
    offMark: document.querySelector(".off-mark")?.textContent ?? null,
    phase: window.__controlsTest?.getPhase?.(),
    log: window.__audio.log,
  }));

const errors = [];
let page;
const fresh = async (label, save) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  await page.addInitScript(probe);
  if (save) {
    await page.addInitScript(
      (s) => localStorage.setItem("stack-tetris-v1", s),
      JSON.stringify(save),
    );
  }
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(600);
};

const drop = async (n = 4) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(320);
  }
};

const results = {};

// A first-run player who taps Start.
await fresh("tap");
results.titleRadio = (await read()).radio;
results.titleOffMark = (await read()).offMark;
await page.locator('[data-qa="play"]').click({ force: true });
await page.waitForTimeout(900);
await page.locator(".coach-skip").click({ force: true });
await drop();
results.tap = await read();

// A first-run player who never touches the pointer: keys only, from the title.
await fresh("keys");
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
for (const k of ["ArrowLeft", "ArrowUp", "ShiftLeft", "Space"]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(250);
}
await drop();
results.keys = await read();

// A player who already chose quiet. Nobody blasts them.
await fresh("quiet", { version: 4, musicVol: 0, sfxVol: 0, muted: true, onboarded: true });
results.quietRadio = (await read()).radio;
await page.locator('[data-qa="play"]').click({ force: true });
await page.waitForTimeout(900);
await drop();
results.quiet = await read();

// The control still cycles.
await fresh("cycle", { version: 4, onboarded: true });
const btn = page.locator("footer.foot button").last();
const cycle = [await btn.textContent()];
for (let i = 0; i < 3; i++) {
  await btn.click();
  await page.waitForTimeout(120);
  cycle.push(await btn.textContent());
}
results.cycle = cycle;

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];
if (results.titleRadio !== "Radio on") fail.push("title does not read Radio on");
if (results.titleOffMark) fail.push("title claims no signal");
if (results.tap.sources < 10) fail.push("tap start stayed silent");
if (results.keys.sources < 10) fail.push("key start stayed silent");
if (results.tap.lostToLockedBus || results.keys.lostToLockedBus) {
  fail.push("sounds fell into a locked bus");
}
if (!results.tap.log[0]?.includes("inGesture=true")) fail.push("tap bus born outside a gesture");
if (!results.keys.log[0]?.includes("inGesture=true")) fail.push("key bus born outside a gesture");
if (results.quiet.sources > 0) fail.push("quiet player got blasted");
if (results.quietRadio !== "Radio off") fail.push("quiet player is not told the radio is off");
if (cycle.join(" ") !== "Radio on Radio low Radio off Radio on") fail.push("control stopped cycling");
// A stored save always differs from what the server guessed, so only the first-run pages must be clean.
const firstRunErrors = errors.filter((e) => e.startsWith("tap:") || e.startsWith("keys:"));
if (firstRunErrors.length) fail.push(`first-run page errors: ${firstRunErrors.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
