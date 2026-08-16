type Mood = "idle" | "cheer" | "panic";

export function Mascots({ mood }: { mood: Mood }) {
  return (
    <div className={`mascots is-${mood}`} aria-hidden="true">
      <i className="mascot soot" />
      <i className="mascot lumen" />
    </div>
  );
}

export function mascotMood(opts: {
  failing: boolean;
  combo: number;
  banner: string | null;
  lock: boolean;
}): Mood {
  if (opts.failing) return "panic";
  if (opts.lock) return "panic";
  if (opts.combo > 0) return "cheer";
  if (opts.banner && /STACK|CLEAR|T-SPIN|ALL/.test(opts.banner)) return "cheer";
  return "idle";
}
