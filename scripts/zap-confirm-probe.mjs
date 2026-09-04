#!/usr/bin/env node
/**
 * Does Zap wait for a second tap before it spends the charge?
 *
 * Zap clears a row and you start with one. A thumb grazing the pad during a
 * drop used to spend it with nothing to show, and the next time you wanted it
 * the slot was a price tag. So this one stacks a floor, taps Zap the way a
 * thumb does, and asks whether the charge is still there and the pad is asking.
 * Then it taps again and the floor has to go and the charge has to go with it.
 * A tap on an empty well must spend nothing. Quake, which is the same shape
 * twice as wide, has to ask the same way when you actually own one.
 * Usage: node scripts/zap-confirm-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
let page;

const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
  inv: { zap: 1, slow: 1, shield: 0, quake: 1, pick: 1 },
};

const start = async (label) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await ctx.newPage();
  await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(SAVE));
  page.on("pageerror", (e) => {
    const msg = e.message.split("\n")[0];
    if (/Hydration failed|Minified React error #418|#423|#425/.test(msg)) return;
    errors.push(`${label}: ${msg}`);
  });
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

const tap = (sel) =>
  page.locator(sel).dispatchEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" });

const look = () =>
  page.evaluate(() => {
    const zap = document.querySelector('[data-qa="pwr-zap"]');
    const quake = document.querySelector('[data-qa="pwr-quake"]');
    const text = document.body.innerText;
    return {
      phase: window.__controlsTest.getPhase(),
      zap: window.__controlsTest.getZap(),
      zapAsk: !!zap?.classList.contains("is-ask"),
      zapLabel: zap?.getAttribute("aria-label") || "",
      quakeAsk: !!quake?.classList.contains("is-ask"),
      quakeLabel: quake?.getAttribute("aria-label") || "",
      asking: /Zap\? tap again|Quake\? tap again/i.test(text),
      fired: /\bZAP\b|\bQUAKE\b/.test(text),
      empty: /Nothing to clear/i.test(text),
    };
  });

const stackFloor = async () => {
  for (let i = 0; i < 6; i++) {
    await page.evaluate((n) => {
      const t = window.__controlsTest;
      const steps = (n % 5) - 2;
      for (let k = 0; k < Math.abs(steps); k++) (steps < 0 ? t.tapLeft : t.tapRight)();
    }, i);
    await tap('[data-qa="pad-hard"]');
    await page.waitForTimeout(280);
  }
};

try {
  await start("arm");
  await stackFloor();
  const before = await look();
  if (before.phase !== "playing") errors.push(`arm: not playing (${before.phase})`);
  if (before.zap !== 1) errors.push(`arm: started with ${before.zap} Zap, wanted 1`);

  await tap('[data-qa="pwr-zap"]');
  await page.waitForTimeout(150);
  const armed = await look();
  if (!armed.zapAsk) errors.push(`arm: Zap pad did not take is-ask, label="${armed.zapLabel}"`);
  if (!armed.asking) errors.push("arm: well did not say Zap? tap again");
  if (armed.zap !== 1) errors.push(`arm: first tap spent the charge (${armed.zap} left)`);

  await tap('[data-qa="pwr-zap"]');
  await page.waitForTimeout(250);
  const fired = await look();
  if (fired.zapAsk) errors.push("fire: Zap still armed after the second tap");
  if (fired.zap !== 0) errors.push(`fire: charge still ${fired.zap} after confirm`);
  if (!/none left|buy/.test(fired.zapLabel)) {
    errors.push(`fire: empty pad did not say buy, label="${fired.zapLabel}"`);
  }

  await page.context().close();

  await start("empty");
  await tap('[data-qa="pwr-zap"]');
  await page.waitForTimeout(150);
  const empty = await look();
  if (empty.zap !== 1) errors.push(`empty: spent Zap on a bare well (${empty.zap} left)`);
  if (empty.zapAsk) errors.push("empty: armed Zap with nothing to clear");
  if (!empty.empty) errors.push("empty: well did not say Nothing to clear");

  await tap('[data-qa="pwr-quake"]');
  await page.waitForTimeout(150);
  const qEmpty = await look();
  if (qEmpty.quakeAsk) errors.push("empty: armed Quake with nothing to clear");

  await page.context().close();

  await start("quake");
  await stackFloor();
  await tap('[data-qa="pwr-quake"]');
  await page.waitForTimeout(150);
  const qArm = await look();
  if (!qArm.quakeAsk) errors.push(`quake: pad did not ask, label="${qArm.quakeLabel}"`);
  if (!/Quake\? tap again/i.test(await page.evaluate(() => document.body.innerText))) {
    errors.push("quake: well did not say Quake? tap again");
  }
  await tap('[data-qa="pwr-quake"]');
  await page.waitForTimeout(250);
  const qFire = await look();
  if (qFire.quakeAsk) errors.push("quake: still armed after confirm");
  if (!/none left|buy/.test(qFire.quakeLabel)) {
    errors.push(`quake: charge not spent, label="${qFire.quakeLabel}"`);
  }
} catch (err) {
  errors.push(String(err).split("\n")[0]);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("zap-confirm-probe: ok");
