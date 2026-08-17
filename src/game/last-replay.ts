import type { Board } from "./sim";
import type { Snap } from "./replay";

const KEY = "stack-last-replay";
const ASH = "stack-last-ash";
const CAP = 64;
let mem: Snap[] | null = null;
let ash: Board | null = null;

export function setLastReplay(snaps: Snap[]) {
  mem = snaps.slice(-CAP);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* quota */
  }
}

export function getLastReplay(): Snap[] | null {
  if (mem && mem.length > 1) return mem;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snap[];
    if (Array.isArray(parsed) && parsed.length > 1) {
      mem = parsed;
      return mem;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function setLastAsh(board: Board) {
  ash = board.map((r) => r.slice());
  try {
    sessionStorage.setItem(ASH, JSON.stringify(ash));
  } catch {
    /* quota */
  }
}

export function getLastAsh(): Board | null {
  if (ash) return ash;
  try {
    const raw = sessionStorage.getItem(ASH);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Board;
    if (Array.isArray(parsed) && parsed.length > 0) {
      ash = parsed;
      return ash;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearLastAsh() {
  ash = null;
  try {
    sessionStorage.removeItem(ASH);
  } catch {
    /* ignore */
  }
}

const STAIN = "stack-last-stain";
let stain: { x: number; y: number }[] | null = null;
let stainPeak = 99;

export function setLastStain(cells: { x: number; y: number }[], peak: number) {
  stain = cells;
  stainPeak = peak;
  try {
    sessionStorage.setItem(STAIN, JSON.stringify({ cells, peak }));
  } catch {
    /* ignore */
  }
}

export function getLastStain(): { cells: { x: number; y: number }[]; peak: number } | null {
  if (stain) return { cells: stain, peak: stainPeak };
  try {
    const raw = sessionStorage.getItem(STAIN);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cells: { x: number; y: number }[]; peak: number };
    if (parsed?.cells?.length) {
      stain = parsed.cells;
      stainPeak = parsed.peak;
      return { cells: stain, peak: stainPeak };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearLastStain() {
  stain = null;
  stainPeak = 99;
  try {
    sessionStorage.removeItem(STAIN);
  } catch {
    /* ignore */
  }
}

const DAILY_NOW = "stack-daily-replay";
const DAILY_WAS = "stack-daily-replay-prev";

type DatedSnaps = { date: string; snaps: Snap[] };

function readDated(key: string): DatedSnaps | null {
  try {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DatedSnaps;
    if (parsed?.date && Array.isArray(parsed.snaps) && parsed.snaps.length > 1) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeDated(key: string, value: DatedSnaps) {
  const raw = JSON.stringify(value);
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* quota */
  }
}

export function setDailyReplay(date: string, snaps: Snap[]) {
  const cur = readDated(DAILY_NOW);
  if (cur && cur.date !== date) writeDated(DAILY_WAS, cur);
  writeDated(DAILY_NOW, { date, snaps: snaps.slice(-CAP) });
}

export function getDailyReplay(date: string): Snap[] | null {
  const cur = readDated(DAILY_NOW);
  if (cur?.date === date) return cur.snaps;
  const was = readDated(DAILY_WAS);
  if (was?.date === date) return was.snaps;
  return null;
}
