#!/usr/bin/env node
/**
 * Open Modes from a pause. Is the well still there?
 *
 * The list was never the problem — nine modes, the goals under them, all fine.
 * What went missing was everything above the sheet: an opaque veil painted a
 * black wall over the frozen cabinet, so the stack and the Paused card read as
 * a rendering failure. So this one looks the way a player looks. It shoots the
 * strip of well above the sheet with the sheet shut, shoots the same strip with
 * it open, and fails if the second one has gone flat. Then it checks the sheet
 * still does its job: nine modes, a pick that takes, a Close that closes, and
 * the same trip from the title screen.
 * Usage: node scripts/modes-scrim-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

/** A player who has seen the coach before, on a phone, mode already set. */
const start = async (label) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
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
        credits: 120,
      }),
    );
  });
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.split("\n")[0]}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);
};

/** A run with something in the well worth seeing: six pieces slammed home. */
const play = async (slams = 0) => {
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 6000,
  });
  await page.waitForTimeout(500);
  for (let i = 0; i < slams; i++) {
    await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
    await page.keyboard.press("Space");
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(300);
};

const pause = async () => {
  await page.locator(".hud-pause").click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "paused", {
    timeout: 4000,
  });
  await page.waitForTimeout(400);
};

const openFromPause = async () => {
  await page.locator('[data-qa="pause-modes"]').click({ force: true });
  await page.waitForSelector(".shop-veil .modes", { timeout: 4000 });
  await page.waitForTimeout(400);
};

const openFromTitle = async () => {
  await page.locator('.foot button[aria-label="Modes"]').click({ force: true });
  await page.waitForSelector(".shop-veil .modes", { timeout: 4000 });
  await page.waitForTimeout(400);
};

const close = async () => {
  await page.locator(".shop-veil .shop-x").click({ force: true });
  await page.waitForTimeout(400);
};

/** The strip of well left above the sheet — the part that went black. */
const strip = () =>
  page.evaluate(() => {
    const well = document.querySelector(".well")?.getBoundingClientRect();
    const sheet = document.querySelector(".shop-veil .shop")?.getBoundingClientRect();
    if (!well || !sheet) return null;
    const bottom = Math.min(well.bottom, sheet.top);
    if (bottom - well.top < 24) return null;
    return {
      x: Math.round(well.left + 10),
      y: Math.round(well.top + 10),
      width: Math.round(well.width - 20),
      height: Math.round(bottom - well.top - 20),
    };
  });

/** How much light and how much variety a patch of the screen holds. */
const readPatch = async (clip) => {
  const shot = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ([b64, box]) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const img = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = box.width;
      c.height = box.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      const d = ctx.getImageData(0, 0, box.width, box.height).data;
      let n = 0;
      let sum = 0;
      let sq = 0;
      let max = 0;
      const shades = new Set();
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n += 1;
        sum += l;
        sq += l * l;
        if (l > max) max = l;
        shades.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
      }
      const mean = sum / n;
      return {
        box,
        mean: Math.round(mean * 100) / 100,
        sd: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean)) * 100) / 100,
        max: Math.round(max * 10) / 10,
        shades: shades.size,
      };
    },
    [shot, clip],
  );
};

/** What the sheet says, and what is left of the cabinet around it. */
const look = () =>
  page.evaluate(() => {
    const seen = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        gone: cs.display === "none" || cs.visibility === "hidden",
      };
    };
    return {
      phase: window.__controlsTest?.getPhase?.() ?? null,
      open: !!document.querySelector(".shop-veil .modes"),
      veilBg: (() => {
        const v = document.querySelector(".shop-veil");
        return v ? getComputedStyle(v).backgroundColor : null;
      })(),
      // Topmost first, so a wall over the well has a name when it turns up.
      overWell: (() => {
        const w = document.querySelector(".well")?.getBoundingClientRect();
        if (!w) return [];
        return document
          .elementsFromPoint(Math.round(w.left + w.width / 2), Math.round(w.top + 24))
          .slice(0, 4)
          .map((el) => el.className?.baseVal ?? String(el.className || el.tagName.toLowerCase()));
      })(),
      modes: [...document.querySelectorAll('[data-qa^="sheet-mode-"]')].map((b) => ({
        id: b.getAttribute("data-qa").replace("sheet-mode-", ""),
        name: b.querySelector(".mode-name")?.textContent?.trim() ?? "",
        rule: b.querySelector(".mode-rule")?.textContent?.trim() ?? "",
        on: b.getAttribute("aria-selected") === "true",
        tall: Math.round(b.getBoundingClientRect().height),
      })),
      goals: document.querySelectorAll(".missions li").length,
      canvas: seen(".well canvas"),
      pauseCard: seen(".pause-card"),
      titleCard: seen(".veil .veil-title"),
    };
  });

const results = {};

// The trip that broke: a run with a stack in the well, a pause, then Modes.
await start("pause");
await play(6);
await pause();

// The strip of well the sheet will leave uncovered, shot before and after.
await openFromPause();
const clip = await strip();
results.strip = clip;
if (clip) {
  await close();
  await page.waitForTimeout(400);
  results.shut = await readPatch(clip);
  await openFromPause();
  results.opened = await readPatch(clip);
} else {
  await page.waitForTimeout(200);
}
results.fromPause = await look();

// The list still picks. Zen is not a title chip, so the chip strip has to name it.
await page.locator('[data-qa="sheet-mode-zen"]').click({ force: true });
await page.waitForTimeout(500);
results.picked = await page.evaluate(() => ({
  open: !!document.querySelector(".shop-veil .modes"),
  phase: window.__controlsTest?.getPhase?.() ?? null,
  chip: document.querySelector('[data-qa="mode-more"] span')?.textContent?.trim() ?? null,
}));

// And Close still closes out of a pause, leaving the run paused where it was.
await play();
await pause();
await openFromPause();
await close();
results.closed = await page.evaluate(() => ({
  open: !!document.querySelector(".shop-veil .modes"),
  phase: window.__controlsTest?.getPhase?.() ?? null,
  card: !!document.querySelector(".pause-card"),
}));

// The other door in: Modes off the title screen, which PR #15 opened.
await start("title");
await openFromTitle();
results.fromTitle = await look();

console.log(JSON.stringify({ ...results, errors }, null, 2));

const fail = [];

const NINE = ["marathon", "sprint", "blitz", "daily", "zen", "arcade", "classic", "finesse", "siege"];

const listsNine = (r, where) => {
  if (!r.open) {
    fail.push(`${where}: the Modes sheet never opened`);
    return;
  }
  const ids = r.modes.map((m) => m.id);
  const missing = NINE.filter((id) => !ids.includes(id));
  if (missing.length) fail.push(`${where}: the sheet is missing ${missing.join(", ")}`);
  const nameless = r.modes.filter((m) => !m.name || !m.rule);
  if (nameless.length)
    fail.push(`${where}: ${nameless.length} modes have no name or no rule under them`);
  const flat = r.modes.filter((m) => m.tall < 20);
  if (flat.length) fail.push(`${where}: ${flat.length} modes are not tall enough to tap`);
  if (r.goals < 1) fail.push(`${where}: the mission rows are gone`);
};

const keepsTheWell = (r, where) => {
  if (!r.canvas) fail.push(`${where}: the well is not on the page at all`);
  else if (r.canvas.gone) fail.push(`${where}: the well is hidden while Modes is open`);
  else if (r.canvas.w < 40 || r.canvas.h < 40)
    fail.push(`${where}: the well collapsed to ${r.canvas.w}x${r.canvas.h}`);
};

listsNine(results.fromPause, "from pause");
keepsTheWell(results.fromPause, "from pause");
listsNine(results.fromTitle, "from the title");
keepsTheWell(results.fromTitle, "from the title");

if (!results.strip) {
  fail.push("the sheet leaves no well above it to look at");
} else {
  const { shut, opened, fromPause } = results;
  const blame = fromPause.overWell?.[0] ?? "something";
  if (opened.sd < 2 || opened.shades < 6)
    fail.push(
      `Modes paints a flat ${Math.round(opened.mean)}/255 field over the well — "${blame}" is a wall, not a scrim`,
    );
  if (opened.sd < shut.sd * 0.25)
    fail.push(
      `the well all but vanishes behind Modes: ${shut.sd} of contrast down to ${opened.sd}`,
    );
  if (opened.max < 24)
    fail.push(`nothing above the sheet is brighter than ${opened.max}/255: the void is back`);
  if (opened.mean > shut.mean * 1.05)
    fail.push("Modes brightens the well instead of dimming it");
}

const card = results.fromPause.pauseCard;
if (!card || card.gone) fail.push("from pause: the Paused card is gone while Modes is open");
if (!results.fromTitle.titleCard || results.fromTitle.titleCard.gone)
  fail.push("from the title: the title card is gone while Modes is open");

if (results.picked.open) fail.push("picking a mode leaves the sheet up");
if (results.picked.chip !== "Zen")
  fail.push(`the pick did not take: the strip reads ${results.picked.chip}`);
if (results.closed.open) fail.push("Close no longer dismisses the sheet");
if (results.closed.phase !== "paused") fail.push("Close dropped the run out of its pause");
if (!results.closed.card) fail.push("Close left the pause without its card");

// A stored save always differs from what the server guessed, so the hydration
// grumble is noise. A real crash is not.
const crashes = errors.filter((e) => !e.includes("Hydration failed"));
if (crashes.length) fail.push(`page errors: ${crashes.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
