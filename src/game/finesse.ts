import { cellsOf } from "./pieces";
import { HIDDEN_ROWS, type PieceId, type Rot } from "./types";

export type FinesseGrade = "perfect" | "slide" | "turn";

export type FinesseMark = {
  grade: FinesseGrade;
  extraSlide: number;
  extraRot: number;
};

export function needSlides(bornX: number, lockX: number): number {
  return Math.abs(lockX - bornX);
}

/** 180 is one tap. O never needs a turn. */
export function needRots(id: PieceId, lockRot: Rot): number {
  if (id === "O") return 0;
  return lockRot === 0 ? 0 : 1;
}

export function gradeFinesse(opts: {
  id: PieceId;
  bornX: number;
  lockX: number;
  lockRot: Rot;
  slides: number;
  rots: number;
}): FinesseMark {
  const extraSlide = Math.max(0, opts.slides - needSlides(opts.bornX, opts.lockX));
  const extraRot = Math.max(0, opts.rots - needRots(opts.id, opts.lockRot));
  let grade: FinesseGrade = "perfect";
  if (extraSlide > 0 || extraRot > 0) {
    grade = extraSlide >= extraRot ? "slide" : "turn";
  }
  return { grade, extraSlide, extraRot };
}

/** Dim cells along the cheap slide, at the lock pose. */
export function cheapTrail(
  id: PieceId,
  bornX: number,
  lockX: number,
  lockRot: Rot,
  lockY: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const step = lockX === bornX ? 0 : lockX > bornX ? 1 : -1;
  const xs = step === 0 ? [lockX] : [];
  if (step !== 0) {
    for (let x = bornX; x !== lockX + step; x += step) xs.push(x);
  }
  const seen = new Set<string>();
  for (const x of xs) {
    for (const c of cellsOf(id, lockRot, x, lockY)) {
      if (c.y < HIDDEN_ROWS) continue;
      const key = `${c.x},${c.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x: c.x, y: c.y });
    }
  }
  return out;
}

export function gradeTitle(grade: FinesseGrade): "PERFECT" | "SLIDE" | "TURN" {
  if (grade === "slide") return "SLIDE";
  if (grade === "turn") return "TURN";
  return "PERFECT";
}
