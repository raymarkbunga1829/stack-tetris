#!/usr/bin/env node
/**
 * Does the well hold still when the run ends?
 *
 * Buries a Marathon run with hard drops on a phone (pad showing) and on a
 * desk, and keeps the well / Hold / Next boxes from the last frame that was
 * still in play. The topout wash and the results card must land on exactly
 * that layout: the card goes over the well, it does not make room for itself.
 * Then it reads the card's own backing, so the score and buttons sit on a
 * panel rather than straight on the stack.
 * Usage: node scripts/over-layout-probe.mjs [url] [--shots dir]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? args.splice(shotsAt, 2)[1] : null;
const url = args[0] || "http://127.0.0.1:8080/?qa=1";
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
const fail = [];

const SIZES = [
  { label: "phone", width: 390, height: 844, phone: true },
  { label: "desk", width: 1280, height: 800 },
  { label: "wide desk", width: 1440, height: 900 },
];

const PARTS = {
  well: ".well",
  hold: ".stage > .rail:first-of-type",
  next: ".stage > .rail.rail-next",
};

const measure = (page) =>
  page.evaluate((parts) => {
    const out = { phase: window.__controlsTest?.getPhase?.() ?? null };
    for (const [k, sel] of Object.entries(parts)) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      out[k] = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }
    out.card = !!document.querySelector(".veil.is-polaroid");
    out.wash = !!document.querySelector(".banner.is-topout");
    return out;
  }, PARTS);

/** The opacity of whatever sits between the card's text and the stack. */
const backing = (page) =>
  page.evaluate(() => {
    const card = document.querySelector(".veil.is-polaroid");
    if (!card) return null;
    const alpha = (el) => {
      const bg = getComputedStyle(el).backgroundColor;
      if (!bg || bg === "transparent") return 0;
      const slash = bg.match(/\/\s*([\d.]+)(%?)\s*\)$/);
      if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
      const rgba = bg.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      return rgba ? Number(rgba[1]) : 1;
    };
    // Every text row and button on the card, and the panels stacked behind it.
    const rows = [...card.querySelectorAll(".veil-title, .veil-kicker, .recap, .play-btn, .text-btn")];
    const worst = rows.reduce((lo, el) => {
      let a = 0;
      for (let n = el.parentElement; n && n !== card.parentElement; n = n.parentElement) {
        a = 1 - (1 - a) * (1 - alpha(n));
      }
      return Math.min(lo, a);
    }, 1);
    return { rows: rows.length, worst: Math.round(worst * 1000) / 1000 };
  });

const same = (a, b) =>
  a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= 1);

const results = {};

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: !!size.phone,
    isMobile: !!size.phone,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript(
    (s) => localStorage.setItem("stack-tetris-v1", s),
    JSON.stringify({ version: 4, onboarded: true, tipSeen: true, a2hs: true, mode: "marathon" }),
  );
  page.on("pageerror", (e) => {
    const msg = e.message.split("\n")[0];
    if (/Hydration failed|Minified React error #418|#423|#425/.test(msg)) return;
    errors.push(`${size.label}: ${msg}`);
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForTimeout(500);

  const padShown = await page
    .locator(".pad")
    .evaluate((el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0)
    .catch(() => false);

  let last = null;
  let ended = null;
  for (let i = 0; i < 80 && !ended; i++) {
    const seen = await measure(page);
    if (seen.phase === "playing" || seen.phase === "clearing") {
      last = seen;
      if (shots)
        await page.screenshot({ path: `${shots}/${size.label.replace(/ /g, "-")}-play.png` });
    } else if (seen.phase === "over") ended = seen;
    else break;
    if (ended) break;
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);
  }
  if (!ended) {
    fail.push(`${size.label}: the run never topped out, so nothing was compared`);
    await ctx.close();
    continue;
  }

  const wash = ended.wash ? ended : null;
  await page.waitForSelector(".veil.is-polaroid", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  const card = await measure(page);
  const panel = await backing(page);
  if (shots) {
    await page.screenshot({ path: `${shots}/${size.label.replace(/ /g, "-")}-card.png` });
  }

  results[size.label] = { padShown, last, wash, card, panel };

  const where = `${size.label} ${size.width}x${size.height}`;
  if (size.phone && !padShown) fail.push(`${where}: the touch pad was not showing, so this is not the phone layout`);
  if (!card.card) fail.push(`${where}: the results card never came up`);
  for (const k of Object.keys(PARTS)) {
    if (wash && !same(last[k], wash[k]))
      fail.push(`${where}: ${k} moved at the topout wash ${JSON.stringify(last[k])} -> ${JSON.stringify(wash[k])}`);
    if (!same(last[k], card[k]))
      fail.push(`${where}: ${k} moved under the results card ${JSON.stringify(last[k])} -> ${JSON.stringify(card[k])}`);
  }
  if (!panel || panel.rows === 0) fail.push(`${where}: no text on the results card to read`);
  else if (panel.worst < 0.9)
    fail.push(`${where}: the card's text sits on a ${panel.worst} backing, the stack shows through`);

  await ctx.close();
}

console.log(JSON.stringify({ results, errors }, null, 2));
if (errors.length) fail.push(`page errors: ${errors.join(" | ")}`);
if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
