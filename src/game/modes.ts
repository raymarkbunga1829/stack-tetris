export type ModeId = "marathon" | "sprint" | "blitz" | "daily";

export type ModeInfo = {
  id: ModeId;
  name: string;
  blurb: string;
  lines: number | null;
  seconds: number | null;
};

export const MODES: ModeInfo[] = [
  { id: "marathon", name: "Marathon", blurb: "Play until you top out.", lines: null, seconds: null },
  { id: "sprint", name: "Sprint 40", blurb: "Clear 40 lines. Clock runs.", lines: 40, seconds: null },
  { id: "blitz", name: "Blitz 2:00", blurb: "Two minutes. Highest score.", lines: null, seconds: 120 },
  { id: "daily", name: "Daily", blurb: "Same bag for everyone today.", lines: null, seconds: null },
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
