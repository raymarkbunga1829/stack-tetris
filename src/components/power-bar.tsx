import { Bomb, Hourglass, Layers, Shield, Zap } from "lucide-react";
import type { Inventory, PowerId } from "@/game/shop";

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
  onUse: (id: PowerId) => void;
  shieldOn: boolean;
  slowOn: boolean;
  pickOn?: boolean;
};

export function PowerBar({ inv, onUse, shieldOn, slowOn, pickOn }: Props) {
  return (
    <div className="powers" role="group" aria-label="Power-ups">
      {ORDER.map((id) => {
        const Icon = ICO[id];
        const n = inv[id] ?? 0;
        const lit =
          (id === "shield" && shieldOn) ||
          (id === "slow" && slowOn) ||
          (id === "pick" && !!pickOn);
        return (
          <button
            key={id}
            type="button"
            className={`pwr${lit ? " is-lit" : ""}`}
            disabled={n < 1 && id !== "pick"}
            data-qa={`pwr-${id}`}
            aria-label={`${LABEL[id]}, ${n} left`}
            onPointerDown={(e) => {
              e.preventDefault();
              if (n > 0 || (id === "pick" && pickOn)) onUse(id);
            }}
          >
            <Icon size={16} strokeWidth={2} aria-hidden />
            <span>{LABEL[id]}</span>
            <b>{n}</b>
          </button>
        );
      })}
    </div>
  );
}