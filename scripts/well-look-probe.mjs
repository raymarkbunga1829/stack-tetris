#!/usr/bin/env node
/**
 * Do minos keep their skin colour, and is the ghost visible, in every skin and state?
 *
 * Stages a fixed stack, falling piece and ghost in each skin on a phone and a
 * desktop viewport, then samples every mino's face from a real screenshot (DOM
 * overlays included) and checks it against the skin colour: same hue, most of
 * the chroma, no white lift. Dark or grey skins are checked for contrast with
 * the pit instead. The same stack is then pushed into danger, cleared (single
 * and double, sampled through the sweep) and locked with a hard-drop flash,
 * and Watch bot play is sampled through its own clears.
 *
 * Time runs on Playwright's fake clock, so every staged frame is the same frame
 * on every run. The steady "play" frame per skin is compared with the saved
 * reference in scripts/well-look/, so a later change that shifts mino colour
 * fails here even if it stays inside the absolute limits.
 *
 * Usage: node scripts/well-look-probe.mjs [url] [outDir]
 *   UPDATE=1   rewrite the references from this run
 *   SKINS=ink,neon   only these skins
 *   ONLY=phone|desktop   one viewport
 *   WATCH=0    skip Watch bot sampling
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(HERE, "well-look");
const url = checkedUrl(process.argv[2] || "http://127.0.0.1:8080/?qa=1");
const out = process.argv[3] || "/tmp/well-look";
const update = process.env.UPDATE === "1";
mkdirSync(out, { recursive: true });
if (update) mkdirSync(REF_DIR, { recursive: true });

const themesSrc = readFileSync(join(HERE, "../src/game/themes.ts"), "utf8");
const THEMES = parseThemes(themesSrc);
const SKINS = (process.env.SKINS || Object.keys(THEMES).join(",")).split(",");

/** A mino keeps its hue, most of its chroma, and gains little white. */
export const LIMITS = {
  hueDeg: 28,
  chromaRatio: 0.72,
  whiteLift: 0.14,
  /** Grey / dark skins: sRGB distance between a mino face and the bare pit. */
  pitContrast: 0.1,
  /** Ghost outline: sRGB distance from the pit it sits on. */
  ghostContrast: 0.22,
  /** Steady frame vs saved reference, per mino, sRGB distance x255. */
  refDelta: 22,
  /** Share of minos that must pass in a moving (Watch / clear) frame. */
  passShare: 0.9,
};

const PLAY = ["..........", "..........", "ZZ.....LL.", "ZZ.....LLJ", "IIOOTT.SSJ", "IIOOTT.SSJ"];
const PLAY_PIECE = { id: "T", rot: 0, x: 1, y: 6 };
const SINGLE = ["..........", "..........", "ZZ.....LL.", "ZZ.....LLJ", "IIOO.T.SSJ", "IIOOTT.SSJ"];
const DROP_I = { id: "I", rot: 1, x: 4, y: 3 };
const DANGER = [
  "ZZ.....LL.",
  "ZZS....LLJ",
  "TSS..OO.JJ",
  "TTT..OO.LJ",
  "IIII..ZZL.",
  "JJ.SS..ZZL",
  "J.SS.OO.LL",
  "JTTT.OO.IL",
  "ZZT..LLLI.",
  ".ZZ.JL..IS",
  "OO..JJJ.SS",
  "OO.IIII..S",
  "LLL.TTT.ZZ",
  "L..SST..JZ",
  "IIOOTT.SSJ",
  "IIOOTT.SSJ",
];

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, dpr: 2 },
  { name: "desktop", viewport: { width: 1024, height: 640 }, hasTouch: false, isMobile: false, dpr: 1 },
].filter((s) => !process.env.ONLY || s.name === process.env.ONLY);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const failures = [];
const report = [];

try {
  for (const skin of SKINS) {
    const theme = THEMES[skin];
    if (!theme) throw new Error(`unknown skin ${skin}`);
    for (const size of SIZES) {
      for (const clearWell of size.name === "phone" ? [true, false] : [true]) {
        await runCase(skin, theme, size, clearWell);
      }
    }
  }
  if (process.env.WATCH !== "0") {
    for (const skin of SKINS.filter((s) => ["ink", "night", "neon", "citrine"].includes(s))) {
      await runWatch(skin, THEMES[skin]);
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`${failures.length} well-look failures:\n` + failures.slice(0, 80).join("\n"));
  process.exit(1);
}
console.log(`ok: ${report.length} frames, screenshots in ${out}${update ? `, references in ${REF_DIR}` : ""}`);

async function openPage(skin, size, save) {
  const ctx = await browser.newContext({
    viewport: size.viewport,
    hasTouch: size.hasTouch,
    isMobile: size.isMobile,
    deviceScaleFactor: size.dpr,
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.addInitScript((s) => localStorage.setItem("stack-tetris-v1", s), JSON.stringify(save));
  const errs = [];
  page.on("pageerror", (e) => {
    const msg = e.message.split("\n")[0];
    if (!/Hydration failed|Minified React error #418|#423|#425/.test(msg)) errs.push(msg);
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  // The slam bump moves the canvas on the real clock, which would misalign the
  // sample points. It is transform-only; well-look.test.mjs keeps it that way.
  await page.addStyleTag({ content: ".well canvas { animation: none !important; }" });
  await page.clock.runFor(600);
  return { ctx, page, errs };
}

function baseSave(skin, extra = {}) {
  return {
    version: 4,
    onboarded: true,
    tipSeen: true,
    holeSeen: true,
    a2hs: true,
    mode: "marathon",
    credits: 80,
    theme: skin,
    themes: ["ink", skin],
    ...extra,
  };
}

async function runCase(skin, theme, size, clearWell) {
  const label = `${skin}/${size.name}${clearWell ? "" : "/bloom"}`;
  const { ctx, page, errs } = await openPage(skin, size, baseSave(skin, { clearWell }));
  try {
    await page.locator('[data-qa="play"]').dispatchEvent("pointerdown");
    await page.clock.runFor(200);
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", { timeout: 15000 });
    const skip = page.locator(".coach-skip");
    if (await skip.count()) await skip.dispatchEvent("click");
    await settleIntro(page);

    // Steady play: stack, falling piece, ghost.
    await page.evaluate(([rows, piece]) => window.__controlsTest.stage({ rows, piece }), [PLAY, PLAY_PIECE]);
    await page.clock.runFor(400);
    const play = await capture(page, `${label}/play`, theme, { ghost: true });
    const refName = `${skin}-${size.name}${clearWell ? "" : "-bloom"}.png`;
    await checkReference(play, refName, `${label}/play`);

    // Danger: the stack is six rows from the lip.
    await page.evaluate((rows) => window.__controlsTest.stage({ rows, piece: { id: "T", rot: 0, x: 4, y: 0 } }), DANGER);
    await page.clock.runFor(400);
    await capture(page, `${label}/danger`, theme, { minShare: 1 });

    // Hard-drop lock flash, then single and double clears through the sweep.
    for (const [kind, rows, at] of [
      ["lock", PLAY, [40, 120]],
      ["single", SINGLE, [30, 90, 170, 260]],
      ["double", PLAY, [30, 90, 170, 260]],
    ]) {
      const piece = kind === "lock" ? { id: "O", rot: 0, x: 1, y: 2 } : DROP_I;
      await page.evaluate(([r, p]) => window.__controlsTest.stage({ rows: r, piece: p }), [rows, piece]);
      await page.clock.runFor(250);
      const before = await page.evaluate(() => window.__controlsTest.getBoard());
      await page.evaluate(() => window.__controlsTest.setKeys(["Space"]));
      await page.clock.runFor(17);
      await page.evaluate(() => window.__controlsTest.setKeys([]));
      let t = 17;
      for (const ms of at) {
        await page.clock.runFor(ms - t);
        t = ms;
        // Rows that are clearing animate away; everything else must stay put and in colour.
        const { board, phase } = await page.evaluate(() => ({
          board: window.__controlsTest.getBoard(),
          phase: window.__controlsTest.getPhase(),
        }));
        const keep =
          phase !== "clearing"
            ? board
            : board.map((row, y) => (row.every((c) => c) ? row.map(() => null) : row.map((c, x) => (before[y][x] ? c : null))));
        await capture(page, `${label}/${kind}@${ms}ms`, theme, { board: keep, minShare: LIMITS.passShare });
      }
    }
    if (errs.length) failures.push(`${label}: page error ${errs[0]}`);
  } catch (err) {
    failures.push(`${label}: ${String(err).split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
}

/** The "Go" card dims the well; staged frames start once it and its fade are gone. */
async function settleIntro(page) {
  for (let i = 0; i < 40; i++) {
    const intro = await page.evaluate(() => window.__controlsTest.getIntro());
    if (!intro) break;
    await page.clock.runFor(200);
  }
  await page.clock.runFor(600);
}

async function runWatch(skin, theme) {
  const size = SIZES.find((s) => s.name === "phone") ?? SIZES[0];
  const label = `${skin}/${size.name}/watch`;
  const { ctx, page, errs } = await openPage(skin, size, baseSave(skin, { botPlay: true }));
  try {
    await page.locator('[data-qa="watch-bot"]').dispatchEvent("click");
    await page.clock.runFor(300);
    await page.waitForFunction(() => window.__controlsTest?.getPhase?.() === "playing", { timeout: 15000 });
    await settleIntro(page);
    let clears = 0;
    for (let i = 0; i < 400 && clears < 6; i++) {
      await page.clock.runFor(20);
      const phase = await page.evaluate(() => window.__controlsTest.getPhase());
      if (phase === "over") break;
      if (phase !== "clearing") {
        if (i % 40 === 20) await capture(page, `${label}/play#${i}`, theme, { minShare: LIMITS.passShare, live: true });
        continue;
      }
      clears += 1;
      const before = await page.evaluate(() => window.__controlsTest.getBoard());
      const keep = before.map((row) => (row.every((c) => c) ? row.map(() => null) : row));
      // Inside the first 38% of a clear nothing has started to fall yet.
      await capture(page, `${label}/clear${clears}`, theme, { board: keep, minShare: LIMITS.passShare });
      await page.clock.runFor(400);
    }
    if (clears === 0) failures.push(`${label}: the bot never cleared a line`);
    if (errs.length) failures.push(`${label}: page error ${errs[0]}`);
  } catch (err) {
    failures.push(`${label}: ${String(err).split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
}

/**
 * Screenshot the well, scale it to CSS pixels in the page, and sample each
 * mino face (and the ghost outline) by projecting its cell through the camera.
 */
async function capture(page, label, theme, opts = {}) {
  const box = await page.locator(".well").boundingBox();
  const board = opts.board ?? (await page.evaluate(() => window.__controlsTest.getBoard()));
  const ghost = opts.ghost ? await page.evaluate(() => window.__controlsTest.getGhost()) : [];
  const live = await page.evaluate(() => window.__controlsTest.getPiece());
  const points = await page.evaluate(
    ({ board, ghost }) => {
      const pt = (x, y) => {
        const p = window.__controlsTest.cellPoint(x, y);
        return { px: p.x, py: p.y };
      };
      const a = pt(0, 19);
      const b = pt(9, 19);
      const cell = (b.px - a.px) / 9;
      const minos = [];
      board.forEach((row, y) =>
        row.forEach((id, x) => {
          if (id) minos.push({ id, x, y, ...pt(x, y) });
        }),
      );
      return { cell, minos, ghost: ghost.map((g) => ({ ...g, ...pt(g.x, g.y) })), pit: pt(8, 9) };
    },
    { board, ghost },
  );
  const shot = await page.screenshot({ clip: box, animations: "allow" });
  const sampled = await page.evaluate(
    async ({ png, box, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = Math.round(box.width);
      c.height = Math.round(box.height);
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, c.width, c.height);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const at = (x, y, r) => {
        const rs = [];
        const gs = [];
        const bs = [];
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const px = Math.round(x - box.x + dx);
            const py = Math.round(y - box.y + dy);
            if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
            const o = (py * c.width + px) * 4;
            rs.push(data[o]);
            gs.push(data[o + 1]);
            bs.push(data[o + 2]);
          }
        const med = (v) => v.sort((p, q) => p - q)[v.length >> 1] / 255;
        return { r: med(rs), g: med(gs), b: med(bs) };
      };
      const r = Math.max(1, Math.round(points.cell * 0.18));
      const edge = points.cell * 0.44;
      return {
        png: c.toDataURL("image/png").split(",")[1],
        r,
        minos: points.minos.map((m) => ({ ...m, rx: m.px - box.x, ry: m.py - box.y, rgb: at(m.px, m.py, r) })),
        ghost: points.ghost.map((gc) => ({
          ...gc,
          edges: [
            at(gc.px, gc.py - edge, 1),
            at(gc.px, gc.py + edge, 1),
            at(gc.px - edge, gc.py, 1),
            at(gc.px + edge, gc.py, 1),
          ],
        })),
        pit: at(points.pit.px, points.pit.py, r),
      };
    },
    { png: shot.toString("base64"), box, points },
  );
  const file = `${label.replace(/[/@#]/g, "_")}.png`;
  writeFileSync(join(out, file), Buffer.from(sampled.png, "base64"));

  const pitRgb = sampled.pit;
  const results = sampled.minos.map((m) => judgeMino(theme, m, pitRgb));
  const bad = results.filter((r) => !r.ok);
  const share = results.length ? 1 - bad.length / results.length : 1;
  const need = opts.minShare ?? 1;
  if (share < need) {
    const worst = bad.slice(0, 4).map((r) => `${r.id}@${r.x},${r.y} ${r.why}`).join("; ");
    failures.push(`${label}: ${bad.length}/${results.length} minos washed out (${worst})`);
  }
  let ghostOk = true;
  for (const gc of sampled.ghost) {
    const best = Math.max(...gc.edges.map((e) => dist(e, pitRgb)));
    if (best < LIMITS.ghostContrast) {
      ghostOk = false;
      failures.push(`${label}: ghost at ${gc.x},${gc.y} is ${best.toFixed(2)} from the pit (need ${LIMITS.ghostContrast})`);
      break;
    }
  }
  if (opts.ghost && sampled.ghost.length === 0) {
    ghostOk = false;
    failures.push(`${label}: no ghost cells`);
  }
  const entry = {
    label,
    file,
    live,
    share: +share.toFixed(3),
    ghostOk,
    minos: results.map(({ id, x, y, hex, ...rest }) => ({ id, x, y, hex, ...rest })),
  };
  report.push(entry);
  console.log(
    `${label.padEnd(34)} minos ${String(results.length).padStart(3)} pass ${(share * 100).toFixed(0).padStart(3)}%` +
      (opts.ghost ? ` ghost ${ghostOk ? "ok" : "MISSING"}` : ""),
  );
  return { ...entry, sampled };
}

async function checkReference(play, name, label) {
  const ref = join(REF_DIR, name);
  if (update) {
    writeFileSync(ref, Buffer.from(play.sampled.png, "base64"));
    return;
  }
  if (!existsSync(ref)) {
    failures.push(`${label}: no reference ${name} (run with UPDATE=1)`);
    return;
  }
  // Sample the saved reference at the same points the live frame used.
  const cur = await sampleRef(Buffer.from(play.sampled.png, "base64"), play);
  const old = await sampleRef(readFileSync(ref), play);
  let worst = 0;
  let at = "";
  cur.forEach((c, i) => {
    const d = dist(c, old[i]) * 255;
    if (d > worst) {
      worst = d;
      at = `${play.minos[i].id}@${play.minos[i].x},${play.minos[i].y}`;
    }
  });
  if (worst > LIMITS.refDelta)
    failures.push(`${label}: mino colour moved ${worst.toFixed(0)}/255 from reference ${name} at ${at}`);
}

/** Median colour of each mino face in a well-sized PNG, using the frame's own sample points. */
async function sampleRef(pngBuf, play) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ({ png, pts, r }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        return pts.map(({ x, y }) => {
          const ch = [[], [], []];
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const o = ((Math.round(y) + dy) * c.width + Math.round(x) + dx) * 4;
              ch[0].push(d[o]);
              ch[1].push(d[o + 1]);
              ch[2].push(d[o + 2]);
            }
          const med = (v) => v.sort((p, q) => p - q)[v.length >> 1] / 255;
          return { r: med(ch[0]), g: med(ch[1]), b: med(ch[2]) };
        });
      },
      { png: pngBuf.toString("base64"), pts: play.sampled.minos.map((m) => ({ x: m.rx, y: m.ry })), r: play.sampled.r },
    );
  } finally {
    await page.close();
  }
}

function judgeMino(theme, m, pit) {
  const hex = theme.fill[m.id];
  const ref = hexRgb(hex);
  const got = m.rgb;
  const refC = chroma(ref);
  const gotC = chroma(got);
  const base = { id: m.id, x: m.x, y: m.y, hex, got: toHex(got) };
  if (refC >= 0.14) {
    const hueErr = hueDist(hue(ref), hue(got));
    const ratio = gotC / refC;
    const lift = Math.min(got.r, got.g, got.b) - Math.min(ref.r, ref.g, ref.b);
    const why = [];
    if (hueErr > LIMITS.hueDeg) why.push(`hue off ${hueErr.toFixed(0)}deg`);
    if (ratio < LIMITS.chromaRatio) why.push(`chroma ${(ratio * 100).toFixed(0)}%`);
    if (lift > LIMITS.whiteLift) why.push(`white +${lift.toFixed(2)}`);
    return { ...base, hueErr: +hueErr.toFixed(1), ratio: +ratio.toFixed(2), lift: +lift.toFixed(2), ok: !why.length, why: why.join(", ") };
  }
  const contrast = dist(got, pit);
  const ok = contrast >= LIMITS.pitContrast;
  return { ...base, contrast: +contrast.toFixed(2), ok, why: ok ? "" : `pit contrast ${contrast.toFixed(2)}` };
}

function parseThemes(src) {
  const out = {};
  const re = /id: "(\w+)",[\s\S]*?fill: \{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const fill = {};
    for (const [, k, v] of m[2].matchAll(/(\w): "(#[0-9a-fA-F]{6})"/g)) fill[k] = v;
    out[m[1]] = { id: m[1], fill };
  }
  return out;
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function toHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
function chroma({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}
function hue({ r, g, b }) {
  const v = Math.max(r, g, b);
  const d = v - Math.min(r, g, b);
  if (d === 0) return 0;
  let h = v === r ? ((g - b) / d) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function dist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
