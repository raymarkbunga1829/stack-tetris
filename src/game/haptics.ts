export type HapticKind = "move" | "rotate" | "lock" | "clear" | "tetris" | "over" | "select" | "win";
export type HapticProfile = "full" | "light" | "off";

const FULL: Record<HapticKind, number | number[]> = {
  move: 5,
  rotate: 8,
  lock: 14,
  clear: [10, 18, 16],
  tetris: [18, 22, 20, 22, 42],
  over: [28, 36, 48],
  select: 10,
  win: [16, 20, 24, 20, 36],
};

const LIGHT: Record<HapticKind, number | number[]> = {
  move: 0,
  rotate: 6,
  lock: 10,
  clear: 14,
  tetris: [12, 16, 24],
  over: 24,
  select: 8,
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
  const table = profile === "light" ? LIGHT : FULL;
  const pat = table[kind];
  if (!pat || pat === 0) return;
  try {
    navigator.vibrate(pat);
  } catch {
    /* unsupported */
  }
}
