import { formatElapsed, MODES, peekDailyBag, utcDateKey, type ModeId } from "@/game/modes";
import { PIECE_FILL } from "@/game/pieces";

type Props = {
  mode: ModeId;
  sprintBest: number | null;
  daily?: { date: string; score: number };
  streak?: { count: number; last: string };
  onPick: (id: ModeId) => void;
};

function rule(
  m: (typeof MODES)[number],
  sprintBest: number | null,
  daily?: { date: string; score: number },
  streak?: { count: number; last: string },
): string {
  if (m.id === "sprint" && sprintBest != null) return `PB ${formatElapsed(sprintBest)}`;
  if (m.id === "arcade") return "No ghost";
  if (m.id === "classic") return "NES · no kicks";
  if (m.seconds) return `${Math.round(m.seconds / 60)}:00 · Lv ${m.startLevel}`;
  if (m.lines) return `${m.lines} lines`;
  if (m.id === "daily") {
    if (streak && streak.count > 1 && streak.last === utcDateKey()) {
      return `${streak.count} day streak`;
    }
    if (daily && daily.date === utcDateKey() && daily.score > 0) {
      return `Today ${daily.score.toLocaleString()}`;
    }
    return utcDateKey().slice(5);
  }
  if (m.id === "finesse") return "20 pieces";
  if (m.id === "zen") return "No fail";
  if (m.id === "siege") return "8 wells";
  return "Ghost on";
}

const TITLE_MODES: ModeId[] = ["marathon", "sprint", "blitz", "daily"];
const CHIP_NAME: Partial<Record<ModeId, string>> = {
  marathon: "Marathon",
  sprint: "Sprint",
  blitz: "Blitz",
  daily: "Daily",
};

export function ModeChips({
  mode,
  onPick,
  onMore,
}: {
  mode: ModeId;
  onPick: (id: ModeId) => void;
  onMore: () => void;
}) {
  const featured = TITLE_MODES.includes(mode);
  return (
    <div className="mode-chips" role="tablist" aria-label="Game mode">
      {MODES.filter((m) => TITLE_MODES.includes(m.id)).map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={mode === m.id ? "is-on" : ""}
          style={{ ["--tint" as string]: m.tint }}
          data-qa={`mode-${m.id}`}
          onClick={() => onPick(m.id)}
        >
          <i aria-hidden="true" />
          <span>{CHIP_NAME[m.id] ?? m.name}</span>
        </button>
      ))}
      <button
        type="button"
        role="tab"
        aria-selected={!featured}
        className={`is-more${!featured ? " is-on" : ""}`}
        data-qa="mode-more"
        onClick={onMore}
      >
        <i aria-hidden="true" />
        <span>{featured ? "More" : modeOfName(mode)}</span>
      </button>
    </div>
  );
}

function modeOfName(id: ModeId) {
  return MODES.find((m) => m.id === id)?.name ?? "More";
}

export function ModeStrip({ mode, sprintBest, daily, streak, onPick }: Props) {
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
          style={{ ["--tint" as string]: m.tint }}
          data-qa={`sheet-mode-${m.id}`}
          onClick={() => onPick(m.id)}
        >
          <span className="mode-name">{m.name}</span>
          <span className="mode-rule">{rule(m, sprintBest, daily, streak)}</span>
          {m.id === "daily" ? (
            <span className="daily-bag" aria-hidden="true">
              {dailyBag.map((id, i) => (
                <i key={`${id}-${i}`} style={{ background: PIECE_FILL[id] }} />
              ))}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}