export type ModeId = "marathon" | "sprint" | "blitz" | "daily" | "zen" | "arcade";

export type ModeInfo = {
  id: ModeId;
  name: string;
  blurb: string;
  lines: number | null;
  seconds: number | null;
  startLevel: number;
  ghost: boolean;
};

export const MODES: ModeInfo[] = [
  {
    id: "marathon",
    name: "Marathon",
    blurb: "Landing ghost on. Endless until you top out.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
  },
  {
    id: "sprint",
    name: "Sprint 40",
    blurb: "Race to 40 lines. Ghost shows the drop.",
    lines: 40,
    seconds: null,
    startLevel: 1,
    ghost: true,
  },
  {
    id: "blitz",
    name: "Blitz 2:00",
    blurb: "Two minutes from level 10. Ghost on.",
    lines: null,
    seconds: 120,
    startLevel: 10,
    ghost: true,
  },
  {
    id: "daily",
    name: "Daily",
    blurb: "Today's shared bag. Ghost on.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
  },
  {
    id: "zen",
    name: "Zen",
    blurb: "No clock. No top-out. Ghost on.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: true,
  },
  {
    id: "arcade",
    name: "Arcade",
    blurb: "No landing ghost. Read the stack yourself.",
    lines: null,
    seconds: null,
    startLevel: 1,
    ghost: false,
  },
];

export function modeOf(id: ModeId): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function utcDateKey(d = new Date()): string {
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