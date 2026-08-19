import { useEffect, useState } from "react";
import { Bomb, Coins, Hourglass, Layers, Shield, Sparkles, X, Zap } from "lucide-react";
import {
  POWERS,
  SKUS,
  type PowerId,
  type Sku,
} from "@/game/shop";

const ICO: Record<PowerId, typeof Zap> = {
  zap: Zap,
  slow: Hourglass,
  shield: Shield,
  quake: Bomb,
  pick: Layers,
};

type Props = {
  open: boolean;
  credits: number;
  buying: string | null;
  want?: PowerId | null;
  onClose: () => void;
  onBuyCredits: (sku: Sku) => void;
  onBuyPower: (id: PowerId) => void;
};

export function ShopSheet({
  open,
  credits,
  buying,
  want,
  onClose,
  onBuyCredits,
  onBuyPower,
}: Props) {
  const [tab, setTab] = useState<"iap" | "ops">("iap");
  useEffect(() => {
    if (open && want) setTab("ops");
  }, [open, want]);
  if (!open) return null;

  return (
    <div className="shop-veil" role="dialog" aria-label="Store">
      <div className="shop">
        <header className="shop-top">
          <div>
            <p className="shop-kicker">Store</p>
            <h2>Ops locker</h2>
          </div>
          <p className="shop-cr">
            {credits.toLocaleString()} <span>CR</span>
          </p>
          <button type="button" className="shop-x" aria-label="Close store" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="shop-tabs">
          <button
            type="button"
            className={tab === "iap" ? "is-on" : ""}
            onClick={() => setTab("iap")}
          >
            Credits
          </button>
          <button
            type="button"
            className={tab === "ops" ? "is-on" : ""}
            onClick={() => setTab("ops")}
          >
            Powers
          </button>
        </div>

        {tab === "iap" ? (
          <ul className="shop-list">
            {SKUS.map((sku) => (
              <li key={sku.id}>
                <span className="shop-mark" aria-hidden="true">
                  {sku.id.includes("pack") || sku.credits >= 400 ? (
                    <Sparkles size={16} />
                  ) : (
                    <Coins size={16} />
                  )}
                </span>
                <div>
                  <p className="shop-name">{sku.name}</p>
                  <p className="shop-blurb">{sku.blurb}</p>
                </div>
                <button
                  type="button"
                  className="shop-buy"
                  data-qa={`sku-${sku.id}`}
                  disabled={buying !== null}
                  onClick={() => onBuyCredits(sku)}
                >
                  {buying === sku.id ? "…" : sku.price}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="shop-list">
            {POWERS.map((p) => {
              const Icon = ICO[p.id];
              const short = credits < p.cost;
              return (
                <li key={p.id} className={want === p.id ? "is-want" : undefined}>
                  <Icon size={18} className="shop-ico" aria-hidden />
                  <div>
                    <p className="shop-name">{p.name}</p>
                    <p className="shop-blurb">{p.blurb}</p>
                  </div>
                  <button
                    type="button"
                    className={`shop-buy${short ? " is-short" : ""}`}
                    data-qa={`buy-${p.id}`}
                    disabled={buying !== null}
                    aria-label={
                      short
                        ? `${p.name}, ${p.cost} CR, get more credits`
                        : `Buy ${p.name} for ${p.cost} CR`
                    }
                    onClick={() => (short ? setTab("iap") : onBuyPower(p.id))}
                  >
                    {p.cost} CR
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="shop-note">
          Preview store. Buys save on this device. Native App Store billing
          plugs into the same SKUs later.
        </p>
      </div>
    </div>
  );
}
