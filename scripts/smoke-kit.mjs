/**
 * Shared page loader for the smoke suite and the hand-run probes.
 *
 * Why not `goto(url, { waitUntil: "networkidle" }) + waitForTimeout(500)`:
 * - networkidle waits on the service worker's precache and any audio stream,
 *   so it is slow at best and never settles at worst;
 * - a fixed sleep does not know whether React has attached its handlers. Every
 *   cabinet button fires on pointerdown, so a tap on server-rendered markup is
 *   silently dropped and the run times out waiting for "playing";
 * - a page that reloads itself (service-worker swap) throws away the hook and
 *   every handler mid-test.
 *
 * `openApp` instead waits for the client-only test hook (`window.__controlsTest`,
 * installed by an effect after hydration commits), then for a quiet window in
 * which no document load happens and neither the hook nor the Start button
 * node is replaced. Only then is the page handed to a test.
 */
import { chromium } from "playwright";

export const SAVE_KEY = "stack-tetris-v1";

/** A returning player on a phone: coach, tips and the install nag already seen. */
export const RETURNING = Object.freeze({
  version: 4,
  onboarded: true,
  tipSeen: true,
  a2hs: true,
  mode: "marathon",
  credits: 80,
});

export const PHONE = Object.freeze({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});

/**
 * React 19 reports a server/client markup mismatch (#418, plus #423/#425 for
 * the text variants) and then client-renders. Every run starts from a stored
 * save the server could not know about, so this is expected, not a crash.
 */
const HYDRATION_NOISE = /Hydration failed|hydrat|Minified React error #(418|423|425)/i;
export const isHydrationNoise = (msg) => HYDRATION_NOISE.test(msg);

export function launchBrowser() {
  return chromium.launch({
    headless: process.env.HEADED !== "1",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/** `?qa=1` turns on the test hook in production builds. */
export function withQa(url) {
  const u = new URL(url);
  if (!u.searchParams.has("qa")) u.searchParams.set("qa", "1");
  return u.toString();
}

/**
 * Vercel Preview deployments sit behind Deployment Protection. With a
 * "Protection Bypass for Automation" secret, send it on same-origin requests
 * only (a custom header on cross-origin fetches would trigger CORS preflights),
 * and ask Vercel for the bypass cookie so service-worker fetches pass too.
 */
async function applyVercelBypass(ctx, url) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return;
  const origin = new URL(url).origin;
  await ctx.route(
    (u) => u.origin === origin,
    (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-vercel-protection-bypass": secret,
          "x-vercel-set-bypass-cookie": "true",
        },
      }),
  );
}

/**
 * Fresh phone context + page, loaded and settled.
 *
 * Returns `{ ctx, page, issues }`. `issues.errors` (or `opts.errors`, if a
 * caller wants them in its own list) collects real page errors;
 * `issues.hydration` collects hydration warnings; `issues.loads` counts document
 * loads (more than one means the page reloaded itself).
 */
export async function openApp(browser, url, opts = {}) {
  const {
    save = RETURNING,
    label = "page",
    serviceWorkers = "block",
    timeoutMs = Number(process.env.SMOKE_LOAD_TIMEOUT_MS || 45000),
    quietMs = 700,
    context = {},
  } = opts;
  const ctx = await browser.newContext({ ...PHONE, serviceWorkers, ...context });
  await applyVercelBypass(ctx, url);
  const page = await ctx.newPage();
  // Counts every document that starts, including a reload that lands before
  // the first `load` event would have fired.
  await page.addInitScript(() => {
    const n = Number(sessionStorage.getItem("__smoke_docs") || 0) + 1;
    sessionStorage.setItem("__smoke_docs", String(n));
  });
  if (save) {
    await page.addInitScript(
      ([k, s]) => {
        // Only on the first document, so a reload does not clobber in-run saves.
        if (!sessionStorage.getItem("__smoke_seeded")) {
          localStorage.setItem(k, s);
          sessionStorage.setItem("__smoke_seeded", "1");
        }
      },
      [SAVE_KEY, JSON.stringify(save)],
    );
  }

  const issues = { errors: opts.errors ?? [], hydration: [], loads: 0 };
  page.on("load", () => {
    issues.loads += 1;
  });
  page.on("pageerror", (e) => {
    const msg = String(e?.message || e).split("\n")[0];
    (isHydrationNoise(msg) ? issues.hydration : issues.errors).push(`${label}: ${msg}`);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const msg = m.text().split("\n")[0];
    if (isHydrationNoise(msg)) issues.hydration.push(`${label}: ${msg}`);
  });

  const target = withQa(url);
  const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const status = resp?.status() ?? 0;
  if (status >= 400 || status === 0) {
    const body = (await page.content().catch(() => "")).slice(0, 2000);
    const hint = /Vercel Authentication|sso-api|vercel\.com\/login/i.test(body + page.url())
      ? " (Vercel Deployment Protection: set VERCEL_AUTOMATION_BYPASS_SECRET)"
      : "";
    throw new Error(`${label}: GET ${target} returned ${status}${hint}`);
  }
  if (/vercel\.com\/(sso-api|login)/.test(page.url())) {
    throw new Error(
      `${label}: redirected to Vercel login — the deployment is protected; set VERCEL_AUTOMATION_BYPASS_SECRET`,
    );
  }
  await settle(page, issues, { timeoutMs, quietMs, label });
  return { ctx, page, issues };
}

/** Wait until the page is hydrated and has stopped changing underneath us. */
export async function settle(page, issues, { timeoutMs = 45000, quietMs = 700, label = "page" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    try {
      await page.waitForFunction(
        () =>
          document.readyState === "complete" &&
          typeof window.__controlsTest?.getPhase === "function" &&
          !!document.querySelector('[data-qa="play"], .hud-pause'),
        null,
        { timeout: left, polling: 100 },
      );
    } catch {
      break;
    }
    const loadsBefore = issues.loads;
    const stable = await page
      .evaluate(async (ms) => {
        const hook = window.__controlsTest;
        const node = document.querySelector('[data-qa="play"], .hud-pause');
        await new Promise((r) => setTimeout(r, ms));
        // Two frames so a commit scheduled in the same tick has landed.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return (
          window.__controlsTest === hook &&
          document.querySelector('[data-qa="play"], .hud-pause') === node &&
          !!node?.isConnected
        );
      }, quietMs)
      .catch(() => false); // a navigation destroyed the context: go round again
    if (stable && issues.loads === loadsBefore) return;
  }
  const state = await page
    .evaluate(() => ({
      readyState: document.readyState,
      hook: !!window.__controlsTest,
      play: !!document.querySelector('[data-qa="play"]'),
      url: location.href,
    }))
    .catch((e) => ({ error: String(e).split("\n")[0] }));
  throw new Error(`${label}: page never settled within ${timeoutMs}ms ${JSON.stringify(state)}`);
}

/** How many documents this tab has started (1 = never reloaded). */
export const documentStarts = (page) =>
  page.evaluate(() => Number(sessionStorage.getItem("__smoke_docs") || 0));

/** Wait for `selector` to show; on timeout say what was on screen instead. */
export async function waitVisible(page, selector, what, timeout = 4000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
  } catch {
    const seen = await page
      .evaluate(() => ({
        phase: window.__controlsTest?.getPhase?.() ?? null,
        mode: window.__controlsTest?.getMode?.() ?? null,
        overlays: [...document.querySelectorAll(".veil, .shop-veil")].map((el) => el.className),
      }))
      .catch(() => ({}));
    throw new Error(`${what} did not show within ${timeout}ms (saw ${JSON.stringify(seen)})`);
  }
}

export const phase = (page) => page.evaluate(() => window.__controlsTest?.getPhase?.() ?? null);

export async function waitPhase(page, want, timeout = 8000) {
  try {
    await page.waitForFunction((w) => window.__controlsTest?.getPhase?.() === w, want, {
      timeout,
      polling: 50,
    });
  } catch {
    throw new Error(`phase stayed "${await phase(page).catch(() => "?")}" for ${timeout}ms, wanted "${want}"`);
  }
}

/** Press a cabinet button the way a finger does (they all fire on pointerdown). */
export async function press(page, selector) {
  await waitVisible(page, selector, `"${selector}"`, 5000);
  await page.locator(selector).first().tap();
}

/** Start a run from the title and wait until it is live; skip the coach if it shows. */
export async function startRun(page, selector = '[data-qa="play"]') {
  await press(page, selector);
  await waitPhase(page, "playing");
  const skip = page.locator(".coach-skip");
  if (await skip.count()) await skip.first().tap({ force: true }).catch(() => undefined);
}
