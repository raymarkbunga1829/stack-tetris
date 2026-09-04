import { PIECE_IDS, type PieceId } from "./types";

export type ModeId =
  | "marathon"
  | "watch"
  | "sprint"
  | "blitz"
  | "daily"
  | "zen"
  | "arcade"
  | "classic"
  | "finesse"
  | "siege";

export type ModeInfo = {
  id: ModeId;
  name: string;
  blurb: string;
  look: string;
  tint: string;
  carving: string;
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
    tint: "#7eb4c8",
    carving: "Stack until the moon falls.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "watch",
    name: "Watch bot",
    blurb: "Marathon, hands off. A bot slams every piece.",
    look: "Same well. Same score. You sit. It plays.",
    tint: "#8ec8b4",
    carving: "Sit. The well plays itself.",
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
    tint: "#e8c46a",
    carving: "Forty lines. Then silence.",
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
    tint: "#e87840",
    carving: "Two minutes. Do not waste the fire.",
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
    tint: "#b08ad4",
    carving: "The same seven as the living.",
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
    tint: "#78c47c",
    carving: "Nothing dies here.",
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
    tint: "#e09852",
    carving: "No ghosts. Read the stone.",
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
    tint: "#9aa070",
    carving: "No ghosts below.",
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
    blurb: "Twenty pieces. The well grades the path.",
    look: "A sloppy T and a 180 leave different marks.",
    tint: "#6ee0e4",
    carving: "Twenty hands. No extra slide.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
    kicks: true,
    rng: "bag",
  },
  {
    id: "siege",
    name: "Siege",
    blurb: "Eight wells. Send garbage. Steal badges.",
    look: "Eight hunters. The last well standing.",
    tint: "#ff6a8a",
    carving: "Send the floor to someone else.",
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

export const MANILA_TZ = "Asia/Manila";

export function manilaDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Shared Daily day. Always Asia/Manila — not device TZ, not silent UTC. */
export function utcDateKey(d = new Date()): string {
  return manilaDateKey(d);
}

export function localDateKey(d = new Date()): string {
  return manilaDateKey(d);
}

export function formatManilaDate(key: string): string {
  const parts = key.split("-");
  const m = Number(parts[1] ?? 1);
  const day = Number(parts[2] ?? 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Math.max(0, m - 1)]} ${day}`;
}

export function streakLive(
  streak: { count: number; last: string } | undefined,
  today = manilaDateKey(),
): number {
  if (!streak || streak.count < 1) return 0;
  if (streak.last === today || streak.last === utcShift(-1, today)) return streak.count;
  return 0;
}

export function isMode(id: unknown): id is ModeId {
  return typeof id === "string" && MODES.some((m) => m.id === id);
}

export function powersAllowed(id: ModeId): boolean {
  return id === "marathon" || id === "zen" || id === "arcade" || id === "siege" || id === "blitz";
}

export function utcShift(days: number, from = utcDateKey()): string {
  const d = new Date(`${from}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function moonPhase(d = new Date()): number {
  const known = Date.UTC(2000, 0, 6, 18, 14, 0);
  const days = (d.getTime() - known) / 86400000;
  const syn = 29.530588;
  return (((days % syn) + syn) % syn) / syn;
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

/** Elapsed time with tenths. Use for Sprint clocks — ceil would pad a 40.1s run to 0:41. */
export function formatElapsed(sec: number): string {
  const t = Math.max(0, sec);
  const m = Math.floor(t / 60);
  const r = t - m * 60;
  const whole = Math.floor(r);
  const tenth = Math.floor((r - whole) * 10 + 1e-6);
  return `${m}:${whole.toString().padStart(2, "0")}.${tenth}`;
}

export function sprintPace(clock: number, lines: number, pb: number | null): string | undefined {
  if (pb == null) return undefined;
  if (lines < 1) return `PB ${formatElapsed(pb)}`;
  const d = clock - pb * (lines / 40);
  const sign = d >= 0 ? "+" : "−";
  return `${sign}${Math.abs(d).toFixed(1)}`;
}

export function peekDailyBag(n = 4, date = manilaDateKey()): PieceId[] {
  const rng = mulberry32(dailySeed(date));
  const bag = PIECE_IDS.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = t;
  }
  return bag.slice(0, n);
}