#!/usr/bin/env node
/**
 * Does an installed copy pick up a new deploy without a manual cache bump, and
 * still play offline afterwards?
 *
 * Builds the app twice (STACK_BUILD_ID=probe-a, then probe-b), serves each
 * build like Vercel does (static output first, then the server function), and
 * walks a phone through: install A -> deploy B -> resume -> "Update ready" pill
 * (hidden mid-run) -> tap -> running B with only B's cache -> server gone and
 * browser offline -> reload still plays B.
 * Usage: node scripts/sw-update-probe.mjs [chromium|webkit ...] (default both)
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { chromium, webkit } from "playwright";

const PORT = 8091;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const WORK = resolve("tmp/sw-probe");
const engines = { chromium, webkit };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["chromium", "webkit"];

const TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
};

function build(id) {
  const out = join(WORK, id);
  if (!existsSync(join(out, "static/sw.js"))) {
    console.log(`building ${id}...`);
    execSync("npx vite build", { stdio: "ignore", env: { ...process.env, STACK_BUILD_ID: id } });
    rmSync(out, { recursive: true, force: true });
    cpSync(".vercel/output", out, { recursive: true });
    // Without DATABASE_URL the function falls back to PGLite, whose data files
    // are not bundled (Vercel deploys use Postgres).
    for (const f of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
      cpSync(
        `node_modules/@electric-sql/pglite/dist/${f}`,
        join(out, "functions/__server.func/_libs", f),
      );
    }
  }
  return out;
}

process.on("unhandledRejection", (err) => console.error("[server]", String(err).split("\n")[0]));

const deploys = {};
let live = null;

async function handlerFor(dir) {
  deploys[dir] ??= (
    await import(pathToFileURL(join(dir, "functions/__server.func/index.mjs")).href)
  ).default;
  return deploys[dir];
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN);
    const file = join(live, "static", decodeURIComponent(url.pathname));
    if (url.pathname !== "/" && existsSync(file) && statSync(file).isFile()) {
      res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
      res.setHeader(
        "cache-control",
        url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      );
      res.end(readFileSync(file));
      return;
    }
    const handler = await handlerFor(live);
    const response = await handler.fetch(
      new Request(url, { method: req.method, headers: req.headers }),
      {},
    );
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
});

const listen = () => new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));
const close = () =>
  new Promise((ok) => {
    server.close(() => ok());
    server.closeAllConnections();
  });

const dirA = build("probe-a");
const dirB = build("probe-b");
const failures = [];

async function buildShown(page) {
  await page.locator('button[aria-label="Settings"]').click({ force: true });
  const text = await page.locator('[data-qa="build-id"]').innerText();
  await page.locator('[role="dialog"][aria-label="Settings"] button[aria-label="Close"]').click();
  return text.replace(/^Build\s+/, "");
}

const cacheNames = (page) => page.evaluate(() => caches.keys());

async function run(name) {
  const errors = [];
  const check = (ok, msg) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) errors.push(msg);
  };
  console.log(`\n[${name}]`);
  live = dirA;
  await listen();
  const browser = await engines[name].launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: name !== "firefox",
  });
  await ctx.addInitScript(
    (s) => {
      if (!localStorage.getItem("stack-tetris-v1")) localStorage.setItem("stack-tetris-v1", s);
    },
    JSON.stringify({ version: 4, onboarded: true, tipSeen: true, a2hs: true, mode: "marathon" }),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    const msg = e.message.split("\n")[0];
    if (!/Hydration|Minified React error #4(18|23|25)/.test(msg)) errors.push(`page: ${msg}`);
  });

  try {
    await page.goto(`${ORIGIN}/?qa=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
    check((await buildShown(page)) === "probe-a", "first visit runs build A");
    const cachesA = await cacheNames(page);
    check(
      cachesA.length === 1 && cachesA[0].startsWith("stack-offline-probe-a-"),
      `A cached as ${cachesA}`,
    );
    check(!(await page.locator('[data-qa="update-ready"]').count()), "no prompt on first install");

    // Deploy B, then resume the app (iOS fires visibilitychange, not a reload).
    await close();
    live = dirB;
    await listen();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const pill = page.locator('[data-qa="update-ready"]');
    await pill.waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(400);
    check(true, `pill shows on the title: "${await pill.innerText()}"`);
    await page.screenshot({ path: join(WORK, `${name}-title-pill.png`) });

    // A run hides the pill so a stray tap cannot throw the run away.
    await page.locator('[data-qa="play"]').click({ force: true });
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing");
    const skip = page.locator(".coach-skip");
    if (await skip.count()) await skip.click({ force: true });
    await page.waitForTimeout(300);
    check(!(await pill.count()), "pill stays hidden mid-run");
    check(
      (await page.evaluate(() => window.__controlsTest.getPhase())) === "playing",
      "run not interrupted",
    );

    // Top out to reach the game-over screen, where the pill should appear.
    await page.evaluate(
      () =>
        new Promise((done) => {
          let down = false;
          const t = setInterval(() => {
            down = !down;
            window.__controlsTest.setKeys(down ? ["Space"] : []);
            if (window.__controlsTest.getPhase() === "over") {
              clearInterval(t);
              window.__controlsTest.setKeys([]);
              done();
            }
          }, 50);
        }),
    );
    await pill.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(1500);
    const onTop = await page.evaluate(() => {
      const el = document.querySelector('[data-qa="update-ready"]');
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        hit: el.contains(hit),
        box: [r.left, r.top, r.width, r.height].map(Math.round),
        what: hit?.className,
      };
    });
    check(onTop.hit, `pill shows on top at game over (${JSON.stringify(onTop)})`);
    await page.screenshot({ path: join(WORK, `${name}-update-pill.png`) });

    await Promise.all([page.waitForEvent("load", { timeout: 15000 }), pill.tap()]);
    await page.waitForLoadState("networkidle");
    check((await buildShown(page)) === "probe-b", "after tap the page runs build B");
    const cachesB = await cacheNames(page);
    check(
      cachesB.length === 1 && cachesB[0].startsWith("stack-offline-probe-b-"),
      `only B cached: ${cachesB}`,
    );
    check(!(await page.locator('[data-qa="update-ready"]').count()), "pill gone after the update");

    // Offline: no server and no network. A cold reload must still play B.
    await close();
    // Playwright's WebKit fails any reload under setOffline, even with a trivial
    // worker, so WebKit relies on the server being gone.
    if (name !== "webkit") await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "title", null, {
      timeout: 15000,
    });
    check((await buildShown(page)) === "probe-b", "offline reload still runs build B");
    await page.locator('[data-qa="play"]').click({ force: true });
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", null, {
      timeout: 8000,
    });
    await page.evaluate(() => window.__controlsTest.tapLeft());
    await page.evaluate(() => window.__controlsTest.setKeys(["Space"]));
    await page.waitForFunction(() => window.__controlsTest.getScore() > 0, null, { timeout: 8000 });
    await page.evaluate(() => window.__controlsTest.setKeys([]));
    check(true, "offline run starts and scores");
    await page.screenshot({ path: join(WORK, `${name}-offline-play.png`) });
  } catch (err) {
    errors.push(`threw: ${err.message.split("\n")[0]}`);
  } finally {
    await browser.close();
    if (server.listening) await close();
  }
  for (const e of errors) failures.push(`${name}: ${e}`);
}

for (const name of wanted) await run(name);

if (failures.length) {
  console.error(`\nFAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nPASS");
process.exit(0);
