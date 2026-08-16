import { formatClock, MODES, peekDailyBag, utcDateKey, type ModeId } from "@/game/modes";
import { PIECE_FILL } from "@/game/pieces";

type Props = {
  mode: ModeId;
  sprintBest: number | null;
  daily?: { date: string; score: number };
  onPick: (id: ModeId) => void;
};

function rule(
  m: (typeof MODES)[number],
  sprintBest: number | null,
  daily?: { date: string; score: number },
): string {
  if (m.id === "sprint" && sprintBest != null) return `PB ${formatClock(sprintBest)}`;
  if (m.id === "arcade") return "No ghost";
  if (m.id === "classic") return "NES · no kicks";
  if (m.seconds) return `${Math.round(m.seconds / 60)}:00 · Lv ${m.startLevel}`;
  if (m.lines) return `${m.lines} lines`;
  if (m.id === "daily") {
    if (daily && daily.date === utcDateKey() && daily.score > 0) {
      return `Today ${daily.score.toLocaleString()}`;
    }
    return utcDateKey().slice(5);
  }
  if (m.id === "zen") return "No fail";
  return "Ghost on";
}

export function ModeStrip({ mode, sprintBest, daily, onPick }: Props) {
  const dailyBag = peekDailyBag(4);
  const played = !!(daily && daily.date === utcDateKey() && daily.score > 0);
  return (
    <div className="modes" role="tablist" aria-label="Game mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={`${mode === m.id ? "is-on" : ""}${m.id === "daily" && played ? " is-played" : ""}`}
          data-qa={`mode-${m.id}`}
          onClick={() => onPick(m.id)}
        >
          <span className="mode-name">{m.name}</span>
          <span className="mode-rule">{rule(m, sprintBest, daily)}</span>
          {m.id === "daily" ? (
            <span className="daily-bag" aria-hidden="true">
              {dailyBag.map((id, i) => (
                <i key={`${id}-${i}`} style={{ background: PIECE_FILL[id] }} />
              ))}
            </span>
          ) : (
            <span className="mode-blurb">{m.blurb}</span>
          )}
        </button>
      ))}
    </div>
  );
}