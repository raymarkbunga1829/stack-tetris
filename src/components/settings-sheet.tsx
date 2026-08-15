import { X } from "lucide-react";
import type { HapticProfile } from "@/game/save";
import { THEMES, ownsTheme, type ThemeId } from "@/game/themes";

type Props = {
  open: boolean;
  haptic: HapticProfile;
  hardConfirm: boolean;
  theme: ThemeId;
  themes: ThemeId[];
  credits: number;
  onClose: () => void;
  onHaptic: (p: HapticProfile) => void;
  onHard: () => void;
  onTheme: (id: ThemeId) => void;
};

export function SettingsSheet({
  open,
  haptic,
  hardConfirm,
  theme,
  themes,
  credits,
  onClose,
  onHaptic,
  onHard,
  onTheme,
}: Props) {
  if (!open) return null;
  return (
    <div className="shop-veil" role="dialog" aria-label="Settings">
      <div className="shop">
        <header className="shop-top">
          <div>
            <p className="shop-kicker">Cabinet</p>
            <h2>Settings</h2>
          </div>
          <button type="button" className="shop-x" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <p className="shop-blurb">Haptics</p>
        <div className="shop-tabs">
          {(["full", "light", "off"] as const).map((p) => (
            <button key={p} type="button" className={haptic === p ? "is-on" : ""} onClick={() => onHaptic(p)}>
              {p}
            </button>
          ))}
        </div>

        <button type="button" className={`set-row${hardConfirm ? " is-on" : ""}`} onClick={onHard}>
          <span>Hard drop confirm</span>
          <b>{hardConfirm ? "On" : "Off"}</b>
        </button>

        <p className="shop-blurb">Well skins</p>
        <ul className="shop-list">
          {THEMES.map((t) => {
            const owned = ownsTheme(themes, t.id);
            return (
              <li key={t.id}>
                <div>
                  <p className="shop-name">{t.name}</p>
                  <p className="shop-blurb">{t.blurb}</p>
                </div>
                <button
                  type="button"
                  className="shop-buy"
                  data-qa={`theme-${t.id}`}
                  onClick={() => onTheme(t.id)}
                >
                  {theme === t.id ? "On" : owned ? "Use" : t.cost === 0 ? "Free" : `${t.cost} CR`}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="shop-note">
          {credits.toLocaleString()} CR on hand. Cuts: I aqua · O citrine · T amethyst · S emerald ·
          Z ruby · J sapphire · L topaz.
        </p>
      </div>
    </div>
  );
}
