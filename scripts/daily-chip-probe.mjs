#!/usr/bin/env node
/**
 * Daily chip date: first paint must not be yesterday.
 *
 * The title used to call manilaDateKey() during render, so a cached document
 * (CDN / SW / last-visit HTML) could paint Sep 30 and then flip to Oct 1.
 * SSR + hydration now leave the chip blank; the Manila day arrives after.
 *
 * Usage: node scripts/daily-chip-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

function manilaDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatManilaDate(key) {
  const parts = key.split("-");
  const m = Number(parts[1] ?? 1);
  const day = Number(parts[2] ?? 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Math.max(0, m - 1)]} ${day}`;
}

function utcShift(days, from = manilaDateKey()) {
  const d = new Date(`${from}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTH = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/;
const today = manilaDateKey();
const todayStamp = formatManilaDate(today);
const yesterdayStamp = formatManilaDate(utcShift(-1, today));

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));

await page.addInitScript(() => {
  window.__dailyChipSeen = [];
  const rec = () => {
    const el = document.querySelector(".chip-date");
    if (!el) return;
    window.__dailyChipSeen.push((el.textContent ?? "").replace(/\u00a0/g, " ").trim());
  };
  const mo = new MutationObserver(rec);
  const start = () => {
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    rec();
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start);
});

const raw = await ctx.request.get(url, { timeout: 45000 });
const html = await raw.text();
const baked = [...html.matchAll(/class="chip-date"[^>]*>([\s\S]*?)<\/small>/g)].map((m) =>
  m[1].replace(/&nbsp;|&#160;|\u00a0/g, " ").replace(/<[^>]+>/g, "").trim(),
);

await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector('[data-qa="mode-daily"] .chip-date', { timeout: 8000 });
await page.waitForFunction(
  (want) => {
    const el = document.querySelector('[data-qa="mode-daily"] .chip-date');
    return (el?.textContent ?? "").includes(want);
  },
  todayStamp,
  { timeout: 8000 },
);
await page.waitForTimeout(400);

const live = await page.evaluate(() => {
  const el = document.querySelector('[data-qa="mode-daily"] .chip-date');
  return {
    text: (el?.textContent ?? "").replace(/\u00a0/g, " ").trim(),
    seen: window.__dailyChipSeen ?? [],
  };
});

const fail = [];

if (!baked.length) fail.push("SSR HTML has no Daily chip-date (title first paint changed)");
for (const stamp of baked) {
  if (MONTH.test(stamp)) fail.push(`SSR HTML baked a calendar day into the chip: "${stamp}"`);
  if (stamp === yesterdayStamp) fail.push("SSR HTML baked yesterday's Manila date");
}

if (live.text !== todayStamp && !live.text.startsWith(`${todayStamp} ·`)) {
  fail.push(`after hydrate the chip reads "${live.text}", wanted ${todayStamp}`);
}

const flashed = [...new Set(live.seen)].filter((s) => s && MONTH.test(s) && !s.startsWith(todayStamp));
if (flashed.length) fail.push(`chip flashed a non-today date: ${flashed.map((s) => `"${s}"`).join(", ")}`);
if (live.seen.some((s) => s === yesterdayStamp || s.startsWith(`${yesterdayStamp} ·`))) {
  fail.push(`chip painted yesterday (${yesterdayStamp}) before today`);
}

if (errors.some((e) => /Hydration failed|Minified React error #418|#423|#425/.test(e))) {
  fail.push(`hydration error: ${errors.join(" | ")}`);
} else if (errors.length) {
  fail.push(`page errors: ${errors.join(" | ")}`);
}

console.log(
  JSON.stringify(
    { today: todayStamp, yesterday: yesterdayStamp, baked, live, errors },
    null,
    2,
  ),
);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
