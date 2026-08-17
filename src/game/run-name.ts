import type { ModeId } from "./modes";

export function nameRun(opts: {
  mode: ModeId;
  score: number;
  lines: number;
  won: boolean;
  combo: number;
  stacks: number;
  perfects: number;
  extras?: number;
}): string {
  const { mode, won, combo, stacks, perfects, extras, lines, score } = opts;
  if (perfects > 0 && stacks > 0) return "The Empty Cathedral";
  if (perfects > 0) return "A Clean Moon";
  if (mode === "sprint" && won && (extras === 0 || combo >= 4)) return "The Quiet Forty";
  if (mode === "sprint" && won) return "Forty Before Dawn";
  if (mode === "sprint" && !won) return "Stopped at the Gate";
  if (mode === "blitz" && won) return "The Short Fire";
  if (mode === "blitz" && !won) return "Ash at Two Minutes";
  if (mode === "classic" && !won) return "A Bad Night in Classic";
  if (mode === "classic" && won) return "The Old Machine";
  if (mode === "finesse" && extras === 0) return "Twenty Without Sin";
  if (mode === "finesse" && (extras ?? 0) > 8) return "Heavy Hands";
  if (mode === "finesse") return "Counted Breaths";
  if (mode === "arcade" && !won) return "Blind in the Cabinet";
  if (mode === "zen" && lines >= 40) return "The Long Sketch";
  if (mode === "siege" && won) return "Last Well Standing";
  if (mode === "siege") return "Buried by Eight";
  if (stacks >= 7) return "Seven Omens";
  if (stacks >= 3) return "Three Bells";
  if (combo >= 6) return "The Long Chain";
  if (score >= 20000) return "A Loud Well";
  if (!won && lines === 0) return score > 0 ? "A Soft Fall" : "Nothing Landed";
  if (!won && lines < 8) return "A Short Fall";
  if (!won) return "Left in the Pit";
  return "A Night in the Well";
}