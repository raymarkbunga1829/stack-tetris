import { noteKeyboard } from "./device";
import type { PowerId } from "./shop";

/** The saved handling applies equally to touch, keyboard, and hybrid devices. */
export function handlingOf(settings: { dasMs: number; arrMs: number; sdf: number }) {
  return { das: settings.dasMs / 1000, arr: settings.arrMs / 1000, sdf: settings.sdf };
}

export type Pad = {
  left: boolean;
  right: boolean;
  down: boolean;
  hard: boolean;
  cw: boolean;
  ccw: boolean;
  flip: boolean;
  hold: boolean;
  pause: boolean;
  confirm: boolean;
};

export type InputState = {
  held: Pad;
  just: Pad;
};

const EMPTY: Pad = {
  left: false,
  right: false,
  down: false,
  hard: false,
  cw: false,
  ccw: false,
  flip: false,
  hold: false,
  pause: false,
  confirm: false,
};

const POWER_CODES: Record<string, PowerId> = {
  Digit1: "zap",
  Digit2: "slow",
  Digit3: "shield",
  Digit4: "quake",
  Digit5: "pick",
  Numpad1: "zap",
  Numpad2: "slow",
  Numpad3: "shield",
  Numpad4: "quake",
  Numpad5: "pick",
};

const GAME_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyZ",
  "KeyX",
  "KeyQ",
  "KeyF",
  "KeyC",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "Enter",
  "Escape",
  "KeyP",
  "KeyH",
  "Slash",
  "Numpad0",
  "Numpad2",
  "Numpad4",
  "Numpad5",
  "Numpad6",
  "Numpad8",
  "NumpadEnter",
  ...Object.keys(POWER_CODES),
]);

function blank(): Pad {
  return { ...EMPTY };
}

function typingInField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function createInput() {
  const keys = new Set<string>();
  // Presses since the last sample. A tap that lands and lifts between two frames
  // (fast fingers, or a frame hitch) would otherwise never reach the game.
  const tapped = new Set<string>();
  let prev = blank();
  let inject = blank();
  let touch = blank();
  let skipJust = blank();
  let onPulse: ((p: Partial<Pad>) => void) | null = null;
  let nudgeAcc = 0;
  const powerQ: PowerId[] = [];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.altKey) return;
    if (e.isComposing) return;
    if (typingInField(e.target)) return;
    const code = e.code || "";
    const key = e.key;
    if (GAME_CODES.has(code) || key === " " || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowDown" || key === "ArrowUp") {
      e.preventDefault();
    }
    if (code) keys.add(code);
    if (key === " ") keys.add("Space");
    if (!e.repeat) {
      if (code) tapped.add(code);
      if (key === " ") tapped.add("Space");
    }
    noteKeyboard();
    const power = POWER_CODES[code];
    if (power && !e.repeat) powerQ.push(power);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.key === " ") keys.delete("Space");
  };
  const clearKeys = () => {
    keys.clear();
    tapped.clear();
    touch = blank();
    prev = blank();
    inject = blank();
    skipJust = blank();
    nudgeAcc = 0;
    powerQ.length = 0;
  };
  const onVisibilityChange = () => {
    if (document.hidden) clearKeys();
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", onVisibilityChange);

  function padOf(codes: Set<string>): Pad {
    const p = blank();
    if (codes.has("ArrowLeft") || codes.has("KeyA") || codes.has("Numpad4")) p.left = true;
    if (codes.has("ArrowRight") || codes.has("KeyD") || codes.has("Numpad6")) p.right = true;
    if (codes.has("ArrowDown") || codes.has("KeyS") || codes.has("Numpad2")) p.down = true;
    if (codes.has("Space") || codes.has("Slash") || codes.has("Numpad0")) p.hard = true;
    if (codes.has("ArrowUp") || codes.has("KeyX") || codes.has("KeyW") || codes.has("Numpad8") || codes.has("Numpad5")) {
      p.cw = true;
    }
    if (codes.has("KeyZ") || codes.has("KeyQ") || codes.has("ControlLeft")) p.ccw = true;
    if (codes.has("KeyF")) p.flip = true;
    if (codes.has("KeyC") || codes.has("KeyH") || codes.has("ShiftLeft") || codes.has("ShiftRight")) p.hold = true;
    if (codes.has("Escape") || codes.has("KeyP")) p.pause = true;
    if (codes.has("Enter") || codes.has("NumpadEnter")) p.confirm = true;
    return p;
  }

  function poll(fresh: Pad): Pad {
    const p = padOf(keys);
    for (const k of Object.keys(p) as (keyof Pad)[]) p[k] = p[k] || fresh[k];

    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const b = pad.buttons;
      if (b[14]?.pressed) p.left = true;
      if (b[15]?.pressed) p.right = true;
      if (b[13]?.pressed) p.down = true;
      if (b[12]?.pressed || b[0]?.pressed) p.cw = true;
      if (b[2]?.pressed) p.ccw = true;
      if (b[1]?.pressed || b[7]?.pressed) p.hard = true;
      if (b[4]?.pressed || b[5]?.pressed) p.hold = true;
      if (b[9]?.pressed || b[8]?.pressed) p.pause = true;
      const lx = pad.axes[0] ?? 0;
      const ly = pad.axes[1] ?? 0;
      if (lx < -0.45) p.left = true;
      if (lx > 0.45) p.right = true;
      if (ly > 0.55) p.down = true;
    }

    p.left = p.left || inject.left || touch.left;
    p.right = p.right || inject.right || touch.right;
    p.down = p.down || inject.down || touch.down;
    p.hard = p.hard || inject.hard || touch.hard;
    p.cw = p.cw || inject.cw || touch.cw;
    p.ccw = p.ccw || inject.ccw || touch.ccw;
    p.flip = p.flip || inject.flip || touch.flip;
    p.hold = p.hold || inject.hold || touch.hold;
    p.pause = p.pause || inject.pause || touch.pause;
    p.confirm = p.confirm || inject.confirm || touch.confirm;
    return p;
  }

  function sample(): InputState {
    const fresh = padOf(tapped);
    tapped.clear();
    const held = poll(fresh);
    // A fresh press counts even if the key was also down last frame (released and re-pressed in between).
    const edge = (k: keyof Pad) => held[k] && (!prev[k] || fresh[k]) && !skipJust[k];
    const just: Pad = {
      left: edge("left"),
      right: edge("right"),
      down: edge("down"),
      hard: edge("hard"),
      cw: edge("cw"),
      ccw: edge("ccw"),
      flip: edge("flip"),
      hold: edge("hold"),
      pause: edge("pause"),
      confirm: edge("confirm"),
    };
    prev = held;
    inject = blank();
    skipJust = blank();
    return { held, just };
  }

  function tap(partial: Partial<Pad>) {
    if (onPulse) {
      onPulse(partial);
      skipJust = { ...skipJust, ...partial, left: skipJust.left || !!partial.left, right: skipJust.right || !!partial.right, down: skipJust.down || !!partial.down, hard: skipJust.hard || !!partial.hard, cw: skipJust.cw || !!partial.cw, ccw: skipJust.ccw || !!partial.ccw, flip: skipJust.flip || !!partial.flip, hold: skipJust.hold || !!partial.hold, pause: skipJust.pause || !!partial.pause, confirm: skipJust.confirm || !!partial.confirm };
      return;
    }
    inject = { ...inject, ...partial };
  }

  function setPulse(fn: ((p: Partial<Pad>) => void) | null) {
    onPulse = fn;
  }

  function setTouch(partial: Partial<Pad>) {
    touch = { ...touch, ...partial };
  }

  function nudge(dx: number) {
    nudgeAcc += dx;
  }

  function takeNudge() {
    const n = nudgeAcc;
    nudgeAcc = 0;
    return n;
  }

  function takePower(): PowerId | null {
    return powerQ.shift() ?? null;
  }

  function setKeys(codes: string[]) {
    keys.clear();
    for (const c of codes) keys.add(c);
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearKeys();
    onPulse = null;
  }

  return { sample, tap, setTouch, setPulse, nudge, takeNudge, takePower, setKeys, dispose };
}

export type InputApi = ReturnType<typeof createInput>;
