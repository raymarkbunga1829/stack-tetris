import type { Snap } from "./replay";

const KEY = "stack-last-replay";
const CAP = 64;
let mem: Snap[] | null = null;

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
