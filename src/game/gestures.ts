/** Pointer-driven well input: tap to rotate, drag to shift. */

export type GestureAction =
  | { name: "nudge"; dx: number }
  | { name: "soft"; down: boolean }
  | { name: "hard" }
  | { name: "rotate"; dir: 1 | -1 }
  | { name: "hold" }
  | { name: "confirm" }
  | { name: "drag"; x: number; y: number };

export type GestureLabel =
  | "tap"
  | "double-tap"
  | "long-press"
  | "swipe"
  | "flick"
  | "soft"
  | "hold"
  | "two-finger"
  | "z"
  | "drag";

export type GestureEmit = {
  action: GestureAction;
  label: GestureLabel;
};

type Axis = "x" | "y";

type Sample = { x: number; y: number; t: number };

type Stroke = {
  id: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  t0: number;
  moved: boolean;
  axis: Axis | null;
  acc: number;
  longFired: boolean;
  multi: boolean;
  glyph: boolean;
  samples: Sample[];
};

export type StrokeView = {
  id: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  axis: Axis | null;
  moved: boolean;
  t0: number;
  samples: Sample[];
};

const TAP_SLOP = 14;
const LONG_MS = 430;
const TAP_MAX_MS = 260;

function viewOf(s: Stroke): StrokeView {
  return {
    id: s.id,
    sx: s.sx,
    sy: s.sy,
    x: s.x,
    y: s.y,
    axis: s.axis,
    moved: s.moved,
    t0: s.t0,
    samples: s.samples.slice(),
  };
}

export function createGestures(emit: (ev: GestureEmit) => void) {
  const strokes = new Map<number, Stroke>();
  const longs = new Map<number, number>();
  let last: { x: number; y: number } | null = null;

  function feed(
    type: "down" | "move" | "up" | "cancel",
    id: number,
    x: number,
    y: number,
    t = performance.now(),
  ) {
    last = { x, y };
    if (type === "down") onDown(id, x, y, t);
    else if (type === "move") onMove(id, x, y, t);
    else onUp(id, x, y, t, type === "cancel");
  }

  function reset() {
    for (const timer of longs.values()) window.clearTimeout(timer);
    longs.clear();
    strokes.clear();
  }

  function onDown(id: number, x: number, y: number, t: number) {
    const stroke: Stroke = {
      id,
      sx: x,
      sy: y,
      x,
      y,
      t0: t,
      moved: false,
      axis: null,
      acc: 0,
      longFired: false,
      multi: strokes.size > 0,
      glyph: false,
      samples: [{ x, y, t }],
    };
    if (stroke.multi) {
      for (const s of strokes.values()) s.multi = true;
    }
    strokes.set(id, stroke);
    const timer = window.setTimeout(() => {
      const live = strokes.get(id);
      if (!live || live.moved || live.longFired || live.multi) return;
      live.longFired = true;
      emit({ action: { name: "hold" }, label: "long-press" });
    }, LONG_MS);
    longs.set(id, timer);
  }

  function onMove(id: number, x: number, y: number, t: number) {
    const s = strokes.get(id);
    if (!s) return;
    s.x = x;
    s.y = y;
    s.samples.push({ x, y, t });
    if (s.samples.length > 80) s.samples.splice(0, s.samples.length - 64);

    const dx = x - s.sx;
    const dy = y - s.sy;
    if (!s.moved && Math.hypot(dx, dy) > TAP_SLOP) {
      s.moved = true;
      clearLong(id);
    }
    if (s.multi || s.longFired) return;

    emit({ action: { name: "drag", x, y }, label: "drag" });
  }

  function onUp(id: number, x: number, y: number, t: number, cancelled: boolean) {
    const s = strokes.get(id);
    clearLong(id);
    strokes.delete(id);
    if (!s) return;
    s.x = x;
    s.y = y;
    s.samples.push({ x, y, t });

    const others = strokes.size;
    const dx = x - s.sx;
    const dy = y - s.sy;
    const dt = t - s.t0;

    if (s.multi || others > 0) {
      if (!s.moved && !s.longFired && dt < TAP_MAX_MS + 80) {
        emit({ action: { name: "rotate", dir: -1 }, label: "two-finger" });
      }
      return;
    }

    if (cancelled || s.longFired) return;

    const short = dt <= TAP_MAX_MS + 80 && Math.hypot(dx, dy) < 56;
    if (!s.moved || short) {
      emit({ action: { name: "rotate", dir: 1 }, label: "tap" });
      emit({ action: { name: "confirm" }, label: "tap" });
    }
  }

  function clearLong(id: number) {
    const timer = longs.get(id);
    if (timer) window.clearTimeout(timer);
    longs.delete(id);
  }

  function snapshot(): StrokeView[] {
    return [...strokes.values()].map(viewOf);
  }

  function lastPoint(): { x: number; y: number } | null {
    return last;
  }

  return { feed, reset, active: () => strokes.size, snapshot, lastPoint };
}
