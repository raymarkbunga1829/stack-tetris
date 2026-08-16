import { formatClock, MODES, peekDailyBag, utcDateKey, type ModeId } from "@/game/modes";
import { PIECE_FILL } from "@/game/pieces";

type Props = {
  mode: ModeId;
  sprintBest: number | null;
  onPick: (id: ModeId) => void;
};

function rule(m: (typeof MODES)[number], sprintBest: number | null): string {
  if (m.id === "sprint" && sprintBest != null) return `PB ${formatClock(sprintBest)}`;
  if (m.id === "arcade") return "No ghost";
  if (m.seconds) return `${Math.round(m.seconds / 60)}:00 · Lv ${m.startLevel}`;
  if (m.lines) return `${m.lines} lines`;
  if (m.id === "daily") return utcDateKey().slice(5);
  if (m.id === "zen") return "No fail";
  return "Ghost on";
}

export function ModeStrip({ mode, sprintBest, onPick }: Props) {
  const dailyBag = peekDailyBag(4);
  return (
    <div className="modes" role="tablist" aria-label="Game mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={mode === m.id ? "is-on" : ""}
          data-qa={`mode-${m.id}`}
          onClick={() => onPick(m.id)}
        >
          <span className="mode-name">{m.name}</span>
          <span className="mode-rule">{rule(m, sprintBest)}</span>
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