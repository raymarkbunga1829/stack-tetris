export type HapticKind = "move" | "rotate" | "lock" | "clear" | "tetris" | "over" | "select" | "win";
export type HapticProfile = "full" | "light" | "lock" | "off";

const FULL: Record<HapticKind, number | number[]> = {
  move: 5,
  rotate: 8,
  lock: 14,
  clear: 8,
  tetris: [8, 18, 10, 36, 16, 72],
  over: [36, 28, 70, 36, 110],
  select: 10,
  win: [16, 20, 24, 20, 36],
};

const LIGHT: Record<HapticKind, number | number[]> = {
  move: 0,
  rotate: 6,
  lock: 10,
  clear: 6,
  tetris: [10, 16, 28, 48],
  over: [24, 20, 48],
  select: 8,
  win: [10, 16, 22],
};

const LOCK: Record<HapticKind, number | number[]> = {
  move: 0,
  rotate: 0,
  lock: 12,
  clear: 6,
  tetris: [12, 20, 32, 56],
  over: [28, 22, 56],
  select: 0,
  win: [10, 16, 22],
};

let profile: HapticProfile = "full";

export function setHaptic(next: HapticProfile) {
  profile = next;
}

export function haptic(kind: HapticKind) {
  if (profile === "off") return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  const table = profile === "light" ? LIGHT : profile === "lock" ? LOCK : FULL;
  const pat = table[kind];
  if (!pat || pat === 0) return;
  try {
    navigator.vibrate(pat);
  } catch {
    /* unsupported */
  }
}
