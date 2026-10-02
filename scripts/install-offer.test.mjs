import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("../src/components/tetris-app.tsx", import.meta.url), "utf8");

test("beforeinstallprompt is captured before InstallButton mounts", () => {
  const installStart = src.indexOf("function InstallButton");
  const appStart = src.indexOf("export function TetrisApp");
  assert.ok(installStart >= 0, "InstallButton is defined");
  assert.ok(appStart > installStart, "TetrisApp follows InstallButton");

  const buttonBody = src.slice(installStart, appStart);
  assert.equal(
    buttonBody.includes("beforeinstallprompt"),
    false,
    "InstallButton consumes a shared deferred prompt; it must not listen itself",
  );

  const listener = src.indexOf('addEventListener("beforeinstallprompt"');
  assert.ok(listener >= 0, "a beforeinstallprompt listener exists");
  assert.ok(
    listener < installStart,
    "BIP must be held at module scope so Chrome's early fire is not missed",
  );
  assert.match(src, /deferred=\{deferredInstall\}/);
});
