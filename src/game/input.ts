export type Pad = {
  left: boolean;
  right: boolean;
  down: boolean;
  hard: boolean;
  cw: boolean;
  ccw: boolean;
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
  hold: false,
  pause: false,
  confirm: false,
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
  "KeyC",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "Enter",
  "Escape",
  "KeyP",
]);

function blank(): Pad {
  return { ...EMPTY };
}

export function createInput() {
  const keys = new Set<string>();
  let prev = blank();
  let inject = blank();
  let touch = blank();
  let nudgeAcc = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.altKey) return;
    if (GAME_CODES.has(e.code)) e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const clearKeys = () => {
    keys.clear();
    touch = blank();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });

  function poll(): Pad {
    const p = blank();
    if (keys.has("ArrowLeft") || keys.has("KeyA")) p.left = true;
    if (keys.has("ArrowRight") || keys.has("KeyD")) p.right = true;
    if (keys.has("ArrowDown") || keys.has("KeyS")) p.down = true;
    if (keys.has("Space")) p.hard = true;
    if (keys.has("ArrowUp") || keys.has("KeyX") || keys.has("KeyW")) p.cw = true;
    if (keys.has("KeyZ") || keys.has("ControlLeft")) p.ccw = true;
    if (keys.has("KeyC") || keys.has("ShiftLeft") || keys.has("ShiftRight")) p.hold = true;
    if (keys.has("Escape") || keys.has("KeyP")) p.pause = true;
    if (keys.has("Enter")) p.confirm = true;

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
    p.hold = p.hold || inject.hold || touch.hold;
    p.pause = p.pause || inject.pause || touch.pause;
    p.confirm = p.confirm || inject.confirm || touch.confirm;
    return p;
  }

  function sample(): InputState {
    const held = poll();
    const just: Pad = {
      left: held.left && !prev.left,
      right: held.right && !prev.right,
      down: held.down && !prev.down,
      hard: held.hard && !prev.hard,
      cw: held.cw && !prev.cw,
      ccw: held.ccw && !prev.ccw,
      hold: held.hold && !prev.hold,
      pause: held.pause && !prev.pause,
      confirm: held.confirm && !prev.confirm,
    };
    prev = held;
    inject = blank();
    return { held, just };
  }

  function tap(partial: Partial<Pad>) {
    inject = { ...inject, ...partial };
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

  function setKeys(codes: string[]) {
    keys.clear();
    for (const c of codes) keys.add(c);
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
  }

  return { sample, tap, setTouch, nudge, takeNudge, setKeys, dispose };
}

export type InputApi = ReturnType<typeof createInput>;
