export type PadMode = "auto" | "on" | "off";

const listeners = new Set<(on: boolean) => void>();
let keyboardOn = false;

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function isTablet(): boolean {
  if (typeof window === "undefined") return false;
  const w = Math.min(window.innerWidth, window.innerHeight);
  const h = Math.max(window.innerWidth, window.innerHeight);
  return w >= 600 && h >= 800;
}

export function noteKeyboard() {
  if (keyboardOn) return;
  keyboardOn = true;
  listeners.forEach((fn) => fn(true));
}

export function hasKeyboard(): boolean {
  return keyboardOn || hasFinePointer();
}

export function showPad(mode: PadMode): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  if (isCoarsePointer()) return true;
  if (typeof window !== "undefined" && window.innerWidth < 720) return true;
  return !hasKeyboard();
}

export function onKeyboard(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function fitDpr(width: number, height: number, coarse: boolean): number {
  const raw = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  let dpr = Math.min(raw, coarse ? 1.75 : 2);
  const px = width * height * dpr * dpr;
  if (px > 4_200_000) dpr = Math.min(dpr, 1.5);
  if (px > 6_500_000) dpr = Math.min(dpr, 1.25);
  return dpr;
}
