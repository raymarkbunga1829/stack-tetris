import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bundleAssets,
  renderServiceWorker,
  resolveBuildId,
  workerVersion,
} from "./sw-build-plugin.mjs";

const template = readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");

test("the worker template carries no hand-bumped cache version", () => {
  assert.doesNotMatch(template, /stack-offline-v\d+/);
  assert.match(template, /const CACHE = `stack-offline-\$\{VERSION\}`;/);
});

test("build id comes from the Vercel commit, then git, then build time", () => {
  assert.equal(resolveBuildId({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }), "abcdef1");
  assert.equal(
    resolveBuildId({ STACK_BUILD_ID: "pinned", VERCEL_GIT_COMMIT_SHA: "abc" }),
    "pinned",
  );
  assert.match(resolveBuildId({}), /^[0-9a-f]{7}$|^t[0-9a-z]+$/);
});

test("worker version changes with the commit or the bundle, not with a redeploy", () => {
  const a = ["/assets/index-AAA.js", "/assets/styles-BBB.css"];
  assert.equal(workerVersion("abc1234", a), workerVersion("abc1234", [...a].reverse()));
  assert.notEqual(workerVersion("abc1234", a), workerVersion("def5678", a));
  assert.notEqual(
    workerVersion("abc1234", a),
    workerVersion("abc1234", [a[0], "/assets/styles-CCC.css"]),
  );
});

test("rendered worker stamps its version and precaches the whole bundle", () => {
  const assets = bundleAssets({
    "assets/index-AAA.js": {},
    "assets/index-AAA.js.map": {},
    "assets/styles-BBB.css": {},
    "index.html": {},
    "sw.js": {},
  });
  assert.deepEqual(assets, ["/assets/index-AAA.js", "/assets/styles-BBB.css"]);
  const out = renderServiceWorker(template, { version: "abc1234-0f0f0f0f", assets });
  assert.match(out, /const VERSION = "abc1234-0f0f0f0f";/);
  assert.match(out, /const ASSETS = \["\/assets\/index-AAA\.js","\/assets\/styles-BBB\.css"\];/);
  assert.doesNotMatch(out, /const VERSION = "dev";/);
  assert.match(out, /const SHELL = \["\/", \.\.\.ASSETS\];/);
});

test("a template that lost its placeholders fails the build instead of shipping a stale worker", () => {
  assert.throws(() => renderServiceWorker("const CACHE = 'x';", { version: "v", assets: [] }));
});

test("new builds wait for the page's prompt instead of swapping themselves in", () => {
  assert.match(template, /if \(!self\.registration\.active\) self\.skipWaiting\(\);/);
  assert.match(template, /event\.data === "SKIP_WAITING"/);
  const offline = readFileSync(new URL("../src/game/offline.ts", import.meta.url), "utf8");
  assert.match(offline, /visibilitychange/);
  assert.doesNotMatch(offline, /canReload/);
});
