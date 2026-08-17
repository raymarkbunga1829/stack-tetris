import { useState } from "react";
import { X } from "lucide-react";
import { formatElapsed, MODES, utcDateKey, type ModeId } from "@/game/modes";
import type { ScoreRow } from "@/game/save";

type Props = {
  open: boolean;
  scores: ScoreRow[];
  dailyRows: ScoreRow[];
  dailyDate: string;
  onClose: () => void;
};

export function BoardSheet({ open, scores, dailyRows, dailyDate, onClose }: Props) {
  const [tab, setTab] = useState<"all" | "daily">("all");
  if (!open) return null;
  const today = utcDateKey();
  const daily = dailyDate === today ? dailyRows : [];
  const list = tab === "daily" ? daily : scores.slice(0, 10);

  async function shareDaily() {
    const lines = daily.length
      ? daily
          .slice(0, 10)
          .map((s, i) => `${i + 1}. ${s.score.toLocaleString()} · ${s.lines}L`)
          .join("\n")
      : "No runs yet.";
    const text = `Stack Daily ${today}\n${lines}`;
    try {
      if (navigator.share) await navigator.share({ title: "Stack Daily", text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* user cancel */
    }
  }

  return (
    <div className="shop-veil" role="dialog" aria-label="Scores">
      <div className="shop">
        <header className="shop-top">
          <div>
            <p className="shop-kicker">{tab === "daily" ? today : "Local"}</p>
            <h2>{tab === "daily" ? "Daily board" : "Scores"}</h2>
          </div>
          <button type="button" className="shop-x" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="shop-tabs">
          <button type="button" className={tab === "all" ? "is-on" : ""} onClick={() => setTab("all")}>
            All
          </button>
          <button type="button" className={tab === "daily" ? "is-on" : ""} onClick={() => setTab("daily")}>
            Daily
          </button>
        </div>
        <ul className="score-list">
          {list.length === 0 && (
            <li className="shop-blurb empty-runs">
              {tab === "daily" ? "No Daily runs today." : "No runs yet."}
            </li>
          )}
          {list.map((s, i) => (
            <li key={`${s.t}-${i}`}>
              <span>{i + 1}</span>
              <b>{tab === "daily" ? `${s.lines} L` : nameOf(s.mode)}</b>
              <em>{s.score.toLocaleString()}</em>
              <small>
                {s.won && s.mode === "sprint" ? formatElapsed(s.clock) : `${s.lines} L`}
              </small>
            </li>
          ))}
        </ul>
        {tab === "daily" && (
          <button type="button" className="shop-buy gc" onClick={() => void shareDaily()}>
            Share today’s board
          </button>
        )}
        <p className="shop-note">
          Daily ranks are this device’s top 10 for {today}. Share the list with a friend.
        </p>
      </div>
    </div>
  );
}

function nameOf(id: ModeId) {
  return MODES.find((m) => m.id === id)?.name ?? id;
}
