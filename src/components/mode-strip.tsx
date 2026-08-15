import { MODES, type ModeId } from "@/game/modes";

type Props = {
  mode: ModeId;
  onPick: (id: ModeId) => void;
};

function rule(m: (typeof MODES)[number]): string {
  if (m.seconds) return `${Math.round(m.seconds / 60)}:00 · Lv ${m.startLevel}`;
  if (m.lines) return `${m.lines} lines`;
  if (m.id === "daily") return "Shared bag";
  return "Endless";
}

export function ModeStrip({ mode, onPick }: Props) {
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
          <span className="mode-rule">{rule(m)}</span>
          <span className="mode-blurb">{m.blurb}</span>
        </button>
      ))}
    </div>
  );
}
