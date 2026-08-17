import { useState } from "react";
import { X } from "lucide-react";
import { formatElapsed, formatManilaDate, manilaDateKey, MODES, type ModeId } from "@/game/modes";
import type { ScoreRow } from "@/game/save";

type Props = {
  open: boolean;
  scores: ScoreRow[];
  dailyRows: ScoreRow[];
  dailyDate: string;
  yesterdayRows: ScoreRow[];
  yesterdayDate: string;
  onWatchYesterday?: () => void;
  canWatchYesterday?: boolean;
  onClose: () => void;
};

export function BoardSheet({
  open,
  scores,
  dailyRows,
  dailyDate,
  yesterdayRows,
  yesterdayDate,
  onWatchYesterday,
  canWatchYesterday,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"all" | "daily" | "yesterday">("all");
  if (!open) return null;
  const today = manilaDateKey();
  const daily = dailyDate === today ? dailyRows : [];
  const yestDate = dailyDate === today ? yesterdayDate : dailyDate;
  const yest = dailyDate === today ? yesterdayRows : dailyRows;
  const list = tab === "yesterday" ? yest : tab === "daily" ? daily : scores.slice(0, 10);
  const stamp = tab === "yesterday" ? yestDate : today;

  async function shareDaily() {
    const rows = tab === "yesterday" ? yest : daily;
    const lines = rows.length
      ? rows
          .slice(0, 10)
          .map((s, i) => `${i + 1}. ${s.score.toLocaleString()} · ${s.lines}L`)
          .join("\n")
      : "No runs yet.";
    const text = `Stack Daily ${stamp}\n${lines}`;
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
            <p className="shop-kicker">
              {tab === "all" ? "Local" : formatManilaDate(stamp)}
            </p>
            <h2>{tab === "yesterday" ? "Yesterday" : tab === "daily" ? "Daily" : "Scores"}</h2>
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
          {yestDate && yestDate !== today && (
            <button
              type="button"
              className={tab === "yesterday" ? "is-on" : ""}
              onClick={() => setTab("yesterday")}
            >
              Yesterday
            </button>
          )}
        </div>
        <ul className="score-list">
          {list.length === 0 && (
            <li className="shop-blurb empty-runs">
              {tab === "daily"
                ? "No Daily runs today."
                : tab === "yesterday"
                  ? "No run kept."
                  : "No runs yet."}
            </li>
          )}
          {list.map((s, i) => (
            <li key={`${s.t}-${i}`}>
              <span>{i + 1}</span>
              <b>{tab === "all" ? nameOf(s.mode) : `${s.lines} L`}</b>
              <em>{s.score.toLocaleString()}</em>
              <small>
                {s.won && s.mode === "sprint" ? formatElapsed(s.clock) : `${s.lines} L`}
              </small>
            </li>
          ))}
        </ul>
        {tab === "yesterday" && canWatchYesterday && onWatchYesterday && (
          <button type="button" className="shop-buy gc" onClick={onWatchYesterday}>
            Watch yesterday
          </button>
        )}
        {(tab === "daily" || tab === "yesterday") && (
          <button type="button" className="shop-buy gc" onClick={() => void shareDaily()}>
            {tab === "yesterday" ? "Share yesterday" : "Share today’s board"}
          </button>
        )}
        <p className="shop-note">
          Same bag for everyone on the Manila day. This device only.
        </p>
      </div>
    </div>
  );
}

function nameOf(id: ModeId) {
  return MODES.find((m) => m.id === id)?.name ?? id;
}