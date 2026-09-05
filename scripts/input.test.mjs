import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Compile the real input implementation, including its device dependency.
function moduleUrl(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const device = moduleUrl("../src/game/device.ts");
const source = readFileSync(new URL("../src/game/input.ts", import.meta.url), "utf8")
  .replace('"./device"', JSON.stringify(device));
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createInput } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("input resets on interruption and removes listeners on disposal", async (t) => {
  const originals = new Map(["window", "document", "HTMLElement", "navigator"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  ));
  const window = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  for (const [key, value] of Object.entries({ window, document, HTMLElement: class {}, navigator: {} })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  function keydown(code) {
    const event = new Event("keydown");
    Object.assign(event, { code, key: code, repeat: false });
    window.dispatchEvent(event);
  }
  for (const kind of ["blur", "hidden"]) {
    await t.test(`${kind} discards movement, drops and unspent powers`, () => {
      const input = createInput();
      try {
        keydown("ArrowLeft");
        assert.equal(input.sample().just.left, true);
        keydown("Digit1");
        input.setTouch({ down: true });
        input.tap({ hard: true });
        input.nudge(3);
        if (kind === "blur") window.dispatchEvent(new Event("blur"));
        else {
          document.hidden = true;
          document.dispatchEvent(new Event("visibilitychange"));
          document.hidden = false;
        }
        const state = input.sample();
        assert.ok(Object.values(state.held).every((value) => value === false));
        assert.equal(input.takePower(), null);
        assert.equal(input.takeNudge(), 0);
        keydown("ArrowLeft");
        assert.equal(input.sample().just.left, true);
      } finally {
        input.dispose();
      }
    });
  }
  await t.test("disposal removes the visibility listener", () => {
    const removed = [];
    const remove = document.removeEventListener.bind(document);
    document.removeEventListener = (type, listener) => {
      removed.push(type);
      remove(type, listener);
    };
    const input = createInput();
    input.dispose();
    assert.ok(removed.includes("visibilitychange"));
    keydown("ArrowLeft");
    assert.equal(input.sample().held.left, false);
  });
});
