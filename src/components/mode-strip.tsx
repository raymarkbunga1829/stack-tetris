import { MODES, type ModeId } from "@/game/modes";

type Props = {
  mode: ModeId;
  onPick: (id: ModeId) => void;
};

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
          {m.name}
        </button>
      ))}
    </div>
  );
}
