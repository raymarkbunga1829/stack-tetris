import { PIECE_IDS, type PieceId } from "./types";

export type ModeId =
  | "marathon"
  | "sprint"
  | "blitz"
  | "daily"
  | "zen"
  | "arcade"
  | "classic"
  | "finesse";

export type ModeInfo = {
  id: ModeId;
  name: string;
  blurb: string;
  look: string;
  lines: number | null;
  seconds: number | null;
  startLevel: number;
  ghost: boolean;
  kicks: boolean;
  rng: "bag" | "nes";
};

export const MODES: ModeInfo[] = [
  {
    id: "marathon",
    name: "Marathon",
    blurb: "Landing ghost on. Endless until you top out.",
    look: "A pale twin waits on the floor. The well never ends.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "sprint",
    name: "Sprint 40",
    blurb: "Race to 40 lines. Ghost shows the drop.",
    look: "Forty lines. Gold on the clock if you beat yourself.",
    lines: 40,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "blitz",
    name: "Blitz 2:00",
    blurb: "Two minutes from level 10. Ghost on.",
    look: "Already falling hard. Amber at ten. Red at three.",
    lines: null,
    seconds: 120,
    startLevel: 10,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "daily",
    name: "Daily",
    blurb: "Today's shared bag. Ghost on.",
    look: "The same seven as everyone alive today.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "zen",
    name: "Zen",
    blurb: "No clock. No top-out. Ghost on.",
    look: "No top-out. Undo a drop. The well is a sketchbook.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "arcade",
    name: "Arcade",
    blurb: "No landing ghost. Read the stack yourself.",
    look: "No ghost. Read the stack like a cabinet.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: false,
    kicks: true,
    rng: "bag",
  },
  {
    id: "classic",
    name: "Classic",
    blurb: "NES bag. No wall kicks. Read the stack.",
    look: "NES bag. No kicks. Green-black glass. The ghost is gone.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: false,
    kicks: false,
    rng: "nes",
  },
  {
    id: "finesse",
    name: "Finesse",
    blurb: "Twenty pieces. Extra taps count.",
    look: "Twenty pieces. Extra taps stain the recap gold.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
];

export function modeOf(id: ModeId): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function utcShift(days: number, from = utcDateKey()): string {
  const d = new Date(`${from}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailySeed(date = utcDateKey()): number {
  return hashSeed(`stack-daily-${date}`);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function sprintPace(clock: number, lines: number, pb: number | null): string | undefined {
  if (pb == null) return undefined;
  if (lines < 1) return `PB ${formatClock(pb)}`;
  const d = clock - pb * (lines / 40);
  const sign = d >= 0 ? "+" : "−";
  return `${sign}${Math.abs(d).toFixed(1)}`;
}

export function peekDailyBag(n = 4): PieceId[] {
  const rng = mulberry32(dailySeed());
  const bag = PIECE_IDS.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = t;
  }
  return bag.slice(0, n);
}