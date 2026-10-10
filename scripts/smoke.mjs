#!/usr/bin/env node
/**
 * Core smoke suite: the handful of things that must work on every deploy.
 *
 *   start      Start is on the title, and a tap on it starts a live run
 *   watch      Watch bot plays: the well is not blank and the clock ticks
 *   es-off     ES bot Off keeps Bot/Watch off the title (and On brings it back)
 *   pause-modes Pause → Modes opens exactly one overlay, and Close goes back
 *   drop-tap   A tap on the Drop pad hard-drops, every time
 *
 * Each check gets a fresh phone context loaded through smoke-kit's `openApp`,
 * which waits for hydration to settle instead of sleeping. No retries: a check
 * that only passes the second time is a failure worth seeing.
 *
 * Usage: npm run smoke -- [url] [--only start,watch] [--out dir]
 *   url defaults to $SMOKE_URL, then http://127.0.0.1:8080/
 *   VERCEL_AUTOMATION_BYPASS_SECRET is sent to protected Vercel Previews.
 * Exit 0 all passed, 1 any check failed.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  RETURNING,
  documentStarts,
  launchBrowser,
  openApp,
  press,
  startRun,
  waitPhase,
  waitVisible,
} from "./smoke-kit.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const only = flag("--only")?.split(",").map((s) => s.trim());
const outDir = resolve(flag("--out") || process.env.SMOKE_OUT || "smoke-results");
const url = args[0] || process.env.SMOKE_URL || "http://127.0.0.1:8080/";

/** Throw with a readable reason; the runner catches it per check. */
function expect(cond, message) {
  if (!cond) throw new Error(message);
}

const look = (page) =>
  page.evaluate(() => {
    const t = window.__controlsTest;
    return {
      phase: t?.getPhase?.() ?? null,
      mode: t?.getMode?.() ?? null,
      score: t?.getScore?.() ?? 0,
      clock: t?.getClock?.() ?? 0,
      piece: t?.getPiece?.() ?? null,
      well: t?.getWell?.() ?? null,
    };
  });

/**
 * How much variety the well canvas actually shows on screen. A blank or
 * context-lost WebGL canvas reads as one flat colour; a live well does not.
 */
async function wellPixels(page) {
  const canvas = page.locator(".well canvas").first();
  const shot = (await canvas.screenshot({ timeout: 5000 })).toString("base64");
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let sum = 0;
    let sq = 0;
    let max = 0;
    const shades = new Set();
    for (let i = 0; i < d.length; i += 16) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n += 1;
      sum += l;
      sq += l * l;
      if (l > max) max = l;
      shades.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
    }
    const mean = sum / n;
    return {
      w: c.width,
      h: c.height,
      sd: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean)) * 10) / 10,
      max: Math.round(max),
      shades: shades.size,
    };
  }, shot);
}

/** Every visible full-screen overlay: title/pause/recap veils and sheets. */
const overlays = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".veil, .shop-veil")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
      })
      .map((el) => el.className),
  );

const CHECKS = [
  {
    id: "start",
    title: "Start button visible and starts a run",
    async run({ open }) {
      const { page } = await open({ save: RETURNING });
      const play = page.locator('[data-qa="play"]');
      expect(await play.isVisible(), "Start button is not visible on the title");
      const label = (await play.innerText()).trim();
      expect(/^start$/i.test(label), `Start button reads "${label}"`);
      const box = await play.boundingBox();
      expect(box && box.width >= 44 && box.height >= 32, `Start button is too small to tap (${JSON.stringify(box)})`);
      await startRun(page);
      const s = await look(page);
      expect(s.mode === "marathon", `run started in ${s.mode}, wanted marathon`);
      expect(!!s.piece, "run is live but no piece is falling");
      return { label };
    },
  },
  {
    id: "watch",
    title: "Watch well not blank, clock ticking",
    async run({ open }) {
      const { page } = await open({ save: { ...RETURNING, botPlay: true } });
      await startRun(page, '[data-qa="watch-bot"]');
      await page.waitForFunction(
        () =>
          window.__controlsTest.getMode() === "watch" && window.__controlsTest.getScore() > 0,
        null,
        { timeout: 15000, polling: 100 },
      );
      const a = await look(page);
      await page.waitForTimeout(1500);
      const b = await look(page);
      const ticked = b.clock - a.clock;
      expect(b.phase === "playing", `Watch run left play (phase ${b.phase})`);
      expect(ticked >= 1, `clock moved ${ticked.toFixed(2)}s in 1.5s of Watch`);
      expect(b.score >= a.score, `score went backwards (${a.score} → ${b.score})`);
      expect(b.well && !b.well.lost, "well renderer lost its WebGL context");
      expect((b.well?.cells ?? 0) > 0, `well drew 0 cells (${JSON.stringify(b.well)})`);
      expect((b.well?.w ?? 0) >= 64 && (b.well?.h ?? 0) >= 64, `well canvas is ${b.well?.w}×${b.well?.h}`);
      const px = await wellPixels(page);
      expect(px.sd >= 3 && px.shades >= 8 && px.max >= 40, `well canvas looks blank on screen ${JSON.stringify(px)}`);
      return { clockTicked: Number(ticked.toFixed(2)), score: b.score, cells: b.well.cells, pixels: px };
    },
  },
  {
    id: "es-off",
    title: "ES Off hides title Bot/Watch entries",
    async run({ open }) {
      const { page } = await open({ save: { ...RETURNING, botPlay: false } });
      const botEntries = async () => ({
        watch: await page.locator('[data-qa="watch-bot"]').isVisible(),
        botPlays: await page.locator('[data-qa="bot-plays"]').count(),
        start: (await page.locator('[data-qa="play"]').innerText()).trim(),
      });
      const off = await botEntries();
      expect(!off.watch, "Watch bot is on the title with ES bot Off");
      expect(!off.botPlays, "a Bot plays entry is on the title with ES bot Off");
      expect(!/watch|bot/i.test(off.start), `Start reads "${off.start}" with ES bot Off`);

      const toggle = async (want) => {
        await press(page, 'button[aria-label="Settings"]');
        await waitVisible(page, '[data-qa="set-bot"]', "the ES bot row in Settings");
        const row = page.locator('[data-qa="set-bot"]');
        await row.tap();
        await page.waitForFunction((w) => window.__controlsTest.getBot() === w, want, { timeout: 3000 });
        const said = (await row.locator("b").innerText()).trim();
        expect(said === (want ? "On" : "Off"), `ES bot row reads "${said}" after turning it ${want ? "On" : "Off"}`);
        await press(page, ".shop-veil .shop-x");
        await page.locator(".shop-veil").waitFor({ state: "detached", timeout: 3000 });
      };

      // Prove the check can see the entry at all, then that Off takes it away again.
      await toggle(true);
      const on = await botEntries();
      expect(on.watch, "Watch bot did not appear on the title after ES bot On");
      await toggle(false);
      const offAgain = await botEntries();
      expect(!offAgain.watch, "Watch bot stayed on the title after ES bot Off");
      expect(!/watch|bot/i.test(offAgain.start), `Start reads "${offAgain.start}" after ES bot Off`);
      return { off, on, offAgain };
    },
  },
  {
    id: "pause-modes",
    title: "Pause → Modes opens a single overlay",
    async run({ open }) {
      const { page } = await open({ save: RETURNING });
      await startRun(page);
      await press(page, "button.hud-pause");
      await waitPhase(page, "paused", 4000);
      await waitVisible(page, ".pause-card", "the Paused card");
      const before = await page.evaluate(() => window.__controlsTest.getMode());

      await press(page, '[data-qa="pause-modes"]');
      await waitVisible(page, ".shop-veil.is-modes", "the Modes sheet (opened from Pause)");
      // Let any click that trails the pointerdown land, so it cannot hide a pick-through.
      await page.waitForTimeout(500);
      const shown = await overlays(page);
      const sheets = await page.locator(".shop-veil.is-modes").count();
      const after = await page.evaluate(() => ({
        phase: window.__controlsTest.getPhase(),
        mode: window.__controlsTest.getMode(),
        modes: document.querySelectorAll('.shop-veil [data-qa^="sheet-mode-"]').length,
      }));
      expect(sheets === 1, `${sheets} Modes sheets are mounted`);
      expect(shown.length === 1, `${shown.length} overlays are showing: ${JSON.stringify(shown)}`);
      expect(/shop-veil/.test(shown[0] ?? ""), `the overlay on screen is "${shown[0]}", not the Modes sheet`);
      expect(after.phase === "paused", `opening Modes moved the run to ${after.phase}`);
      expect(after.mode === before, `opening Modes switched the mode to ${after.mode}`);
      expect(after.modes >= 4, `the Modes sheet lists ${after.modes} modes`);

      await press(page, ".shop-veil .shop-x");
      await page.locator(".shop-veil").waitFor({ state: "detached", timeout: 3000 });
      const back = await overlays(page);
      expect(back.length === 1 && /is-pause/.test(back[0]), `after Close: ${JSON.stringify(back)}`);
      expect((await page.evaluate(() => window.__controlsTest.getPhase())) === "paused", "Close dropped the pause");
      return { overlays: shown, modes: after.modes };
    },
  },
  {
    id: "drop-tap",
    title: "Drop tap hard-drops",
    async run({ open }) {
      const { page } = await open({ save: RETURNING });
      await startRun(page);
      await waitVisible(page, '[data-qa="pad-hard"]', "the Drop pad");
      const drop = page.locator('[data-qa="pad-hard"]');
      const taps = [];
      for (let i = 0; i < 5; i++) {
        const a = await look(page);
        expect(a.phase === "playing", `run left play before tap ${i + 1} (${a.phase})`);
        await drop.tap();
        // A hard drop scores 2 per row fallen, so the score is proof it landed.
        await page.waitForFunction((s) => window.__controlsTest.getScore() > s, a.score, { timeout: 2000 }).catch(() => undefined);
        const b = await look(page);
        taps.push({ before: a.score, after: b.score });
        expect(b.score > a.score, `tap ${i + 1} on Drop did nothing (score ${a.score} → ${b.score})`);
        await page.waitForTimeout(150);
      }
      return { taps };
    },
  },
  {
    id: "no-reload",
    title: "First visit does not reload itself",
    async run({ open }) {
      // The one check that lets the service worker in: its first install used to
      // swap itself in and reload the title, eating whatever the player tapped.
      // It was a race (whether the page was listening when the new worker hit
      // "installed"), so a pass here is necessary, not sufficient.
      const { page } = await open({ save: RETURNING, serviceWorkers: "allow" });
      const controlled = await page
        .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 })
        .then(() => true, () => false);
      await page.waitForTimeout(2000);
      const loads = await documentStarts(page);
      expect(loads === 1, `the page loaded ${loads} times on a first visit`);
      expect(
        (await page.evaluate(() => window.__controlsTest?.getPhase?.())) === "title",
        "the title did not survive the service worker taking over",
      );
      return { controlled, loads };
    },
  },
];

async function main() {
  const picked = only ? CHECKS.filter((c) => only.includes(c.id)) : CHECKS;
  if (!picked.length) throw new Error(`--only matched nothing; checks are ${CHECKS.map((c) => c.id).join(", ")}`);
  mkdirSync(outDir, { recursive: true });
  console.log(`smoke: ${url} (${picked.length} checks)`);

  const browser = await launchBrowser();
  const results = [];
  try {
    for (const check of picked) {
      const started = Date.now();
      const opened = [];
      const open = async (o) => {
        const app = await openApp(browser, url, { label: check.id, ...o });
        opened.push(app);
        return app;
      };
      const result = { id: check.id, title: check.title, ok: false };
      try {
        result.details = await check.run({ open });
        const errors = opened.flatMap((a) => a.issues.errors);
        expect(!errors.length, `page errors: ${errors.join(" | ")}`);
        result.ok = true;
      } catch (err) {
        result.error = String(err?.message || err).split("\n")[0];
        const page = opened.at(-1)?.page;
        if (page) {
          const shot = join(outDir, `${check.id}.png`);
          await page.screenshot({ path: shot }).then(() => (result.screenshot = shot), () => undefined);
        }
      } finally {
        result.ms = Date.now() - started;
        result.hydrationWarnings = opened.reduce((n, a) => n + a.issues.hydration.length, 0);
        result.reloads = 0;
        for (const a of opened) {
          result.reloads += Math.max(0, (await documentStarts(a.page).catch(() => 1)) - 1);
        }
        for (const a of opened) await a.ctx.close().catch(() => undefined);
      }
      results.push(result);
      const tail = result.ok ? "" : `\n      ${result.error}`;
      console.log(`  ${result.ok ? "PASS" : "FAIL"}  ${check.id.padEnd(12)} ${check.title} (${(result.ms / 1000).toFixed(1)}s)${tail}`);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  const report = { url, ok: !failed.length, at: new Date().toISOString(), results };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeSummary(report);
  console.log(failed.length ? `smoke: ${failed.length} of ${results.length} failed` : `smoke: all ${results.length} passed`);
  return failed.length ? 1 : 0;
}

function writeSummary(report) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const rows = report.results.map(
    (r) =>
      `| ${r.ok ? "PASS" : "**FAIL**"} | \`${r.id}\` | ${r.title} | ${(r.ms / 1000).toFixed(1)}s | ${r.ok ? "" : String(r.error).replace(/\|/g, "\\|")} |`,
  );
  const hydration = report.results.reduce((n, r) => n + r.hydrationWarnings, 0);
  appendFileSync(
    file,
    [
      `### Smoke ${report.ok ? "passed" : "failed"}`,
      "",
      `Target: ${report.url}`,
      "",
      "| | Check | What | Time | Failure |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      hydration ? `_${hydration} hydration warning(s) seen and ignored (stored save vs. server markup)._` : "",
      "",
    ].join("\n"),
  );
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`smoke: ${String(err?.stack || err)}`);
    process.exit(1);
  },
);
