import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const modules = new Map();
function moduleUrl(file) {
  if (modules.has(file.href)) return modules.get(file.href);
  const compiled = ts
    .transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(
      /from ["'](\.\.?\/[^"']+)["']/g,
      (_, path) => `from ${JSON.stringify(moduleUrl(new URL(`${path}.ts`, file)))}`,
    );
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  modules.set(file.href, url);
  return url;
}
const load = (file) => import(moduleUrl(new URL(file, import.meta.url)));
const { formatManilaDate, manilaDateKey } = await load("../src/game/modes.ts");

const MONTH = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/;

test("manilaDateKey is Asia/Manila, including the UTC morning when Manila is already tomorrow", () => {
  // Manila is UTC+8, no DST. 16:00 UTC Sep 30 = 00:00 Oct 1 in Manila.
  assert.equal(manilaDateKey(new Date("2026-09-30T15:59:00.000Z")), "2026-09-30");
  assert.equal(manilaDateKey(new Date("2026-09-30T16:00:00.000Z")), "2026-10-01");
  assert.equal(manilaDateKey(new Date("2026-10-01T00:00:00.000Z")), "2026-10-01");
  assert.notEqual(manilaDateKey(new Date("2026-09-30T16:30:00.000Z")), "2026-09-30");
});

test("formatManilaDate is a short month-day, not a TZ label", () => {
  assert.equal(formatManilaDate("2026-09-30"), "Sep 30");
  assert.equal(formatManilaDate("2026-10-01"), "Oct 1");
});

test("title Daily chip does not bake manilaDateKey into the SSR/hydrate tree", () => {
  const src = readFileSync(new URL("../src/components/mode-strip.tsx", import.meta.url), "utf8");
  const chips = src.slice(src.indexOf("export function ModeChips"), src.indexOf("function modeOfName"));
  assert.match(chips, /useSyncExternalStore/);
  assert.match(chips, /manilaDayServer/);
  assert.match(src, /cached document cannot flash yesterday/);
  assert.match(chips, /\\u00a0/);
  assert.doesNotMatch(chips, /formatManilaDate\(manilaDateKey\(\)\)/);
  assert.doesNotMatch(chips, /const today = manilaDateKey\(\)/);
});

test("offline shell cache was bumped so dated HTML is dropped", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /stack-offline-v25/);
  assert.doesNotMatch(sw, /stack-offline-v24/);
  assert.match(sw, /baked yesterday's Daily chip date/);
});

test("MONTH helper used by the probe still matches formatManilaDate", () => {
  assert.match(formatManilaDate("2026-09-30"), MONTH);
  assert.match(formatManilaDate("2026-10-01"), MONTH);
});
