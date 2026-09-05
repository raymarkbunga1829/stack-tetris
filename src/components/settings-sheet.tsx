import { X } from "lucide-react";
import type { PadMode } from "@/game/device";
import { CABINET, NOW, stationOf, type StationId } from "@/game/radio";
import type { HapticProfile } from "@/game/save";
import { THEMES, ownsTheme, type ThemeId } from "@/game/themes";

const HANDLING_PRESETS = [
  { name: "Relaxed", dasMs: 220, arrMs: 50, sdf: 10 },
  { name: "Classic", dasMs: 167, arrMs: 33, sdf: 20 },
  { name: "Fast", dasMs: 100, arrMs: 16, sdf: 40 },
] as const;

type Props = {
  open: boolean;
  haptic: HapticProfile;
  hardConfirm: boolean;
  ghost: boolean;
  padMode: PadMode;
  padSize: "compact" | "huge";
  marks: boolean;
  holdRight: boolean;
  scan: boolean;
  swipeDrop: boolean;
  clearWell: boolean;
  dasMs: number;
  arrMs: number;
  sdf: number;
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
  onScan: () => void;
  onSwipeDrop: () => void;
  onClearWell: () => void;
  onHandling: (part: "dasMs" | "arrMs" | "sdf", value: number) => void;
  onTheme: (id: ThemeId) => void;
  onPreview: (id: ThemeId) => void;
  musicVol: number;
  sfxVol: number;
  onMix: (part: "music" | "sfx", value: number) => void;
  station: StationId;
  onStation: (id: StationId) => void;
  botPlay: boolean;
  botAllowed: boolean;
  onBot: () => void;
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
  scan,
  swipeDrop,
  clearWell,
  dasMs,
  arrMs,
  sdf,
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
  onScan,
  onSwipeDrop,
  onClearWell,
  onHandling,
  onTheme,
  onPreview,
  musicVol,
  sfxVol,
  onMix,
  station,
  onStation,
  botPlay,
  botAllowed,
  onBot,
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

        <p className="shop-blurb">Bot</p>
        <button
          type="button"
          className={`set-row${botPlay ? " is-on" : ""}`}
          data-qa="set-bot"
          disabled={!botAllowed}
          aria-pressed={botPlay}
          onClick={onBot}
        >
          <span>ES bot</span>
          <b>{!botAllowed ? "—" : botPlay ? "On" : "Off"}</b>
        </button>
        <p className="shop-note" data-qa="set-bot-note">
          {!botAllowed
            ? "The bot does not play Finesse."
            : botPlay
              ? "The bot is driving. Turn it off to take the pad."
              : "Off. You drive. Turn it on and the ES bot takes the well."}
        </p>

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
        <p className="shop-blurb">Radio</p>
        <div className="shop-tabs radio-auto" data-qa="radio-auto">
          <button
            type="button"
            className={station === "auto" ? "is-on" : ""}
            data-qa="station-auto"
            onClick={() => onStation("auto")}
          >
            {stationOf("auto").name}
          </button>
        </div>
        <div className="radio-shelf" data-qa="radio-now">
          <p className="shop-kicker">Now</p>
          <div className="shop-tabs radio-dial">
            {NOW.map((s) => (
              <button
                key={s.id}
                type="button"
                className={station === s.id ? "is-on" : ""}
                data-qa={`station-${s.id}`}
                onClick={() => onStation(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="radio-shelf" data-qa="radio-cabinet">
          <p className="shop-kicker">Cabinet</p>
          <div className="shop-tabs radio-dial">
            {CABINET.map((s) => (
              <button
                key={s.id}
                type="button"
                className={station === s.id ? "is-on" : ""}
                data-qa={`station-${s.id}`}
                onClick={() => onStation(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <p className="shop-note" data-qa="station-blurb">
          {stationOf(station).blurb}
        </p>
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
        <button type="button" className={`set-row${scan ? " is-on" : ""}`} onClick={onScan}>
          <span>Scanlines</span>
          <b>{scan ? "On" : "Off"}</b>
        </button>
        <button type="button" className={`set-row${swipeDrop ? " is-on" : ""}`} onClick={onSwipeDrop}>
          <span>Swipe down to drop</span>
          <b>{swipeDrop ? "On" : "Off"}</b>
        </button>
        <button type="button" className={`set-row${clearWell ? " is-on" : ""}`} onClick={onClearWell}>
          <span>Clear well</span>
          <b>{clearWell ? "On" : "Off"}</b>
        </button>
        <p className="shop-blurb">Handling</p>
        <div className="shop-tabs" role="group" aria-label="Control speed presets">
          {HANDLING_PRESETS.map((preset) => {
            const active = dasMs === preset.dasMs && arrMs === preset.arrMs && sdf === preset.sdf;
            return (
              <button
                key={preset.name}
                type="button"
                className={active ? "is-on" : ""}
                aria-pressed={active}
                onClick={() => {
                  onHandling("dasMs", preset.dasMs);
                  onHandling("arrMs", preset.arrMs);
                  onHandling("sdf", preset.sdf);
                }}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
        <p className="shop-note">
          Choose a control speed, or fine-tune below. Classic restores the original settings.
        </p>
        <label className="mix-row">
          <span>DAS</span>
          <input
            type="range"
            min={50}
            max={300}
            step={1}
            value={dasMs}
            aria-label="Movement repeat delay"
            aria-valuetext={`${dasMs} milliseconds`}
            onChange={(e) => onHandling("dasMs", Number(e.target.value))}
          />
          <b>{dasMs}</b>
        </label>
        <p className="shop-note">DAS: delay before a held direction repeats. Lower starts moving sooner. The on-screen pad uses its own fixed delay.</p>
        <label className="mix-row">
          <span>ARR</span>
          <input
            type="range"
            min={0}
            max={80}
            step={1}
            value={arrMs}
            aria-label="Movement repeat interval"
            aria-valuetext={arrMs === 0 ? "Instant movement to the wall" : `${arrMs} milliseconds`}
            onChange={(e) => onHandling("arrMs", Number(e.target.value))}
          />
          <b>{arrMs}</b>
        </label>
        <p className="shop-note">ARR: time between repeated moves. Zero moves instantly to the wall.</p>
        <label className="mix-row">
          <span>SDF</span>
          <input
            type="range"
            min={5}
            max={40}
            step={1}
            value={sdf}
            aria-label="Soft drop speed multiplier"
            aria-valuetext={`${sdf} times gravity`}
            onChange={(e) => onHandling("sdf", Number(e.target.value))}
          />
          <b>{sdf}</b>
        </label>
        <p className="shop-note">SDF: soft drop speed multiplier. Higher drops faster while you hold down.</p>
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
                  <span className="theme-swatch" aria-hidden="true">
                    <i className="swatch-pit" style={{ background: t.pit }} />
                    <i style={{ background: t.fill.I }} />
                    <i style={{ background: t.fill.T }} />
                    <i style={{ background: t.fill.O }} />
                  </span>
                  <p className="shop-name">{t.name}</p>
                  <p className="shop-blurb">{t.blurb}</p>
                </button>
                <button
                  type="button"
                  className="shop-buy"
                  data-qa={`theme-${t.id}`}
                  onClick={() => onTheme(t.id)}
                >
                  {theme === t.id && owned
                    ? "On"
                    : owned
                      ? "Use"
                      : t.relic
                        ? "Rite"
                        : t.cost === 0
                          ? "Free"
                          : `${t.cost} CR`}
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
