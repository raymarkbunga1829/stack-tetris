import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const start = css.indexOf(".missions {");
const end = css.indexOf(".coach-card {");
assert.notEqual(start, -1, "missions list styles are still in styles.css");
assert.notEqual(end, -1, "missions block still sits ahead of .coach-card");
const missions = css.slice(start, end);

test("open daily goals stay muted; Pays may stay faint", () => {
  assert.match(missions, /\.missions li \{[\s\S]*?color:\s*var\(--color-muted\)/);
  assert.match(missions, /\.missions li em \{[\s\S]*?color:\s*var\(--color-faint\)/);
});

test("done daily goals stay struck but do not drop to faint", () => {
  assert.match(missions, /\.missions li\.is-done \{[\s\S]*?text-decoration:\s*line-through/);
  assert.doesNotMatch(
    missions,
    /\.missions li\.is-done \{[\s\S]*?color:\s*var\(--color-faint\)/,
    "done row color used to be --color-faint and vanished on the dark sheet",
  );
  assert.match(
    missions,
    /\.missions li\.is-done em \{[\s\S]*?color:\s*inherit/,
    "Paid has to follow the done row, or it stays faint under the strike",
  );
});
