#!/usr/bin/env node
/**
 * How smooth are line clears on a phone-size Watch run?
 *
 * Starts Watch (ES bot) at 390x844 as a touch device, records every rAF
 * interval with the game phase, and splits the frames into the clear window
 * (clear start + CLEAR_WINDOW_MS, which covers the clear animation and any
 * particles it leaves behind) and the rest of play. Headless Chromium paints
 * WebGL with SwiftShader on the CPU, so absolute numbers sit well below a real
 * phone; compare builds on the same machine, not against 60.
 *
 * Usage: node scripts/clear-frame-probe.mjs [url] [--seconds=40] [--runs=2] [--dpr=3] [--cpu=1] [--reduce]
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const url = args.find((a) => !a.startsWith("--")) || "http://127.0.0.1:8080/?qa=1";
const seconds = Number(flag("seconds", 40));
const runs = Number(flag("runs", 2));
const dpr = Number(flag("dpr", 3));
const cpu = Number(flag("cpu", 1));
const reduce = args.includes("--reduce");
const CLEAR_WINDOW_MS = 700;

const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
};

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

function stats(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    frames: s.length,
    fps: +(1000 / (sum / s.length)).toFixed(1),
    mean: +(sum / s.length).toFixed(1),
    p50: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    over50: s.filter((v) => v > 50).length,
    over100: s.filter((v) => v > 100).length,
  };
}

async function oneRun(i) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: dpr,
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  }
  await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(SAVE));  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.locator('button[aria-label="Settings"]').click({ force: true });
  await page.waitForSelector('[data-qa="set-bot"]', { timeout: 6000 });
  await page.locator('[data-qa="set-bot"]').click({ force: true });
  await page.locator(".shop-x").click({ force: true });
  await page.waitForTimeout(200);
  await page.locator('[data-qa="watch-bot"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", null, { timeout: 10000 });
  await page.waitForTimeout(1500);

  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const out = await page.evaluate(
    ({ ms }) =>
      new Promise((done) => {
        const frames = [];
        const clears = [];
        const longTasks = [];
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) longTasks.push({ t: e.startTime, d: e.duration });
          }).observe({ type: "longtask" });
        } catch {
          // no longtask support
        }
        let last = performance.now();
        let prevPhase = "";
        const end = last + ms;
        const tick = (now) => {
          const phase = window.__controlsTest?.getPhase?.() ?? "";
          if (phase === "clearing" && prevPhase !== "clearing") clears.push({ t: now, lines: window.__controlsTest?.getLines?.() ?? 0 });
          frames.push({ t: now, dt: now - last, phase });
          prevPhase = phase;
          last = now;
          if (now < end && phase !== "over") requestAnimationFrame(tick);
          else
            done({
              frames,
              clears,
              longTasks,
              lines: window.__controlsTest?.getLines?.() ?? 0,
              phase,
              canvas: (() => {
                const c = document.querySelector(".well canvas");
                return c ? [c.width, c.height] : null;
              })(),
            });
        };
        requestAnimationFrame(tick);
      }),
    { ms: seconds * 1000 },
  );
  await ctx.close();

  const inClear = (t) => out.clears.some((c) => t >= c.t && t <= c.t + CLEAR_WINDOW_MS);
  const clearDts = [];
  const restDts = [];
  for (const f of out.frames.slice(1)) (inClear(f.t) ? clearDts : restDts).push(f.dt);
  const worstPerClear = out.clears.map((c) =>
    Math.max(0, ...out.frames.filter((f) => f.t >= c.t && f.t <= c.t + CLEAR_WINDOW_MS).map((f) => f.dt)),
  );
  // A long task that starts just before the clear frame is the clear's own work.
  const ltClear = out.longTasks.filter((l) => out.clears.some((c) => l.t >= c.t - 120 && l.t <= c.t + CLEAR_WINDOW_MS));
  const ltRest = out.longTasks.filter((l) => !ltClear.includes(l));
  const sum = (l) => +l.reduce((a, b) => a + b.d, 0).toFixed(0);
  return {
    run: i + 1,
    coarse,
    canvas: out.canvas,
    clears: out.clears.length,
    lines: out.lines,
    endPhase: out.phase,
    clear: stats(clearDts),
    rest: stats(restDts),
    all: stats([...clearDts, ...restDts]),
    worstPerClear: stats(worstPerClear),
    firstClearWorst: worstPerClear[0] ?? null,
    longTasksInClears: { n: ltClear.length, ms: sum(ltClear), max: Math.max(0, ...ltClear.map((l) => +l.d.toFixed(0))) },
    longTasksElsewhere: { n: ltRest.length, ms: sum(ltRest) },
    _clearDts: clearDts,
    _restDts: restDts,
    _worst: worstPerClear,
  };
}

const results = [];
for (let i = 0; i < runs; i++) {
  const r = await oneRun(i);
  results.push(r);
  const { _clearDts, _restDts, _worst, ...shown } = r;
  console.log(JSON.stringify(shown));
}
await browser.close();

const pool = (k) => results.flatMap((r) => r[k]);
console.log(
  JSON.stringify(
    {
      summary: { seconds, runs, dpr, cpu, reduce, clears: results.reduce((a, r) => a + r.clears, 0) },
      clearWindow: stats(pool("_clearDts")),
      rest: stats(pool("_restDts")),
      worstFramePerClear: stats(pool("_worst")),
    },
    null,
    2,
  ),
);
