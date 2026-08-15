import { X } from "lucide-react";
import { formatClock, MODES, type ModeId } from "@/game/modes";
import type { ScoreRow } from "@/game/save";

type Props = {
  open: boolean;
  scores: ScoreRow[];
  onClose: () => void;
};

export function BoardSheet({ open, scores, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="shop-veil" role="dialog" aria-label="Scores">
      <div className="shop">
        <header className="shop-top">
          <div>
            <p className="shop-kicker">Local</p>
            <h2>Scores</h2>
          </div>
          <button type="button" className="shop-x" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <ul className="score-list">
          {scores.length === 0 && <li className="shop-blurb">No runs yet.</li>}
          {scores.slice(0, 10).map((s, i) => (
            <li key={`${s.t}-${i}`}>
              <span>{i + 1}</span>
              <b>{nameOf(s.mode)}</b>
              <em>{s.score.toLocaleString()}</em>
              <small>{s.won && s.mode === "sprint" ? formatClock(s.clock) : `${s.lines} L`}</small>
            </li>
          ))}
        </ul>
        <button type="button" className="shop-buy gc" disabled>
          Game Center — with the iOS build
        </button>
        <p className="shop-note">
          Ranks are saved on this device. Same hook later talks to Game Center.
        </p>
      </div>
    </div>
  );
}

function nameOf(id: ModeId) {
  return MODES.find((m) => m.id === id)?.name ?? id;
}
