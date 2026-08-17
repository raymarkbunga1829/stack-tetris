export type CallRank = "single" | "double" | "triple" | "tetris" | "mini" | "tspin" | "tst" | "pc";

export type Callout = {
  title: string;
  sub: string | null;
  rank: CallRank;
};

export function rankClear(opts: {
  lines: number;
  tspin: boolean;
  mini: boolean;
  perfect: boolean;
}): CallRank {
  if (opts.perfect) return "pc";
  if (opts.tspin && opts.mini) return "mini";
  if (opts.tspin && opts.lines === 3) return "tst";
  if (opts.tspin) return "tspin";
  if (opts.lines >= 4) return "tetris";
  if (opts.lines === 3) return "triple";
  if (opts.lines === 2) return "double";
  return "single";
}

export function titleFor(rank: CallRank): string {
  if (rank === "pc") return "ALL CLEAR";
  if (rank === "mini") return "MINI";
  if (rank === "tst") return "TST";
  if (rank === "tspin") return "T-SPIN";
  if (rank === "tetris") return "TETRIS";
  if (rank === "triple") return "TRIPLE";
  if (rank === "double") return "DOUBLE";
  return "SINGLE";
}

export function speakClear(opts: {
  lines: number;
  tspin: boolean;
  mini: boolean;
  perfect: boolean;
  wasB2b: boolean;
  combo: number;
}): Callout {
  const rank = rankClear(opts);
  const bits: string[] = [];
  if (opts.perfect) bits.push("The well is empty.");
  if (opts.wasB2b && (opts.lines === 4 || opts.tspin || opts.perfect)) bits.push("B2B x2");
  if (opts.combo >= 2) bits.push(`combo ${opts.combo}`);
  return {
    title: titleFor(rank),
    sub: bits.length ? bits.join(" · ") : rank === "pc" ? "The well is empty." : null,
    rank,
  };
}

export function betterRank(a: CallRank | null, b: CallRank): boolean {
  const order: CallRank[] = ["single", "double", "triple", "mini", "tspin", "tst", "tetris", "pc"];
  return order.indexOf(b) > order.indexOf(a ?? "single");
}
