#!/usr/bin/env node
/**
 * Do HOLD and NEXT hug the well on a desk, without moving the phone?
 *
 * Desktop play used to stretch a 1100px / 1fr stage so the rails sat on the
 * outer edges while the 10×20 field sat in the middle. This opens Marathon
 * at the two desk sizes and asks that the rails sit flush against the well
 * and the cabinet shrink to that assembly. Then it opens a 390px phone and
 * checks the rails and pad did not pick up the desk columns.
 * Usage: node scripts/desktop-layout-probe.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const errors = [];
const SAVE = {
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
};

const boxOf = async (page, sel) =>
  page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
  });

const measure = async (page) => {
  const [cabinet, stage, well, hold, next, pad] = await Promise.all([
    boxOf(page, ".cabinet"),
    boxOf(page, ".stage"),
    boxOf(page, ".well"),
    boxOf(page, ".stage > .rail:first-of-type"),
    boxOf(page, ".stage > .rail.rail-next, .stage > .rail:last-of-type"),
    page.locator(".pad").evaluate((el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        display: style.display,
        w: r.width,
        h: r.height,
        visible: style.display !== "none" && r.height > 0,
      };
    }),
  ]);
  return { cabinet, stage, well, hold, next, pad };
};

const start = async (label, { width, height, phone }) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: !!phone,
    isMobile: !!phone,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(SAVE));
  page.on("pageerror", (e) => {
    const msg = e.message.split("\n")[0];
    if (/Hydration failed|Minified React error #418|#423|#425/.test(msg)) return;
    errors.push(`${label}: ${msg}`);
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);
  await page.locator('[data-qa="play"]').click({ force: true });
  await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", {
    timeout: 8000,
  });
  await page.waitForTimeout(400);
  return { ctx, page };
};

const hug = (label, m) => {
  const holdGap = Math.abs(m.well.x - m.hold.r);
  const nextGap = Math.abs(m.next.x - m.well.r);
  if (holdGap > 2) errors.push(`${label}: HOLD is ${holdGap.toFixed(1)}px off the well`);
  if (nextGap > 2) errors.push(`${label}: NEXT is ${nextGap.toFixed(1)}px off the well`);
  const leftover = m.stage.w - (m.hold.w + m.well.w + m.next.w);
  if (leftover > 8) {
    errors.push(`${label}: stage still has ${leftover.toFixed(1)}px of empty rail gutter`);
  }
};

try {
  for (const viewport of [
    { width: 1024, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    const label = `${viewport.width}x${viewport.height}`;
    const { ctx, page } = await start(label, { ...viewport, phone: false });
    const m = await measure(page);
    hug(label, m);
    const ratio = m.well.w / Math.max(1, m.well.h);
    if (ratio < 0.45 || ratio > 0.55) {
      errors.push(`${label}: well is ${m.well.w.toFixed(0)}×${m.well.h.toFixed(0)}, not a 1×2 screen`);
    }
    const pageGutter = viewport.width - m.cabinet.w;
    if (m.cabinet.w > 900) {
      errors.push(`${label}: cabinet is ${m.cabinet.w.toFixed(0)}px — still the wide 1100 card`);
    }
    if (pageGutter < 0) {
      errors.push(`${label}: cabinet overflowed the page`);
    }
    if (m.pad.visible) {
      errors.push(`${label}: desk keys play showed the pad`);
    }
    console.log(
      `${label}: cabinet ${m.cabinet.w.toFixed(0)}×${m.cabinet.h.toFixed(0)} well ${m.well.w.toFixed(0)}×${m.well.h.toFixed(0)} hold-gap ${(m.well.x - m.hold.r).toFixed(1)} next-gap ${(m.next.x - m.well.r).toFixed(1)} page-gutter ${pageGutter.toFixed(0)}`,
    );
    await ctx.close();
  }

  const phone = await start("phone", { width: 390, height: 844, phone: true });
  const p = await measure(phone.page);
  if (Math.abs(p.hold.w - 48) > 2) {
    errors.push(`phone: HOLD rail is ${p.hold.w.toFixed(0)}px, expected 48`);
  }
  if (Math.abs(p.next.w - 48) > 2) {
    errors.push(`phone: NEXT rail is ${p.next.w.toFixed(0)}px, expected 48`);
  }
  if (Math.abs(p.cabinet.w - 390) > 2) {
    errors.push(`phone: cabinet is ${p.cabinet.w.toFixed(0)}px, expected full 390`);
  }
  if (!p.pad.visible) {
    errors.push("phone: pad is gone");
  }
  const phoneHoldGap = p.well.x - p.hold.r;
  if (phoneHoldGap < 4 || phoneHoldGap > 8) {
    errors.push(`phone: HOLD/well gap is ${phoneHoldGap.toFixed(1)}px, expected the 6px stage gap`);
  }
  console.log(
    `phone: cabinet ${p.cabinet.w.toFixed(0)} rails ${p.hold.w.toFixed(0)}/${p.next.w.toFixed(0)} pad ${p.pad.visible} hold-gap ${phoneHoldGap.toFixed(1)}`,
  );
  await phone.ctx.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("desktop-layout-probe: ok");
