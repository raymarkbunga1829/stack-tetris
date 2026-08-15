#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:8080/?qa=1&coach=1";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);
  await page.locator(".well").click({ force: true });
  await page.waitForFunction(
    () => window.__controlsTest?.getPhase?.() === "playing",
    { timeout: 4000 },
  );
  await page.waitForTimeout(250);
  const coach1 = await page.locator(".coach-title").textContent();
  await page.screenshot({ path: "/workspace/screenshots/mobile-play.png" });
  await page.locator(".coach-skip").click({ force: true });
  await page.waitForTimeout(150);
  const coachGone = (await page.locator(".coach-card").count()) === 0;
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  console.log(JSON.stringify({ coach1, coachGone, overflow, errors }, null, 2));
  process.exit(!coach1 || !coachGone || overflow > 1 ? 3 : 0);
} finally {
  await browser.close();
}
