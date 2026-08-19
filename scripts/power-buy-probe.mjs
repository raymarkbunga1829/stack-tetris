#!/usr/bin/env node
/**
 * Can a first-run player get the powers they do not own?
 *
 * Reads the five pads the way a player does — count or price, dead or alive —
 * then taps the empty ones: one they can cover, one they cannot.
 * Usage: node scripts/power-buy-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

const start = async (label, save) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
  await page.waitForTimeout(200);
};

const pads = () =>
  page.$$eval(".pwr", (els) =>
    els.map((el) => ({
      id: el.dataset.qa,
      dead: el.disabled,
      tell: el.querySelector("b")?.textContent?.trim(),
      label: el.getAttribute("aria-label"),
    })),
  );

const text = async (sel) => {
  const node = page.locator(sel).first();
  const found = await node.textContent().catch(() => null);
  return found ? found.trim() : null;
};

const credits = () => page.evaluate(() => window.__controlsTest.getCredits());

const tap = async (id) => {
  await page.locator(`[data-qa="pwr-${id}"]`).click({ force: true });
  await page.waitForTimeout(350);
};

const results = {};

// A first-run player: 80 CR in pocket, no Shield, no Quake.
await start("first-run");
results.firstRun = await pads();
results.credits = await credits();

// Shield is 70 CR and they can cover it, so the bar sells it on the spot.
await tap("shield");
results.afterShield = {
  pads: await pads(),
  credits: await credits(),
  banner: await text(".banner"),
  shopOpen: (await page.locator(".shop").count()) > 0,
};

// Quake is 90 CR and they are short, so the tap hands them the Store.
await tap("quake");
results.afterQuake = {
  shopOpen: (await page.locator(".shop").count()) > 0,
  tab: await text(".shop-tabs .is-on"),
  marked: await text(".shop-list li.is-want .shop-name"),
  priceLive: await page.locator('[data-qa="buy-quake"]').isEnabled(),
};

// The Store does not dead-end either: a price they cannot meet goes for credits.
await page.locator('[data-qa="buy-quake"]').click({ force: true });
await page.waitForTimeout(200);
results.afterQuake.tabAfterTap = await text(".shop-tabs .is-on");

// A stocked player still fires powers instead of buying them twice.
await start("stocked", {
  version: 4,
  onboarded: true,
  credits: 500,
  inv: { zap: 2, slow: 2, shield: 1, quake: 1, pick: 1 },
});
results.stocked = await pads();
await tap("slow");
results.afterSlow = {
  pads: await pads(),
  credits: await credits(),
  lit: (await page.locator('[data-qa="pwr-slow"]').getAttribute("class")).includes("is-lit"),
  banner: await text(".banner"),
};

console.log(JSON.stringify({ ...results, errors }, null, 2));

const pad = (list, id) => list.find((p) => p.id === `pwr-${id}`);
const fail = [];
const shield = pad(results.firstRun, "shield");
if (results.firstRun.some((p) => p.dead)) fail.push("a pad is still a dead grey button");
if (shield?.tell !== "70CR") fail.push("empty Shield does not show its price");
if (pad(results.firstRun, "quake")?.tell !== "90CR") fail.push("empty Quake hides its price");
if (!shield?.label?.includes("buy")) fail.push("empty Shield does not say it is for sale");
if (pad(results.afterShield.pads, "shield")?.tell !== "1")
  fail.push("the tap did not stock Shield");
if (results.afterShield.credits !== results.credits - 70) fail.push("Shield did not cost 70 CR");
if (results.afterShield.shopOpen)
  fail.push("a power they can cover still dragged them to the Store");
if (!results.afterQuake.shopOpen) fail.push("a power they cannot cover leads nowhere");
if (results.afterQuake.tab !== "Powers") fail.push("Store did not open on Powers");
if (results.afterQuake.marked !== "Quake")
  fail.push("Store does not point at the power they tapped");
if (!results.afterQuake.priceLive) fail.push("Store price is a dead button again");
if (results.afterQuake.tabAfterTap !== "Credits")
  fail.push("a short price does not lead to credits");
if (pad(results.stocked, "slow")?.tell !== "2") fail.push("owned Slow lost its count");
if (pad(results.afterSlow.pads, "slow")?.tell !== "1") fail.push("owned Slow did not spend");
if (!results.afterSlow.lit) fail.push("owned Slow did not fire");
if (results.afterSlow.credits !== 500) fail.push("firing a power spent credits");
// A stored save always differs from what the server guessed, so only the first run must be clean.
const firstRunErrors = errors.filter((e) => e.startsWith("first-run:"));
if (firstRunErrors.length) fail.push(`first-run page errors: ${firstRunErrors.join(" | ")}`);

if (fail.length) console.error(fail.map((f) => `- ${f}`).join("\n"));
await browser.close();
process.exit(fail.length ? 3 : 0);
