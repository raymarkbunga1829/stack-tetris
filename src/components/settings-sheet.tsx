import { X } from "lucide-react";
import type { PadMode } from "@/game/device";
import type { HapticProfile } from "@/game/save";
import { THEMES, ownsTheme, type ThemeId } from "@/game/themes";

type Props = {
  open: boolean;
  haptic: HapticProfile;
  hardConfirm: boolean;
  ghost: boolean;
  padMode: PadMode;
  padSize: "compact" | "huge";
  marks: boolean;
  holdRight: boolean;
  theme: ThemeId;
  themes: ThemeId[];
  credits: number;
  onClose: () => void;
  onHaptic: (p: HapticProfile) => void;
  onHard: () => void;
  onGhost: () => void;
  onPadMode: (m: PadMode) => void;
  onPadSize: (s: "compact" | "huge") => void;
  onMarks: () => void;
  onHoldRight: () => void;
  onTheme: (id: ThemeId) => void;
  onPreview: (id: ThemeId) => void;
  musicVol: number;
  sfxVol: number;
  onMix: (part: "music" | "sfx", value: number) => void;
};

export function SettingsSheet({
  open,
  haptic,
  hardConfirm,
  ghost,
  padMode,
  padSize,
  marks,
  holdRight,
  theme,
  themes,
  credits,
  onClose,
  onHaptic,
  onHard,
  onGhost,
  onPadMode,
  onPadSize,
  onMarks,
  onHoldRight,
  onTheme,
  onPreview,
  musicVol,
  sfxVol,
  onMix,
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

        <p className="shop-blurb">Mix</p>
        <label className="mix-row">
          <span>Music</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVol}
            onChange={(e) => onMix("music", Number(e.target.value))}
          />
          <b>{Math.round(musicVol * 100)}</b>
        </label>
        <label className="mix-row">
          <span>SFX</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sfxVol}
            onChange={(e) => onMix("sfx", Number(e.target.value))}
          />
          <b>{Math.round(sfxVol * 100)}</b>
        </label>
        <p className="shop-blurb">Haptics</p>
        <div className="shop-tabs">
          {(["full", "light", "lock", "off"] as const).map((p) => (
            <button key={p} type="button" className={haptic === p ? "is-on" : ""} onClick={() => onHaptic(p)}>
              {p === "lock" ? "Locks" : p}
            </button>
          ))}
        </div>

        <button type="button" className={`set-row${hardConfirm ? " is-on" : ""}`} onClick={onHard}>
          <span>Hard drop confirm</span>
          <b>{hardConfirm ? "On" : "Off"}</b>
        </button>
        <button type="button" className={`set-row${ghost ? " is-on" : ""}`} onClick={onGhost}>
          <span>Ghost piece</span>
          <b>{ghost ? "On" : "Off"}</b>
        </button>
        <button type="button" className={`set-row${marks ? " is-on" : ""}`} onClick={onMarks}>
          <span>Colorblind marks</span>
          <b>{marks ? "On" : "Off"}</b>
        </button>
        <button type="button" className={`set-row${holdRight ? " is-on" : ""}`} onClick={onHoldRight}>
          <span>Left hand</span>
          <b>{holdRight ? "Next on left" : "Next on right"}</b>
        </button>
        <p className="shop-blurb">On-screen pad</p>
        <div className="shop-tabs">
          {(["auto", "on", "off"] as const).map((m) => (
            <button key={m} type="button" className={padMode === m ? "is-on" : ""} onClick={() => onPadMode(m)}>
              {m === "auto" ? "Auto" : m === "on" ? "Always" : "Hide"}
            </button>
          ))}
        </div>
        <div className="shop-tabs">
          {(["compact", "huge"] as const).map((s) => (
            <button key={s} type="button" className={padSize === s ? "is-on" : ""} onClick={() => onPadSize(s)}>
              {s === "huge" ? "Huge" : "Compact"}
            </button>
          ))}
        </div>

        <p className="shop-blurb">Well skins</p>
        <ul className="shop-list">
          {THEMES.map((t) => {
            const owned = ownsTheme(themes, t.id);
            return (
              <li key={t.id}>
                <button type="button" className="theme-preview" onClick={() => onPreview(t.id)}>
                  <p className="shop-name">{t.name}</p>
                  <p className="shop-blurb">{t.blurb}</p>
                </button>
                <button
                  type="button"
                  className="shop-buy"
                  data-qa={`theme-${t.id}`}
                  onClick={() => onTheme(t.id)}
                >
                  {theme === t.id && owned ? "On" : owned ? "Use" : t.cost === 0 ? "Free" : `${t.cost} CR`}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="shop-note">
          {credits.toLocaleString()} CR on hand. Ghost (the landing picture) is on
          for every mode except Arcade.
        </p>
      </div>
    </div>
  );
}
