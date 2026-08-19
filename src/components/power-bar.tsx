import { Bomb, Hourglass, Layers, Shield, Zap } from "lucide-react";
import { costOf, type Inventory, type PowerId } from "@/game/shop";

const ICO: Record<PowerId, typeof Zap> = {
  zap: Zap,
  slow: Hourglass,
  shield: Shield,
  quake: Bomb,
  pick: Layers,
};

const LABEL: Record<PowerId, string> = {
  zap: "Zap",
  slow: "Slow",
  shield: "Shield",
  quake: "Quake",
  pick: "Pick",
};

const ORDER: PowerId[] = ["zap", "slow", "shield", "quake", "pick"];

type Props = {
  inv: Inventory;
  credits: number;
  onUse: (id: PowerId) => void;
  onBuy: (id: PowerId) => void;
  shieldOn: boolean;
  slowOn: boolean;
  pickOn?: boolean;
};

export function PowerBar({
  inv,
  credits,
  onUse,
  onBuy,
  shieldOn,
  slowOn,
  pickOn,
}: Props) {
  return (
    <div className="powers" role="group" aria-label="Power-ups">
      {ORDER.map((id) => {
        const Icon = ICO[id];
        const n = inv[id] ?? 0;
        const cost = costOf(id);
        const empty = n < 1;
        const lit =
          (id === "shield" && shieldOn) ||
          (id === "slow" && slowOn) ||
          (id === "pick" && !!pickOn);
        return (
          <button
            key={id}
            type="button"
            className={`pwr${lit ? " is-lit" : ""}${empty ? " is-empty" : ""}`}
            data-qa={`pwr-${id}`}
            aria-label={
              empty
                ? credits >= cost
                  ? `${LABEL[id]}, none left, buy one for ${cost} credits`
                  : `${LABEL[id]}, none left, ${cost} credits in the Store`
                : `${LABEL[id]}, ${n} left`
            }
            onPointerDown={(e) => {
              e.preventDefault();
              if (empty) onBuy(id);
              else onUse(id);
            }}
          >
            <Icon size={14} strokeWidth={2.2} aria-hidden />
            <span>{LABEL[id]}</span>
            {empty ? (
              <b className="pwr-cost">
                {cost}
                <i>CR</i>
              </b>
            ) : (
              <b>{n}</b>
            )}
          </button>
        );
      })}
    </div>
  );
}
