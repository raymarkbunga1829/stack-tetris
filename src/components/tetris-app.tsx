import { useEffect, useRef, useState } from "react";
import {
  armAudio,
  resumeAudio,
  setMix,
  setMuted,
  sfxCombo,
  sfxB2b,
  sfxFinesse,
  sfxHard,
  sfxHold,
  sfxLevel,
  sfxLine,
  sfxLock,
  sfxMove,
  sfxOmen,
  sfxOver,
  sfxPerfect,
  sfxPower,
  sfxRotate,
  sfxSelect,
  sfxShatter,
  sfxSoft,
  sfxStart,
  sfxSweep,
  sfxTetris,
  setMusicPaused,
  setMusicTension,
  setStation,
  startMusic,
  stopMusic,
  unlockAudio,
} from "@/game/audio";
import { haptic, setHaptic } from "@/game/haptics";
import { isAndroid, isIOS, onKeyboard, showPad, type PadMode } from "@/game/device";
import { createGestures, type GestureEmit, type GestureLabel } from "@/game/gestures";
import { createInput, type InputApi, type Pad } from "@/game/input";
import { applyMissions, type MissionBook } from "@/game/missions";
import {
  dailySeed,
  formatClock,
  formatElapsed,
  formatManilaDate,
  manilaDateKey,
  moonPhase,
  modeOf,
  powersAllowed,
  sprintPace,
  botAllowed,
  type ModeId,
} from "@/game/modes";
import { armBot, botPulse, ZEN_LOCK_CAP, type BotHand } from "@/game/bot";
import { clearLastAsh, clearLastStain, getDailyReplay, getLastAsh, getLastReplay, getLastStain, setDailyReplay, setLastAsh, setLastReplay, setLastStain } from "@/game/last-replay";
import { cheapTrail, gradeFinesse, gradeTitle } from "@/game/finesse";
import { nameRun } from "@/game/run-name";
import { registerOffline, watchLine } from "@/game/offline";
import { betterRank, speakClear, type Callout, type CallRank } from "@/game/callout";
import { shareRun } from "@/game/share-run";
import { REPLAY_STEP, takeSnap, type Snap } from "@/game/replay";
import { resizeCanvas } from "@/game/render";
import { createViz } from "@/game/viz";
import { createWell3d, type Well3d } from "@/game/well3d";
import { loadSave, recordRun, writeSave, type HapticProfile, type SaveData } from "@/game/save";
import type { StationId } from "@/game/radio";
import { buyTheme, themeOf, type ThemeId } from "@/game/themes";
import {
  advance,
  applyPower,
  createSim,
  dirtyRows,
  dragPiece,
  ghostY,
  headroom,
  inDanger,
  onBrink,
  pauseToggle,
  pickFromNext,
  predictCollision,
  pulseAction,
  undoZen,
  type Sim,
} from "@/game/sim";
import { cellsOf, kickLabel } from "@/game/pieces";
import { HIDDEN_ROWS, COLS, ROWS, DAS_TOUCH, type Phase, type PieceId } from "@/game/types";
import {
  buyWithCredits,
  consumePower,
  purchaseSku,
  type Inventory,
  type PowerId,
  type Sku,
} from "@/game/shop";
import { CoachCard, nextCoach, type CoachStep } from "./coach-card";
import { SiegeRail } from "./siege-rail";
import {
  createSiege,
  cycleAim,
  garbageFor,
  injectGarbage,
  sendGarbage,
  siegeWon,
  snapshotSiege,
  takeIncoming,
  tickSiege,
  type Siege,
} from "@/game/siege";
import { MiniPiece } from "./mini-piece";
import { MissionRow } from "./mission-row";
import { ModeChips, ModeStrip } from "./mode-strip";
import { PowerBar } from "./power-bar";
import { SettingsSheet } from "./settings-sheet";
import { ShopSheet } from "./shop-sheet";
import { BoardSheet } from "./board-sheet";
import { TouchPad } from "./touch-pad";

type Ui = {
  phase: Phase;
  score: number;
  high: number;
  lines: number;
  level: number;
  hold: PieceId | null;
  next: PieceId[];
  banner: string | null;
  callout: Callout | null;
  holeHint: boolean;
  gesture: string | null;
  muted: boolean;
  musicVol: number;
  sfxVol: number;
  station: StationId;
  drag: boolean;
  standalone: boolean;
  credits: number;
  inv: Inventory;
  shop: boolean;
  settings: boolean;
  board: boolean;
  slow: boolean;
  shield: boolean;
  mode: ModeId;
  clock: number;
  timeLeft: number | null;
  won: boolean;
  coach: CoachStep | null;
  theme: ThemeId;
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
  modesOpen: boolean;
  watching: boolean;
  streak: { count: number; last: string };
  missions: MissionBook;
  /** The daily goal that just paid, so the credits arrive with a name on them. */
  goal: { name: string; cr: number; n: number } | null;
  picking: boolean;
  combo: number;
  b2b: boolean;
  comboPop: number;
  b2bPop: number;
  sprintBest: number | null;
  recap: {
    mode: ModeId;
    lines: number;
    level: number;
    combo: number;
    tspins: number;
    stacks: number;
    clock: number;
    splits: number[];
    perfects: number;
    extras?: number;
    clean?: number;
    pieces?: number;
    dailyDate?: string;
    streakCount?: number;
  } | null;
  tip: string | null;
  bagLine: boolean;
  offline: boolean;
  finesseN: number;
  finesseClean: number;
  pred: { rows: number; lock: boolean; kick: boolean } | null;
  holdPeek: PieceId | null;
  failing: boolean;
  live: PieceId | null;
  danger: boolean;
  brink: boolean;
  bag: PieceId[];
  canHold: boolean;
  canUndo: boolean;
  lockPop: number;
  tintPop: number;
  lifting: boolean;
  pbPop: number;
  coinTake: boolean;
  levelPop: number;
  bagPop: number;
  dropAsk: boolean;
  powerAsk: PowerId | null;
  intro: string | null;
  takeover: number;
  cinema: boolean;
  handoff: PieceId | null;
  epitaph: string | null;
  cause: string | null;
  siege: import("@/game/siege").SiegeSnap | null;
  watchPace: 1 | 2;
  botPlay: boolean;
};

/** How long a spent run flashes "Insert coin" before the card comes up. */
const COIN_FLASH = 720;
/** How long a run stays over before the well will take another coin: the flash, then a beat to read. */
const COIN_WAIT = COIN_FLASH + 420;
/** How long a paid daily goal stays up: long enough to read the name on the money. */
const GOAL_READ = 2;

function forceCoach() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("coach");
}

function radioLabel(music: number, sfx: number): string {
  if (music > 0) return "Radio on";
  return sfx > 0 ? "Radio low" : "Radio off";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<{ prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & { prompt: () => Promise<void> };
      setPromptEvent(ev);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (isIOS()) {
    return (
      <a className="text-btn install" href="?install=1&platform=ios">
        Add to Home Screen
      </a>
    );
  }

  if (promptEvent) {
    return (
      <button
        type="button"
        className="text-btn install"
        onClick={() => {
          void promptEvent.prompt();
        }}
      >
        Install app
      </button>
    );
  }

  return (
    <button
      type="button"
      className="text-btn install"
      onClick={() => {
        window.alert("Use your browser menu → Install app / Add to Home screen.");
      }}
    >
      Install app
    </button>
  );
}

export function TetrisApp() {
  const well3dRef = useRef<Well3d | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizCanvasRef = useRef<HTMLCanvasElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const inputRef = useRef<InputApi | null>(null);
  const vizRef = useRef(createViz());
  const saveRef = useRef<SaveData>(loadSave());
  const rafRef = useRef(0);
  const lastTs = useRef(0);
  const shakeRef = useRef(0);
  const bannerT = useRef(0);
  const bannerKind = useRef<"plain" | "mid" | "big">("plain");
  const calloutT = useRef(0);
  const goalT = useRef(0);
  const bestStill = useRef<{ snap: Snap; label: string; rank: CallRank } | null>(null);
  const swipeRef = useRef<ReturnType<typeof createGestures> | null>(null);
  const applyGestureRef = useRef<(ev: GestureEmit) => void>(() => {});
  const lastGestureRef = useRef<GestureLabel | null>(null);
  const gestureT = useRef(0);
  const grabRef = useRef<number | null>(null);
  const hardArm = useRef(0);
  const powerArm = useRef<{ id: PowerId | null; at: number }>({ id: null, at: 0 });
  const replayRef = useRef<Snap[] | null>(null);
  const replayI = useRef(0);
  const replayT = useRef(0);
  const comboSeen = useRef(-1);
  const b2bSeen = useRef(false);
  const failT = useRef(0);
  const dying = useRef(false);
  const coinAt = useRef(0);
  const dangerSaid = useRef(false);
  const holdPeekT = useRef(0);

  const [ui, setUi] = useState<Ui>({
    phase: "title",
    score: 0,
    high: saveRef.current.high,
    lines: 0,
    level: 1,
    hold: null,
    next: [],
    banner: null,
    callout: null,
    holeHint: false,
    gesture: null,
    muted: saveRef.current.muted,
    musicVol: saveRef.current.musicVol,
    sfxVol: saveRef.current.sfxVol,
    station: saveRef.current.station,
    drag: saveRef.current.drag,
    standalone: false,
    credits: saveRef.current.credits,
    inv: saveRef.current.inv,
    shop: false,
    settings: false,
    board: false,
    slow: false,
    shield: false,
    mode: saveRef.current.mode,
    clock: 0,
    timeLeft: null,
    won: false,
    coach: saveRef.current.onboarded ? null : "drag",
    theme: saveRef.current.theme,
    haptic: saveRef.current.haptic,
    hardConfirm: saveRef.current.hardConfirm,
    ghost: saveRef.current.ghost,
    padMode: saveRef.current.padMode,
    padSize: saveRef.current.padSize,
    marks: saveRef.current.marks,
    holdRight: saveRef.current.holdRight,
    scan: saveRef.current.scan,
    swipeDrop: saveRef.current.swipeDrop,
    clearWell: saveRef.current.clearWell,
    dasMs: saveRef.current.dasMs,
    arrMs: saveRef.current.arrMs,
    sdf: saveRef.current.sdf,
    modesOpen: false,
    watching: false,
    streak: saveRef.current.streak,
    missions: saveRef.current.missions,
    goal: null,
    picking: false,
    combo: 0,
    b2b: false,
    comboPop: 0,
    b2bPop: 0,
    sprintBest: saveRef.current.sprintBest,
    recap: null,
    tip: null,
    bagLine: false,
    // Only the browser knows whether the line is up. A server guess ships a title that reads as dead.
    offline: false,
    finesseN: 0,
    finesseClean: 0,
    pred: null,
    holdPeek: null,
    failing: false,
    live: null,
    danger: false,
    brink: false,
    bag: [],
    canHold: true,
    canUndo: false,
    lockPop: 0,
    tintPop: 0,
    lifting: false,
    pbPop: 0,
    coinTake: false,
    levelPop: 0,
    bagPop: 0,
    dropAsk: false,
    powerAsk: null,
    intro: null,
    takeover: 0,
    cinema: false,
    handoff: null,
    epitaph: null,
    cause: null,
    siege: null,
    watchPace: 1,
    botPlay: false,
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const [buying, setBuying] = useState<string | null>(null);
  const [want, setWant] = useState<PowerId | null>(null);
  const [viewW, setViewW] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  const pulseRef = useRef<(p: Partial<Pad>) => void>(() => {});
  const finesseN = useRef(0);
  const finesseClean = useRef(0);
  const finesseExtras = useRef(0);
  const pieceBorn = useRef({ x: 3, slides: 0, rots: 0 });
  const splitSeen = useRef(0);
  const lastMix = useRef({ music: 1, sfx: 1 });
  const attractUntil = useRef(0);
  const attractOn = useRef(false);
  const quietT = useRef(0);
  const bagN = useRef(0);
  const holdUsed = useRef(false);
  const lockN = useRef(0);
  const sawOmen = useRef(false);
  const uglySaid = useRef(false);
  const siegeRef = useRef<Siege | null>(null);
  const botHand = useRef<BotHand | null>(null);
  const botPace = useRef<1 | 2>(1);
  const botPlayRef = useRef(false);
  const finishRunRef = useRef<(s: Sim) => void>(() => {});

  useEffect(() => onKeyboard(() => setViewW(window.innerWidth)), []);
  useEffect(() => {
    const on = () => setViewW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("is-android", isAndroid());
    document.documentElement.classList.toggle("is-ios", isIOS());
    document.documentElement.classList.toggle(
      "is-touch",
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720,
    );
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVv = () => {
      well3dRef.current?.resize();
    };
    vv.addEventListener("resize", onVv);
    vv.addEventListener("scroll", onVv);
    return () => {
      vv.removeEventListener("resize", onVv);
      vv.removeEventListener("scroll", onVv);
    };
  }, []);

  useEffect(() => {
    setMix({ music: saveRef.current.musicVol, sfx: saveRef.current.sfxVol });
    setStation(saveRef.current.station);
    armAudio();
    setHaptic(saveRef.current.haptic);
    setUi((p) => ({
      ...p,
      muted: saveRef.current.muted,
      high: saveRef.current.high,
      drag: saveRef.current.drag,
      theme: saveRef.current.theme,
      haptic: saveRef.current.haptic,
      hardConfirm: saveRef.current.hardConfirm,
      missions: saveRef.current.missions,
      mode: saveRef.current.mode,
      standalone: isStandalone(),
    }));
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setUi((p) => ({ ...p, standalone: isStandalone() }));
    mq.addEventListener("change", onMode);
    const today = manilaDateKey();
    if (saveRef.current.seenDay !== today) {
      saveRef.current = { ...saveRef.current, seenDay: today };
      writeSave(saveRef.current);
      setUi((p) => ({ ...p, bagLine: true }));
    }
    const stopLine = watchLine((online) => {
      setUi((p) => (p.offline === !online ? p : { ...p, offline: !online }));
    });
    const stopSw = registerOffline(() => {
      const phase = uiRef.current.phase;
      return phase === "title" || phase === "over";
    });
    return () => {
      mq.removeEventListener("change", onMode);
      stopLine();
      stopSw();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const vizCanvas = vizCanvasRef.current;
    const well = wellRef.current;
    if (!canvas || !well) return;

    const input = createInput();
    inputRef.current = input;
    input.setPulse((p) => pulseRef.current(p));
    const gestures = createGestures((ev) => applyGestureRef.current(ev), {
      swipeDrop: () => saveRef.current.swipeDrop,
    });
    swipeRef.current = gestures;

    try {
      const engine = createWell3d(canvas);
      well3dRef.current = engine;
      engine.setClear(
        saveRef.current.clearWell ||
          saveRef.current.mode === "sprint" ||
          saveRef.current.mode === "daily",
      );
      const ro = new ResizeObserver(() => {
        engine.resize();
        if (vizCanvas) resizeCanvas(vizCanvas);
      });
      ro.observe(well);
      engine.resize();
      if (vizCanvas) resizeCanvas(vizCanvas);

      const onVis = () => {
        if (!document.hidden) {
          resumeAudio();
          if (simRef.current?.phase === "playing") setMusicPaused(false);
        } else if (simRef.current?.phase === "playing") {
          simRef.current.phase = "paused";
          setMusicPaused(true);
          syncUi();
        }
      };
      document.addEventListener("visibilitychange", onVis);

      lastTs.current = performance.now();
      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - lastTs.current) / 1000);
        lastTs.current = now;
        tick(dt);
        paint();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      if (import.meta.env.DEV || new URLSearchParams(location.search).has("qa")) {
        window.__controlsTest = {
          getX: () => simRef.current?.piece?.x ?? 0,
          getY: () => simRef.current?.piece?.y ?? 0,
          getRot: () => simRef.current?.piece?.rot ?? 0,
          getPhase: () => uiRef.current.phase,
          getScore: () => simRef.current?.score ?? 0,
          getPiece: () => simRef.current?.piece?.id ?? null,
          setKeys: (codes) => input.setKeys(codes),
          tapLeft: () => input.tap({ left: true }),
          tapRight: () => input.tap({ right: true }),
          getGesture: () => lastGestureRef.current,
          feedGesture: (type, id, x, y, t) => gestures.feed(type, id, x, y, t),
          vizAlive: () => vizRef.current.liveCount(),
          getCredits: () => saveRef.current.credits,
          getZap: () => saveRef.current.inv.zap,
          getLines: () => simRef.current?.lines ?? 0,
          getLevel: () => simRef.current?.level ?? 1,
          getMode: () => simRef.current?.mode ?? uiRef.current.mode,
          getHold: () => simRef.current?.hold ?? null,
          getBot: () => botPlayRef.current || simRef.current?.mode === "watch",
          getBanner: () => uiRef.current.banner,
          topOut: () => {
            const s = simRef.current;
            if (!s) return;
            s.phase = "over";
            s.toppedOut = true;
            finishRunRef.current(s);
          },
        };
      }

      return () => {
        cancelAnimationFrame(rafRef.current);
        input.dispose();
        gestures.reset();
        swipeRef.current = null;
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        engine.dispose();
        well3dRef.current = null;
        delete window.__controlsTest;
      };
    } catch (err) {
      console.error("[stack] well init failed", err);
      return () => {
        input.dispose();
        gestures.reset();
        swipeRef.current = null;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncUi(extra: Partial<Ui> = {}) {
    const sim = simRef.current;
    setUi((prev) => ({
      ...prev,
      phase: extra.phase ?? sim?.phase ?? prev.phase,
      score: sim?.score ?? prev.score,
      lines: sim?.lines ?? prev.lines,
      level: sim?.level ?? prev.level,
      hold: sim?.hold ?? prev.hold,
      next: sim?.next ?? prev.next,
      high: saveRef.current.high,
      ...extra,
    }));
  }

  function wipePit() {
    well3dRef.current?.setAsh(null);
    well3dRef.current?.setStain(null);
    clearLastAsh();
    clearLastStain();
  }

  /**
   * Whether Drop or Confirm should feed the cabinet right now.
   *
   * Drop is both the slam and the coin, and a run is already over on the frame
   * the slam buries it. So the well stays shut through the fail beat and the
   * coin flash, and for a beat after the card lands — otherwise the death that
   * earned the card pays for the next run instead of being read.
   */
  function wantCoin(): boolean {
    const u = uiRef.current;
    if (u.phase === "title") return true;
    if (u.phase !== "over") return false;
    if (u.failing || dying.current || u.coinTake) return false;
    return performance.now() >= coinAt.current;
  }

  function startGame(nextMode?: ModeId) {
    let mode = nextMode ?? saveRef.current.mode;
    const wantBot = mode === "watch" || botPlayRef.current;
    if (wantBot && !botAllowed(mode === "watch" ? "marathon" : mode)) {
      flashBanner("Bot not in Finesse");
      return;
    }
    if (wantBot && mode === "marathon") mode = "watch";
    if (uiRef.current.phase === "playing" && quietT.current > 0) {
      quietT.current = 0;
      syncUi({ intro: null });
      return;
    }
    if (uiRef.current.phase === "title" && !uiRef.current.lifting) {
      syncUi({ lifting: true });
      window.setTimeout(() => beginGame(mode), 480);
      return;
    }
    beginGame(mode);
  }

  function beginGame(mode: ModeId) {
    saveRef.current = { ...saveRef.current, mode, played: true };
    writeSave(saveRef.current);
    const seed = mode === "daily" ? dailySeed() : undefined;
    const sim = createSim({ mode, seed });
    simRef.current = sim;
    shakeRef.current = 0;
    replayRef.current = null;
    hardArm.current = 0;
    powerArm.current = { id: null, at: 0 };
    sfxStart();
    haptic("select");
    startMusic(mode);
    comboSeen.current = -1;
    b2bSeen.current = false;
    dying.current = false;
    failT.current = 0;
    coinAt.current = 0;
    dangerSaid.current = false;
    holdPeekT.current = 0;
    finesseN.current = 0;
    finesseClean.current = 0;
    finesseExtras.current = 0;
    pieceBorn.current = { x: sim.piece?.x ?? 3, slides: 0, rots: 0 };
    holdUsed.current = false;
    lockN.current = 0;
    sawOmen.current = false;
    uglySaid.current = false;
    siegeRef.current = mode === "siege" ? createSiege() : null;
    botHand.current = null;
    const bot = mode === "watch" || botPlayRef.current;
    botPlayRef.current = bot;
    bagN.current = sim.bag.length;
    splitSeen.current = 0;
    quietT.current = 0.4;
    goalT.current = 0;
    bestStill.current = null;
    wipePit();
    well3dRef.current?.setClear(saveRef.current.clearWell || mode === "sprint" || mode === "daily");
    const intro =
      mode === "sprint"
        ? "40"
        : mode === "blitz"
          ? "2:00"
          : mode === "classic"
            ? "NES"
            : mode === "finesse"
              ? "20"
              : mode === "daily"
                ? formatManilaDate(manilaDateKey())
                : mode === "zen"
                  ? "Still"
                  : mode === "arcade"
                    ? "Read"
                    : mode === "siege"
                      ? "8"
                      : mode === "watch"
                        ? "Watch"
                        : "Go";
    window.setTimeout(() => {
      if (uiRef.current.phase === "playing") syncUi({ intro: null });
    }, 1600);
    syncUi({
      phase: "playing",
      banner: null,
      callout: null,
      goal: null,
      holeHint: false,
      score: 0,
      lines: 0,
      level: sim.level,
      hold: null,
      next: sim.next,
      mode,
      clock: 0,
      timeLeft: sim.timeLeft,
      won: false,
      coach: bot ? null : forceCoach() || !saveRef.current.onboarded ? "drag" : null,
      picking: false,
      shop: false,
      settings: false,
      board: false,
      combo: 0,
      b2b: false,
      comboPop: 0,
      b2bPop: 0,
      recap: null,
      tip: null,
      bagLine: false,
      finesseN: 0,
      finesseClean: 0,
      pred: null,
      holdPeek: null,
      failing: false,
      watching: false,
      lifting: false,
      coinTake: false,
      dropAsk: false,
      powerAsk: null,
      intro,
      takeover: 0,
      cinema: false,
      epitaph: null,
      cause: null,
      botPlay: bot,
      siege: siegeRef.current ? snapshotSiege(siegeRef.current) : null,
      live: sim.piece?.id ?? null,
      danger: false,
      brink: false,
      bag: sim.bag.slice(),
      canHold: true,
      canUndo: false,
      inv: saveRef.current.inv,
      high: saveRef.current.high,
    });
  }

  function goHome() {
    unlockAudio();
    stopMusic();
    setMusicPaused(false);
    dying.current = false;
    failT.current = 0;
    wipePit();
    if (simRef.current) simRef.current.phase = "title";
    syncUi({
      phase: "title",
      watching: false,
      failing: false,
      danger: false,
      brink: false,
      live: null,
      recap: null,
      epitaph: null,
      cause: null,
      coinTake: false,
      intro: null,
      banner: null,
    });
  }

  function watchLast(auto = false, snapsIn?: Snap[]) {
    const snaps = snapsIn ?? getLastReplay() ?? replayRef.current;
    if (!snaps) return;
    replayRef.current = snaps;
    replayI.current = 0;
    replayT.current = 0;
    attractOn.current = auto;
    attractUntil.current = auto ? performance.now() + 20000 : 0;
    dying.current = false;
    wipePit();
    if (!simRef.current) simRef.current = createSim({ mode: uiRef.current.mode });
    else simRef.current.phase = "title";
    syncUi({
      phase: "title",
      watching: true,
      failing: false,
      danger: false,
      brink: false,
      live: null,
    });
  }

  function botThink(): number {
    const qa = typeof location !== "undefined" && new URLSearchParams(location.search).has("qa");
    return qa ? 0 : 0.12 / botPace.current;
  }

  function botGap(): number {
    const qa = typeof location !== "undefined" && new URLSearchParams(location.search).has("qa");
    return qa ? 0 : 0.05 / botPace.current;
  }

  function isBotRun() {
    return botPlayRef.current || uiRef.current.mode === "watch" || simRef.current?.mode === "watch";
  }

  function toggleBotPlay() {
    unlockAudio();
    const next = !botPlayRef.current;
    if (next && !botAllowed(uiRef.current.mode === "watch" ? "marathon" : uiRef.current.mode)) {
      flashBanner("Bot not in Finesse");
      return;
    }
    botPlayRef.current = next;
    sfxSelect();
    haptic("select");
    syncUi({ botPlay: next });
  }

  function takeBotPulse(sim: Sim, dt: number) {
    if (sim.phase !== "playing" || !sim.piece) {
      botHand.current = null;
      return null;
    }
    if (!botHand.current) botHand.current = armBot(sim, botThink());
    const hand = botHand.current;
    if (!hand) return { hard: true };
    hand.wait -= dt;
    if (hand.wait > 0) return null;
    const pulse = botPulse(sim, hand);
    if (!pulse) return null;
    if (pulse.hold) hand.held = true;
    if (pulse.cw) {
      hand.turns += 1;
      if (hand.turns > 4) {
        botHand.current = null;
        return { hard: true };
      }
    }
    if (pulse.hard) botHand.current = null;
    else hand.wait = botGap();
    return pulse;
  }

  function tick(dt: number) {
    const input = inputRef.current;
    if (!input) return;
    const { held, just } = input.sample();
    const u = uiRef.current;

    if (just.confirm || just.hard) {
      // A refused coin must fall through: the fail beat below still needs its frames.
      if ((u.phase === "title" || u.phase === "over") && wantCoin()) {
        startGame();
        return;
      }
    }
    if (just.pause) {
      if (u.shop || u.settings || u.board) {
        syncUi({ shop: false, settings: false, board: false });
        return;
      }
      if (u.phase === "playing" || u.phase === "paused") {
        if (simRef.current) {
          pauseToggle(simRef.current);
          setMusicPaused(simRef.current.phase === "paused");
          syncUi({ phase: simRef.current.phase });
        }
      }
    }

    const keyed = input.takePower();
    if (keyed && !isBotRun()) usePower(keyed);

    if (just.confirm && u.phase === "paused" && simRef.current) {
      simRef.current.phase = "playing";
      setMusicPaused(false);
      syncUi({ phase: "playing" });
    }

    const sim = simRef.current;
    if (u.phase === "title" && u.watching) {
      if (attractOn.current && performance.now() > attractUntil.current) {
        attractOn.current = false;
        syncUi({ watching: false });
        return;
      }
      stepReplay(dt);
      return;
    }
    if (!sim || u.phase === "title") {
      if (bannerT.current > 0) {
        bannerT.current -= dt;
        if (bannerT.current <= 0 && u.banner) syncUi({ banner: null });
      }
      return;
    }

    if (sim.phase === "paused") {
      // The swap chip lives on a play-clock, so a pause mid-swap would pin it there.
      if (holdPeekT.current > 0) {
        holdPeekT.current = 0;
        syncUi({ holdPeek: null });
      }
      if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 8);
      return;
    }
    if (sim.phase === "over") {
      if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 8);
      if (failT.current > 0) {
        failT.current -= dt;
        if (failT.current <= 0 && dying.current) {
          failT.current = 0;
          finishRun(sim);
        }
      } else if (!dying.current) {
        stepReplay(dt);
      }
      return;
    }

    if (quietT.current > 0) {
      if (
        just.left ||
        just.right ||
        just.down ||
        just.cw ||
        just.ccw ||
        just.flip ||
        just.hold ||
        just.hard
      ) {
        quietT.current = 0;
        if (u.intro) syncUi({ intro: null });
      } else {
        quietT.current -= dt;
        return;
      }
    }

    // Keys count as the taught gesture too, or the coach never lets the well go.
    if (u.coach) {
      if (just.left) advanceCoach("left");
      else if (just.right) advanceCoach("right");
      else if (just.cw || just.flip) advanceCoach("cw");
      else if (just.ccw) advanceCoach("ccw");
      else if (just.hold) advanceCoach("hold");
      else if (just.hard) advanceCoach("hard");
    }

    const driven = isBotRun();
    const falling = sim.piece;
    const ghostAt = falling ? ghostY(sim) : 0;
    const pulse = driven ? takeBotPulse(sim, dt) : null;
    const ev = advance(sim, dt, {
      heldLeft: driven ? false : held.left,
      heldRight: driven ? false : held.right,
      justLeft: driven ? !!pulse?.left : just.left,
      justRight: driven ? !!pulse?.right : just.right,
      softDrop: driven ? false : held.down,
      justHard: driven ? !!pulse?.hard : just.hard,
      justCw: driven ? !!pulse?.cw : just.cw,
      justCcw: driven ? false : just.ccw,
      justHold: driven ? !!pulse?.hold : just.hold,
      justFlip: driven ? false : just.flip,
      heldCw: driven ? false : held.cw,
      heldCcw: driven ? false : held.ccw,
      heldHold: driven ? false : held.hold,
      heldFlip: driven ? false : held.flip,
      nudge: driven ? 0 : input.takeNudge(),
      das: showPad(u.padMode) ? DAS_TOUCH : saveRef.current.dasMs / 1000,
      arr: saveRef.current.arrMs / 1000,
      sdf: saveRef.current.sdf,
      freeze: !!u.coach,
    });

    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 10);
    if (bannerT.current > 0) {
      bannerT.current -= dt;
      if (bannerT.current <= 0) syncUi({ banner: null });
    }
    if (calloutT.current > 0) {
      calloutT.current -= dt;
      if (calloutT.current <= 0) syncUi({ callout: null });
    }
    if (goalT.current > 0) {
      goalT.current -= dt;
      if (goalT.current <= 0) syncUi({ goal: null });
    }
    if (holdPeekT.current > 0) {
      holdPeekT.current -= dt;
      if (holdPeekT.current <= 0) syncUi({ holdPeek: null });
    }
    if (failT.current > 0) {
      failT.current -= dt;
      if (failT.current <= 0 && dying.current && simRef.current) {
        failT.current = 0;
        finishRun(simRef.current);
      }
    }
    if (gestureT.current > 0) {
      gestureT.current -= dt;
      if (gestureT.current <= 0) syncUi({ gesture: null });
    }

    if (sim.mode === "sprint" && sim.splits.length > splitSeen.current) {
      splitSeen.current = sim.splits.length;
      const mark = splitSeen.current * 10;
      const split = sim.splits[sim.splits.length - 1] ?? sim.clock;
      const best = saveRef.current.sprintSplits[splitSeen.current - 1];
      const pb = best == null || split < best;
      flashBanner(pb ? `${mark} PB` : String(mark));
      if (pb) syncUi({ pbPop: u.pbPop + 1 });
    }
    if (sim.omenOn && !sawOmen.current) {
      sawOmen.current = true;
      sfxOmen();
    }
    if (sim.curseLeft === 1 && !uglySaid.current) {
      uglySaid.current = true;
      flashBanner("The bag is ugly.");
    }
    const live = sim.piece?.id ?? null;
    const danger = sim.phase === "playing" && inDanger(sim);
    const brink = danger && onBrink(sim);
    // Nothing dies in Zen, so Zen is not told it is about to.
    if (danger && !dangerSaid.current && sim.mode !== "zen") {
      dangerSaid.current = true;
      flashBanner("The well is filling.");
    }
    if (live && live !== u.live && u.phase === "playing") {
      syncUi({ handoff: live });
      window.setTimeout(() => {
        if (uiRef.current.handoff === live) syncUi({ handoff: null });
      }, 280);
    }
    if (sim.bag.length > bagN.current + 3) {
      syncUi({ bagPop: u.bagPop + 1, bag: sim.bag.slice() });
    }
    bagN.current = sim.bag.length;
    if (
      live !== u.live ||
      danger !== u.danger ||
      brink !== u.brink ||
      sim.canHold !== u.canHold ||
      !!sim.undo !== u.canUndo
    ) {
      syncUi({
        live,
        danger,
        brink,
        bag: sim.bag.slice(),
        canHold: sim.canHold,
        canUndo: !!sim.undo,
      });
    }
    if (
      sim.phase === "playing" &&
      !saveRef.current.holeSeen &&
      !u.coach &&
      !u.holeHint &&
      !isBotRun()
    ) {
      let hole = false;
      for (let y = HIDDEN_ROWS; y < ROWS && !hole; y++) {
        const row = sim.board[y];
        if (!row) continue;
        let filled = 0;
        for (let x = 0; x < COLS; x++) if (row[x]) filled += 1;
        if (filled === COLS - 1) hole = true;
      }
      if (hole) syncUi({ holeHint: true });
    }

    if (sim.mode === "finesse") {
      if (just.left || just.right) pieceBorn.current.slides += 1;
      if (just.cw || just.ccw || just.flip) pieceBorn.current.rots += 1;
    }
    if (ev === "move" && (just.left || just.right)) {
      sfxMove();
      haptic("move");
    }
    if (ev === "move" && held.down && !just.left && !just.right && !just.hard) {
      sfxSoft();
    }
    if (ev === "rotate") {
      sfxRotate();
      haptic("rotate");
      if (sim.lastKickIndex > 0) flashBanner(kickLabel(sim.lastKickIndex));
    }
    if (ev === "hold") {
      sfxHold();
      haptic("select");
      payMissions({ hold: 1 });
      well3dRef.current?.punch(0.12);
      holdPeekT.current = 0.85;
      if (sim.piece) pieceBorn.current = { x: sim.piece.x, slides: 0, rots: 0 };
      syncUi({ holdPeek: sim.piece?.id ?? null });
    }
    if (ev === "lock") {
      if (!just.hard) sfxLock();
      slamLock(just.hard, falling, just.hard ? ghostAt : falling?.y ?? 0);
      if (held.down && falling && !just.hard) {
        well3dRef.current?.softTrail(
          falling,
          themeOf(saveRef.current.theme).fill[falling.id],
        );
      }
      if (sim.phase === "clearing" && sim.clearRows.length) {
        juiceClear(
          sim.tSpin
            ? "tspin"
            : sim.clearRows.length === 4
              ? "stack"
              : sim.clearRows.length === 3
                ? "triple"
                : sim.clearRows.length === 2
                  ? "double"
                  : "single",
        );
      } else {
        comboSeen.current = -1;
        b2bSeen.current = sim.b2b;
      }
      if (sim.mode === "finesse" && falling) {
        markFinesse(falling);
      }
      if (sim.piece) pieceBorn.current = { x: sim.piece.x, slides: 0, rots: 0 };
      lockN.current += 1;
      if (
        lockN.current >= 20 &&
        !holdUsed.current &&
        !saveRef.current.holdHinted &&
        sim.mode !== "watch" &&
        !isBotRun()
      ) {
        saveRef.current = { ...saveRef.current, holdHinted: true };
        writeSave(saveRef.current);
        flashBanner("Hold parks a piece.");
      }
      if (isBotRun() && sim.mode === "zen" && lockN.current >= ZEN_LOCK_CAP) {
        sim.won = true;
        sim.phase = "over";
        sim.lastClear = "STILL";
        finishRun(sim);
        return;
      }
    }
    if (ev === "clear") {
      haptic("clear");
      if (!saveRef.current.niceSeen) {
        saveRef.current = { ...saveRef.current, niceSeen: true };
        writeSave(saveRef.current);
      }
      fireChain(sim, false);
      if (sim.lastPerfect) juicePerfect();
      fireSiege(sim);
      markHoleSeen();
      syncUi();
    }
    if (ev === "tetris" || ev === "tspin") {
      haptic("tetris");
      if (sim.blessed && ev === "tetris") {
        sim.blessed = false;
        if (!isBotRun()) {
          syncUi({ picking: true });
          flashBanner("Name it.");
        }
      } else if (sim.curseLeft === 2 && ev === "tetris") {
        flashBanner("A lie.");
      } else if (!saveRef.current.niceSeen) {
        saveRef.current = { ...saveRef.current, niceSeen: true };
        writeSave(saveRef.current);
      }
      fireChain(sim, ev === "tetris" || ev === "tspin");
      if (ev === "tetris") payMissions({ tetris: 1 });
      if (sim.lastPerfect) juicePerfect();
      fireSiege(sim);
      markHoleSeen();
      syncUi();
    }
    if (ev === "win" || ev === "over") {
      if (ev === "win") {
        sfxTetris();
        haptic("win");
        flashBanner(sim.won && sim.mode === "sprint" ? "CLEAR" : "TIME");
        finishRun(sim);
      } else if (!dying.current) {
        beginFail(sim);
      }
    }

    if (sim.pendingCoins && !isBotRun()) {
      saveRef.current = {
        ...saveRef.current,
        credits: saveRef.current.credits + sim.pendingCoins,
      };
      writeSave(saveRef.current);
      sim.pendingCoins = 0;
      syncUi({ credits: saveRef.current.credits });
    }

    if (sim.phase === "playing") setMusicTension(sim.mode !== "zen" && danger);
    const siege = siegeRef.current;
    if (siege && sim.mode === "siege" && sim.phase === "playing") {
      tickSiege(siege, dt, inDanger(sim));
      siege.dumpT += dt;
      if (siege.dumpT >= 0.72 && siege.incoming > 0) {
        siege.dumpT = 0;
        const n = takeIncoming(siege, 1);
        if (!injectGarbage(sim, n)) {
          sim.phase = "over";
          sim.won = false;
          finishRun(sim);
        }
      }
      syncUi({ siege: snapshotSiege(siege) });
    }

    if (sim.score !== u.score || sim.level !== u.level || sim.lines !== u.lines) {
      if (sim.level > u.level) sfxLevel();
      if (sim.lines > u.lines) {
        payMissions({ lines: sim.lines - u.lines, level: sim.level });
        const stain = getLastStain();
        if (stain) {
          let top = 99;
          for (let y = HIDDEN_ROWS; y < ROWS; y++) {
            if (sim.board[y]!.some((c) => c)) {
              top = y - HIDDEN_ROWS;
              break;
            }
          }
          if (top > stain.peak) {
            clearLastStain();
            well3dRef.current?.setStain(null);
          }
        }
      }
      else payMissions({ level: sim.level });
      const pred = predictCollision(sim);
      syncUi({
        slow: sim.slowT > 0,
        shield: sim.shield,
        clock: sim.clock,
        timeLeft: sim.timeLeft,
        combo: Math.max(0, sim.combo),
        b2b: sim.b2b,
        pred: pred
          ? { rows: pred.rowsLeft, lock: pred.lockImminent, kick: pred.kick.cw || pred.kick.ccw }
          : null,
        levelPop: sim.level > u.level ? u.levelPop + 1 : u.levelPop,
      });
    } else if (
      u.slow !== sim.slowT > 0 ||
      u.shield !== sim.shield ||
      Math.floor(u.clock) !== Math.floor(sim.clock) ||
      u.combo !== Math.max(0, sim.combo) ||
      u.b2b !== sim.b2b
    ) {
      const pred = predictCollision(sim);
      syncUi({
        slow: sim.slowT > 0,
        shield: sim.shield,
        clock: sim.clock,
        timeLeft: sim.timeLeft,
        combo: Math.max(0, sim.combo),
        b2b: sim.b2b,
        pred: pred
          ? { rows: pred.rowsLeft, lock: pred.lockImminent, kick: pred.kick.cw || pred.kick.ccw }
          : null,
      });
    } else {
      const pred = predictCollision(sim);
      const next = pred
        ? { rows: pred.rowsLeft, lock: pred.lockImminent, kick: pred.kick.cw || pred.kick.ccw }
        : null;
      if (
        u.pred?.rows !== next?.rows ||
        u.pred?.lock !== next?.lock ||
        u.pred?.kick !== next?.kick
      ) {
        syncUi({ pred: next });
      }
    }
  }

  function payMissions(ev: Parameters<typeof applyMissions>[1]) {
    if (isBotRun()) return;
    const { book, payout, done } = applyMissions(saveRef.current.missions, ev);
    const changed =
      payout > 0 ||
      done.length > 0 ||
      book.items.some((m, i) => m.progress !== saveRef.current.missions.items[i]?.progress);
    if (!changed) return;
    saveRef.current = {
      ...saveRef.current,
      missions: book,
      credits: saveRef.current.credits + payout,
    };
    writeSave(saveRef.current);
    // Credits that turn up on their own read as a glitch next to a Store that
    // charges for a Shield, so the goal that paid says which goal it was.
    const goal = done.length ? { name: done.join(" · "), cr: payout, n: done.length } : null;
    if (goal) goalT.current = GOAL_READ;
    syncUi({
      missions: book,
      credits: saveRef.current.credits,
      ...(goal ? { goal } : {}),
    });
  }

  function fireSiege(sim: Sim) {
    const siege = siegeRef.current;
    if (!siege || sim.mode !== "siege") return;
    const n = linesOfClear(sim.lastClear);
    if (n <= 0 && !sim.lastPerfect) return;
    const g = garbageFor(
      n,
      !!sim.lastClear?.startsWith("T-SPIN"),
      sim.b2b,
      Math.max(0, sim.combo),
      sim.lastPerfect,
      siege.badges,
      siege.hunters,
    );
    if (g > 0) {
      const kos = sendGarbage(siege, g);
      if (kos) flashBanner(kos > 1 ? `${kos} KOs` : "KO");
    }
    if (siegeWon(siege)) {
      sim.won = true;
      sim.phase = "over";
      finishRun(sim);
    }
    syncUi({ siege: snapshotSiege(siege) });
  }

  function linesOfClear(label: string | null): number {
    if (!label) return 0;
    if (label === "STACK" || label === "TETRIS" || label === "ALL CLEAR") return 4;
    if (label === "TST") return 3;
    if (label === "MINI") return 1;
    const spin = /T-SPIN(?: (\d+))?$/.exec(label);
    if (spin) return spin[1] ? Number(spin[1]) : 0;
    if (label === "TRIPLE") return 3;
    if (label === "DOUBLE") return 2;
    if (label === "SINGLE") return 1;
    return 0;
  }

  /** The well gets a beat to show what buried it before the card comes up. */
  function beginFail(sim: Sim) {
    dying.current = true;
    setMusicTension(false);
    sfxOver();
    haptic("over");
    well3dRef.current?.failBeat(HIDDEN_ROWS + headroom(sim));
    shakeRef.current = Math.max(shakeRef.current, 9);
    failT.current = 1.25;
    syncUi({ failing: true, danger: false, brink: false });
  }

  function finishRun(sim: Sim) {
    stopMusic();
    saveRef.current = recordRun(saveRef.current, {
      mode: sim.mode,
      score: sim.score,
      lines: sim.lines,
      clock: sim.clock,
      won: sim.won,
      t: Date.now(),
      combo: sim.maxCombo,
      tspins: sim.tspins,
      stacks: sim.stacks,
      splits: sim.splits.slice(),
    });
    if (sim.won && sim.mode === "sprint") payMissions({ modeWin: "sprint" });
    if (sim.history.length > 1) {
      replayRef.current = sim.history.slice();
      replayI.current = 0;
      replayT.current = 0;
      setLastReplay(sim.history);
      if (sim.mode === "daily") setDailyReplay(manilaDateKey(), sim.history);
    }
    if (!sim.won) {
      setLastAsh(sim.board);
      well3dRef.current?.setAsh(sim.board);
      const cells: { x: number; y: number }[] = [];
      let peak = 99;
      for (let y = HIDDEN_ROWS; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!sim.board[y]?.[x]) continue;
          const row = y - HIDDEN_ROWS;
          cells.push({ x, y: row });
          if (row < peak) peak = row;
        }
      }
      if (cells.length) setLastStain(cells, peak);
    }
    const epitaph = nameRun({
      mode: sim.mode,
      score: sim.score,
      lines: sim.lines,
      won: sim.won,
      combo: sim.maxCombo,
      stacks: sim.stacks,
      tspins: sim.tspins,
      perfects: sim.perfects,
      extras: sim.mode === "finesse" ? finesseExtras.current : undefined,
      toppedOut: sim.toppedOut,
    });
    let themes = saveRef.current.themes.slice();
    if (sim.perfects > 0 && !themes.includes("citrine")) themes = [...themes, "citrine"];
    if (saveRef.current.streak.count >= 10 && !themes.includes("blood")) themes = [...themes, "blood"];
    if (sim.mode === "finesse" && sim.won && finesseClean.current >= 20 && !themes.includes("quiet")) {
      themes = [...themes, "quiet"];
    }
    if (themes.length !== saveRef.current.themes.length) {
      saveRef.current = { ...saveRef.current, themes };
      writeSave(saveRef.current);
    }
    dying.current = false;
    failT.current = 0;
    coinAt.current = performance.now() + COIN_WAIT;
    powerArm.current = { id: null, at: 0 };
    syncUi({
      phase: "over",
      failing: false,
      coinTake: true,
      powerAsk: null,
      dropAsk: false,
      streak: saveRef.current.streak,
      danger: false,
      brink: false,
      live: null,
      high: saveRef.current.high,
      won: sim.won,
      clock: sim.clock,
      epitaph,
      cause: sim.toppedOut ? "The stack reached the top of the well." : null,
      sprintBest: saveRef.current.sprintBest,
      recap: {
        mode: sim.mode,
        lines: sim.lines,
        level: sim.level,
        combo: sim.maxCombo,
        tspins: sim.tspins,
        stacks: sim.stacks,
        clock: sim.clock,
        splits: sim.splits.slice(),
        perfects: sim.perfects,
        extras: sim.mode === "finesse" ? finesseExtras.current : undefined,
        clean: sim.mode === "finesse" ? finesseClean.current : undefined,
        pieces: sim.mode === "finesse" ? finesseN.current : undefined,
        dailyDate: sim.mode === "daily" ? manilaDateKey() : undefined,
        streakCount: sim.mode === "daily" ? saveRef.current.streak.count : undefined,
      },
      bagLine: false,
      tip:
        sim.mode === "watch" || isBotRun() || sim.won || saveRef.current.tipSeen
          ? null
          : "Hold saves a piece. Ghost shows the drop.",
    });
    if (!sim.won && !saveRef.current.tipSeen) {
      saveRef.current = { ...saveRef.current, tipSeen: true };
      writeSave(saveRef.current);
    }
    window.setTimeout(() => {
      if (uiRef.current.phase === "over") syncUi({ coinTake: false });
    }, COIN_FLASH);
  }
  finishRunRef.current = finishRun;

  function stepReplay(dt: number) {
    const snaps = replayRef.current;
    if (!snaps || snaps.length === 0) return;
    replayT.current += dt;
    if (replayT.current < REPLAY_STEP) return;
    replayT.current = 0;
    replayI.current = (replayI.current + 1) % snaps.length;
  }

  function bangTint() {
    syncUi({ tintPop: uiRef.current.tintPop + 1 });
    window.setTimeout(() => {
      if (uiRef.current.tintPop) syncUi({ tintPop: 0 });
    }, 280);
  }

  function slamLock(
    hard: boolean,
    falling: { id: PieceId; rot: 0 | 1 | 2 | 3; x: number; y: number } | null,
    destY: number,
  ) {
    const engine = well3dRef.current;
    if (!engine || !falling) return;
    const cells = cellsOf(falling.id, falling.rot, falling.x, destY);
    const col = themeOf(saveRef.current.theme).fill[falling.id];
    if (hard) {
      haptic("tetris");
      engine.lockThump(cells, col, true);
      engine.punch(0.4, true);
      engine.nod(0.5, true);
      engine.hardStreak(falling, destY, col);
      sfxHard();
      shakeRef.current = Math.max(shakeRef.current, 10);
      syncUi({ lockPop: uiRef.current.lockPop + 1 });
      window.setTimeout(() => {
        if (uiRef.current.lockPop) syncUi({ lockPop: 0 });
      }, 340);
    } else {
      haptic("lock");
      engine.lockThump(cells, col, false);
    }
  }

  function pulseNow(p: Partial<Pad>) {
    const sim = simRef.current;
    const u = uiRef.current;
    if (p.hard && (u.phase === "title" || u.phase === "over")) {
      if (wantCoin()) startGame();
      return;
    }
    if (!sim || sim.phase !== "playing") return;
    if (quietT.current > 0) {
      quietT.current = 0;
      if (u.intro) syncUi({ intro: null });
    }
    if (sim.mode === "finesse" && (p.left || p.right || p.cw || p.ccw || p.flip)) {
      if (p.left || p.right) pieceBorn.current.slides += 1;
      if (p.cw || p.ccw || p.flip) pieceBorn.current.rots += 1;
    }
    const fallingPulse = sim.piece;
    const ghostPulse = fallingPulse ? ghostY(sim) : 0;
    const ev = pulseAction(sim, p);
    if (ev === "move") {
      sfxMove();
      haptic("move");
    }
    if (ev === "rotate") {
      sfxRotate();
      haptic("rotate");
      if (sim.lastKickIndex > 0) flashBanner(kickLabel(sim.lastKickIndex));
    }
    if (ev === "hold") {
      sfxHold();
      haptic("select");
      payMissions({ hold: 1 });
      well3dRef.current?.punch(0.12);
      holdPeekT.current = 0.85;
      if (sim.piece) pieceBorn.current = { x: sim.piece.x, slides: 0, rots: 0 };
      syncUi({ holdPeek: sim.piece?.id ?? null });
    }
    if (ev === "lock" || ev === "over") {
      if (!p.hard) sfxLock();
      slamLock(!!p.hard, fallingPulse, p.hard ? ghostPulse : fallingPulse?.y ?? 0);
      const live = simRef.current;
      if (live && live.clearRows.length) {
        juiceClear(
          live.tSpin
            ? "tspin"
            : live.clearRows.length === 4
              ? "stack"
              : live.clearRows.length === 3
                ? "triple"
                : live.clearRows.length === 2
                  ? "double"
                  : "single",
        );
      }
      if (live?.mode === "finesse" && fallingPulse && ev !== "over") {
        markFinesse(fallingPulse);
      }
      if (live?.piece) pieceBorn.current = { x: live.piece.x, slides: 0, rots: 0 };
      if (ev === "over") {
        if (live) beginFail(live);
      } else {
        syncUi();
      }
    }
  }
  pulseRef.current = pulseNow;

  function juiceClear(kind: "single" | "double" | "triple" | "stack" | "tspin") {
    const engine = well3dRef.current;
    const sim = simRef.current;
    if (!engine || !sim) return;
    const n = sim.clearRows.length;
    const spoken = speakClear({
      lines: n,
      tspin: sim.tSpin,
      mini: sim.tSpinMini,
      perfect: false,
      wasB2b: sim.b2b && (n === 4 || sim.tSpin),
      combo: Math.max(0, sim.combo + 1),
    });
    showCallout(spoken);
    noteStill(sim, spoken);
    const beat = kind === "single" ? "double" : kind;
    engine.punch(
      beat === "stack" ? 0.28 : beat === "tspin" ? 0.24 : beat === "triple" ? 0.16 : 0.1,
    );
    const tint =
      beat === "stack"
        ? "#f7f4ee"
        : beat === "tspin"
          ? "#c9d6ea"
          : beat === "triple"
            ? "#d4c4f0"
            : "#e8d4a0";
    engine.sparkRows(sim.clearRows, tint);
    engine.shatter(sim, themeOf(saveRef.current.theme));
    engine.sweep(beat);
    if (beat === "stack" || beat === "tspin") engine.nod(0.42);
    else if (beat === "triple") engine.nod(0.18);
    sfxLine(spoken.rank);
    if (beat === "triple" || beat === "stack" || beat === "tspin") sfxShatter();
    if (beat === "stack" || beat === "tspin") {
      shakeRef.current = beat === "stack" ? 8 : 6;
      bangTint();
    } else if (beat === "triple") {
      shakeRef.current = 4;
    }
  }

  function markFinesse(falling: { id: PieceId; rot: 0 | 1 | 2 | 3; x: number; y: number }) {
    const mark = gradeFinesse({
      id: falling.id,
      bornX: pieceBorn.current.x,
      lockX: falling.x,
      lockRot: falling.rot,
      slides: pieceBorn.current.slides,
      rots: pieceBorn.current.rots,
    });
    finesseN.current += 1;
    if (mark.grade === "perfect") finesseClean.current += 1;
    else finesseExtras.current += mark.extraSlide + mark.extraRot;
    sfxFinesse(mark.grade);
    showCallout({
      title: gradeTitle(mark.grade),
      sub: `${finesseClean.current}/${finesseN.current}`,
      rank: mark.grade === "perfect" ? "single" : mark.grade === "slide" ? "double" : "mini",
    });
    if (mark.grade !== "perfect") {
      const trail = cheapTrail(
        falling.id,
        pieceBorn.current.x,
        falling.x,
        falling.rot,
        falling.y,
      );
      well3dRef.current?.teachTrail(trail, themeOf(saveRef.current.theme).fill[falling.id]);
    }
    const sim = simRef.current;
    syncUi({ finesseN: finesseN.current, finesseClean: finesseClean.current });
    if (sim && finesseN.current >= 20 && !dying.current) {
      sim.won = true;
      sim.phase = "over";
      finishRun(sim);
    }
  }

  function showCallout(next: Callout) {
    calloutT.current = next.rank === "pc" || next.rank === "tetris" ? 1.4 : next.rank === "single" ? 0.7 : 1.05;
    syncUi({ callout: next });
  }

  function noteStill(sim: import("@/game/sim").Sim, spoken: Callout) {
    if (!betterRank(bestStill.current?.rank ?? null, spoken.rank) && bestStill.current) return;
    bestStill.current = {
      snap: takeSnap(sim.board, null, sim.score, sim.lines),
      label: spoken.title,
      rank: spoken.rank,
    };
  }

  function juicePerfect() {
    const sim = simRef.current;
    well3dRef.current?.perfectBurst();
    sfxPerfect();
    haptic("win");
    shakeRef.current = 7;
    const spoken = speakClear({
      lines: 4,
      tspin: !!sim?.tSpin,
      mini: !!sim?.tSpinMini,
      perfect: true,
      wasB2b: !!sim?.b2b,
      combo: Math.max(0, sim?.combo ?? 0),
    });
    showCallout(spoken);
    if (sim) noteStill(sim, spoken);
    syncUi({ cinema: true });
    window.setTimeout(() => {
      if (uiRef.current.phase === "playing") syncUi({ cinema: false });
    }, 900);
  }

  function markHoleSeen() {
    if (saveRef.current.holeSeen && !uiRef.current.holeHint) return;
    saveRef.current = { ...saveRef.current, holeSeen: true };
    writeSave(saveRef.current);
    if (uiRef.current.holeHint) syncUi({ holeHint: false });
  }

  function fireChain(sim: Sim, difficult: boolean) {
    const combo = Math.max(0, sim.combo);
    const patch: Partial<Ui> = {};
    if (combo > 0 && combo > comboSeen.current) {
      sfxCombo(combo);
      well3dRef.current?.punch(0.16 + Math.min(0.22, combo * 0.04));
      patch.comboPop = uiRef.current.comboPop + 1;
    }
    comboSeen.current = sim.combo;
    if (sim.b2b) {
      const hit = difficult && b2bSeen.current;
      if (hit || !b2bSeen.current) {
        sfxB2b();
        well3dRef.current?.punch(hit ? 0.34 : 0.2);
        patch.b2bPop = uiRef.current.b2bPop + 1;
      }
    }
    b2bSeen.current = sim.b2b;
    if (Object.keys(patch).length) syncUi(patch);
  }

  function flashBanner(text: string) {
    const big =
      text.startsWith("STACK") || text.startsWith("T-SPIN") || text === "ALL CLEAR";
    const mid = text === "TRIPLE" || text === "DOUBLE";
    bannerKind.current = big ? "big" : mid ? "mid" : "plain";
    bannerT.current = big ? 1.55 : mid ? 1.25 : 1;
    syncUi({ banner: text });
  }

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const theme = themeOf(saveRef.current.theme);
    const snaps = replayRef.current;
    let view = simRef.current;
    if (snaps && snaps[replayI.current] && (uiRef.current.watching || view?.phase === "over")) {
      const s = snaps[replayI.current]!;
      view = view
        ? { ...view, phase: "over", board: s.board, piece: s.piece, score: s.score, lines: s.lines }
        : null;
    }
    well3dRef.current?.draw(
      view,
      reduce ? Math.min(shakeRef.current, 6) : shakeRef.current,
      theme,
      uiRef.current.ghost && modeOf(uiRef.current.mode).ghost,
      uiRef.current.marks,
    );
    const vizCanvas = vizCanvasRef.current;
    const well = wellRef.current;
    if (vizCanvas && well) {
      vizRef.current.draw(
        vizCanvas,
        swipeRef.current?.snapshot() ?? [],
        well.getBoundingClientRect(),
        performance.now(),
        reduce,
      );
    }
  }

  function toggleMute() {
    unlockAudio();
    const music = uiRef.current.musicVol;
    const sfx = uiRef.current.sfxVol;
    if (music > 0) {
      lastMix.current = { music, sfx: sfx > 0 ? sfx : 1 };
      setMix({ music: 0, sfx });
      saveRef.current = { ...saveRef.current, musicVol: 0, sfxVol: sfx, muted: sfx <= 0 };
      writeSave(saveRef.current);
      syncUi({ musicVol: 0, sfxVol: sfx, muted: sfx <= 0 });
      return;
    }
    if (sfx > 0) {
      setMix({ music: 0, sfx: 0 });
      saveRef.current = { ...saveRef.current, musicVol: 0, sfxVol: 0, muted: true };
      writeSave(saveRef.current);
      syncUi({ musicVol: 0, sfxVol: 0, muted: true });
      return;
    }
    const restore = lastMix.current;
    setMix(restore);
    saveRef.current = { ...saveRef.current, musicVol: restore.music, sfxVol: restore.sfx, muted: false };
    writeSave(saveRef.current);
    syncUi({ musicVol: restore.music, sfxVol: restore.sfx, muted: false });
  }

  function setAudioMix(part: "music" | "sfx", value: number) {
    unlockAudio();
    const music = part === "music" ? value : uiRef.current.musicVol;
    const sfx = part === "sfx" ? value : uiRef.current.sfxVol;
    setMix({ music, sfx });
    const muted = music <= 0 && sfx <= 0;
    saveRef.current = { ...saveRef.current, musicVol: music, sfxVol: sfx, muted };
    writeSave(saveRef.current);
    syncUi({ musicVol: music, sfxVol: sfx, muted });
  }

  function pickStation(id: StationId) {
    unlockAudio();
    setStation(id);
    saveRef.current = { ...saveRef.current, station: id };
    writeSave(saveRef.current);
    haptic("select");
    syncUi({ station: id });
  }

  function openShop(wanted: PowerId | null = null) {
    unlockAudio();
    setWant(wanted);
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      setMusicPaused(true);
      syncUi({ phase: "paused", shop: true });
    } else {
      syncUi({ shop: true });
    }
  }

  function closeShop() {
    setWant(null);
    syncUi({ shop: false });
  }

  function usePower(id: PowerId) {
    unlockAudio();
    const sim = simRef.current;
    if (!sim || (sim.phase !== "playing" && sim.phase !== "clearing")) return;
    if (!powersAllowed(sim.mode)) return;
    if (id === "pick") {
      if (powerArm.current.id) {
        powerArm.current = { id: null, at: 0 };
        syncUi({ powerAsk: null });
      }
      if (uiRef.current.picking) {
        syncUi({ picking: false });
        return;
      }
      if ((saveRef.current.inv.pick ?? 0) < 1) return;
      flashBanner("Tap Next");
      syncUi({ picking: true });
      return;
    }
    if (id === "zap" || id === "quake") {
      if (!wantPower(id)) return;
    } else if (powerArm.current.id) {
      powerArm.current = { id: null, at: 0 };
      syncUi({ powerAsk: null });
    }
    const theme = themeOf(saveRef.current.theme);
    const marked =
      id === "zap"
        ? dirtyRows(sim, 1)
        : id === "quake"
          ? dirtyRows(sim, 2)
          : [];
    const cells: { x: number; y: number; hexCol: string }[] = [];
    for (const y of marked) {
      for (let x = 0; x < COLS; x++) {
        const pid = sim.board[y]![x] as PieceId | null;
        if (pid) cells.push({ x, y, hexCol: theme.fill[pid] });
      }
    }
    const next = consumePower(saveRef.current, id);
    if (!next) return;
    if (!applyPower(sim, id)) return;
    saveRef.current = next;
    writeSave(next);
    well3dRef.current?.powerFx(id, cells);
    sfxPower(id);
    if (id === "quake") shakeRef.current = 14;
    else if (id === "zap") shakeRef.current = 6;
    flashBanner(sim.lastClear ?? id.toUpperCase());
    syncUi({
      inv: next.inv,
      credits: next.credits,
      slow: sim.slowT > 0,
      shield: sim.shield,
    });
  }

  /** Tapping an empty slot on the bar: spend credits on the spot, or go get some. */
  function stockPower(id: PowerId) {
    unlockAudio();
    if (powerArm.current.id) {
      powerArm.current = { id: null, at: 0 };
      syncUi({ powerAsk: null });
    }
    const next = buyWithCredits(saveRef.current, id);
    if (!next) {
      openShop(id);
      return;
    }
    saveRef.current = next;
    writeSave(next);
    sfxSelect();
    haptic("select");
    flashBanner(`${id.toUpperCase()} +1`);
    syncUi({ credits: next.credits, inv: next.inv });
  }

  function chooseNext(index: number) {
    unlockAudio();
    const sim = simRef.current;
    if (!sim || !uiRef.current.picking) return;
    if (!pickFromNext(sim, index)) return;
    const next = consumePower(saveRef.current, "pick");
    if (!next) {
      syncUi({ picking: false });
      return;
    }
    saveRef.current = next;
    writeSave(next);
    flashBanner("PICK");
    haptic("select");
    sfxPower("pick");
    if (sim.piece) {
      well3dRef.current?.powerFx(
        "pick",
        cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, sim.piece.y).map((c) => ({
          x: c.x,
          y: c.y,
          hexCol: themeOf(saveRef.current.theme).fill[sim.piece!.id],
        })),
      );
    }
    syncUi({
      picking: false,
      inv: next.inv,
      next: sim.next,
      hold: sim.hold,
    });
  }

  async function onBuySku(sku: Sku) {
    unlockAudio();
    setBuying(sku.id);
    const next = await purchaseSku(saveRef.current, sku.id);
    setBuying(null);
    if (!next) return;
    let granted = next;
    if (sku.id === "theme_night" && !granted.themes.includes("night")) {
      granted = {
        ...granted,
        themes: [...granted.themes, "night"],
        theme: "night",
      };
    }
    saveRef.current = granted;
    writeSave(granted);
    syncUi({ credits: granted.credits, inv: granted.inv, theme: granted.theme });
  }

  function onBuyPower(id: PowerId) {
    unlockAudio();
    const next = buyWithCredits(saveRef.current, id);
    if (!next) return;
    saveRef.current = next;
    writeSave(next);
    syncUi({ credits: next.credits, inv: next.inv });
  }

  function showGesture(label: GestureLabel) {
    lastGestureRef.current = label;
    if (label === "soft" || label === "drag") return;
    gestureT.current = 0.7;
    syncUi({ gesture: label });
  }

  function applyGesture(ev: GestureEmit) {
    const input = inputRef.current;
    if (!input) return;
    if (uiRef.current.shop || uiRef.current.settings || uiRef.current.board) return;
    const phase = uiRef.current.phase;
    const { action, label } = ev;
    if (action.name !== "drag") grabRef.current = null;
    showGesture(label);
    // A drag fires on the first twitch, before a finger has crossed a column.
    // The card only moves on once the piece did, so the step the coach ticks
    // off is a step the player watched happen.
    if (label !== "drag") advanceCoach(label);

    if (action.name === "hard" && !wantHard()) return;
    const pt = swipeRef.current?.lastPoint();
    if (pt && label !== "soft" && label !== "swipe" && label !== "drag") {
      const live = swipeRef.current?.snapshot()[0];
      vizRef.current.burst({
        label,
        x: pt.x,
        y: pt.y,
        dx: live ? live.x - live.sx : 0,
        dy: live
          ? live.y - live.sy
          : label === "flick"
            ? 1
            : label === "hold" || label === "long-press"
              ? -1
              : 0,
      });
    }

    if (phase === "title" || phase === "over") {
      if ((action.name === "confirm" || action.name === "hard") && wantCoin()) startGame();
      return;
    }
    if (phase === "paused") {
      if (action.name === "confirm" && simRef.current) {
        simRef.current.phase = "playing";
        syncUi({ phase: "playing" });
      }
      return;
    }
    if (phase !== "playing" && phase !== "clearing") return;

    if (action.name === "drag") {
      const well = wellRef.current;
      const sim = simRef.current;
      if (!well || !sim?.piece) return;
      const engine3 = well3dRef.current;
      if (!well || !sim?.piece || !engine3) return;
      const hit = engine3.clientToCell(
        well.getBoundingClientRect(),
        action.x,
        action.y,
      );
      if (grabRef.current == null) grabRef.current = sim.piece.x - hit.col;
      if (dragPiece(sim, hit.col + grabRef.current, sim.piece.y)) advanceCoach("drag");
      return;
    }
    if (action.name === "soft") {
      if (saveRef.current.swipeDrop) input.setTouch({ down: action.down });
      return;
    }
    else if (action.name === "hard") input.tap({ hard: true });
    else if (action.name === "rotate") {
      input.tap(action.dir === 1 ? { cw: true } : { ccw: true });
    } else if (action.name === "hold") {
      input.tap({ hold: true });
    }
  }
  applyGestureRef.current = applyGesture;
  function wantHard(): boolean {
    if (!uiRef.current.hardConfirm) return true;
    const now = performance.now();
    if (now - hardArm.current < 480) {
      hardArm.current = 0;
      syncUi({ dropAsk: false });
      return true;
    }
    hardArm.current = now;
    syncUi({ dropAsk: true });
    window.setTimeout(() => {
      if (performance.now() - hardArm.current >= 470) syncUi({ dropAsk: false });
    }, 500);
    return false;
  }

  function wantPower(id: "zap" | "quake"): boolean {
    const sim = simRef.current;
    if (!sim) return false;
    const now = performance.now();
    if (powerArm.current.id === id && now - powerArm.current.at < 900) {
      powerArm.current = { id: null, at: 0 };
      syncUi({ powerAsk: null });
      return true;
    }
    const marked = dirtyRows(sim, id === "zap" ? 1 : 2);
    if (!marked.length) {
      flashBanner("Nothing to clear");
      haptic("select");
      return false;
    }
    powerArm.current = { id, at: now };
    well3dRef.current?.sparkRows(marked, id === "zap" ? "#b8fff8" : "#d8c4a0");
    flashBanner(id === "zap" ? "Zap? tap again" : "Quake? tap again");
    haptic("select");
    sfxSelect();
    syncUi({ powerAsk: id });
    window.setTimeout(() => {
      if (powerArm.current.id === id && performance.now() - powerArm.current.at >= 880) {
        powerArm.current = { id: null, at: 0 };
        syncUi({ powerAsk: null });
      }
    }, 920);
    return false;
  }

  function finishCoach() {
    saveRef.current = { ...saveRef.current, onboarded: true };
    writeSave(saveRef.current);
    syncUi({ coach: null });
    flashBanner("Ready");
  }

  function advanceCoach(label: GestureLabel | "left" | "right" | "cw" | "ccw" | "hard") {
    const step = uiRef.current.coach;
    if (!step) return;
    const next = nextCoach(step, label);
    if (next === "done") finishCoach();
    else if (next !== step) syncUi({ coach: next });
  }

  function pickMode(id: ModeId) {
    unlockAudio();
    let botPlay = botPlayRef.current;
    let skipMsg: string | null = null;
    if (id === "finesse" && botPlay) {
      botPlay = false;
      botPlayRef.current = false;
      skipMsg = "Bot not in Finesse";
      bannerKind.current = "plain";
      bannerT.current = 1.6;
    }
    if (id === "watch") {
      botPlay = true;
      botPlayRef.current = true;
    }
    saveRef.current = { ...saveRef.current, mode: id };
    writeSave(saveRef.current);
    well3dRef.current?.setClear(
      saveRef.current.clearWell || id === "sprint" || id === "daily",
    );
    sfxSelect();
    haptic("select");
    const extra: Partial<Ui> = { mode: id, modesOpen: false, botPlay };
    if (skipMsg) extra.banner = skipMsg;
    if (uiRef.current.phase === "over" || uiRef.current.phase === "paused") {
      stopMusic();
      setMusicPaused(false);
      wipePit();
      if (simRef.current) simRef.current.phase = "title";
      syncUi({
        ...extra,
        phase: "title",
        recap: null,
        epitaph: null,
        cause: null,
        watching: false,
        failing: false,
        coinTake: false,
        score: 0,
        lines: 0,
        clock: 0,
        live: null,
        intro: null,
      });
      return;
    }
    syncUi(extra);
  }

  function openSettings() {
    unlockAudio();
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      setMusicPaused(true);
      syncUi({ phase: "paused", settings: true });
    } else syncUi({ settings: true });
  }

  function openBoard() {
    unlockAudio();
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      setMusicPaused(true);
      syncUi({ phase: "paused", board: true });
    } else syncUi({ board: true });
  }

  function setProfile(p: HapticProfile) {
    setHaptic(p);
    saveRef.current = { ...saveRef.current, haptic: p };
    writeSave(saveRef.current);
    haptic("select");
    syncUi({ haptic: p });
  }

  function toggleHard() {
    const next = !saveRef.current.hardConfirm;
    saveRef.current = { ...saveRef.current, hardConfirm: next };
    writeSave(saveRef.current);
    syncUi({ hardConfirm: next });
  }

  function toggleGhost() {
    const next = !saveRef.current.ghost;
    saveRef.current = { ...saveRef.current, ghost: next };
    writeSave(saveRef.current);
    syncUi({ ghost: next });
  }

  function setPadMode(m: PadMode) {
    saveRef.current = { ...saveRef.current, padMode: m };
    writeSave(saveRef.current);
    syncUi({ padMode: m });
  }

  function setPadSize(s: "compact" | "huge") {
    saveRef.current = { ...saveRef.current, padSize: s };
    writeSave(saveRef.current);
    syncUi({ padSize: s });
  }

  function toggleMarks() {
    const next = !saveRef.current.marks;
    saveRef.current = { ...saveRef.current, marks: next };
    writeSave(saveRef.current);
    syncUi({ marks: next });
  }

  function toggleHoldRight() {
    const next = !saveRef.current.holdRight;
    saveRef.current = { ...saveRef.current, holdRight: next };
    writeSave(saveRef.current);
    syncUi({ holdRight: next });
  }

  function toggleScan() {
    const next = !saveRef.current.scan;
    saveRef.current = { ...saveRef.current, scan: next };
    writeSave(saveRef.current);
    syncUi({ scan: next });
  }

  function toggleSwipeDrop() {
    const next = !saveRef.current.swipeDrop;
    saveRef.current = { ...saveRef.current, swipeDrop: next };
    writeSave(saveRef.current);
    syncUi({ swipeDrop: next });
  }

  function toggleClearWell() {
    const next = !saveRef.current.clearWell;
    saveRef.current = { ...saveRef.current, clearWell: next };
    writeSave(saveRef.current);
    well3dRef.current?.setClear(next || saveRef.current.mode === "sprint" || saveRef.current.mode === "daily");
    syncUi({ clearWell: next });
  }

  function setHandling(part: "dasMs" | "arrMs" | "sdf", value: number) {
    saveRef.current = { ...saveRef.current, [part]: value };
    writeSave(saveRef.current);
    syncUi({ [part]: value });
  }

  function onTheme(id: ThemeId) {
    const next = buyTheme(saveRef.current, id);
    if (!next) return;
    saveRef.current = next;
    writeSave(next);
    syncUi({ theme: next.theme, credits: next.credits });
  }

  function previewTheme(id: ThemeId) {
    syncUi({ theme: id });
  }

  /**
   * Forget fingers the well no longer holds.
   *
   * Every touch on the well is captured, so a finger still down is a finger
   * the well still has. One that got away — a touch the phone took for a
   * system swipe, an up that never landed — leaves its stroke behind, and a
   * leftover stroke reads as a second finger: the well emits no more drags and
   * stops sliding for the rest of the page while the pad plays on. The first
   * thing the coach asks for is that slide, so every touch clears the ghosts
   * before it starts.
   */
  function dropGhostStrokes(well: HTMLDivElement, live: number) {
    const gestures = swipeRef.current;
    if (!gestures) return;
    for (const s of gestures.snapshot()) {
      if (s.id !== live && !well.hasPointerCapture(s.id)) {
        gestures.feed("cancel", s.id, s.x, s.y);
      }
    }
  }

  function onWellPointer(e: React.PointerEvent<HTMLDivElement>) {
    unlockAudio();
    const phase = uiRef.current.phase;
    if (e.type === "pointerdown" && (phase === "title" || phase === "over")) {
      e.preventDefault();
      e.stopPropagation();
      if (wantCoin()) startGame();
      return;
    }
    if (e.type === "pointerdown" && phase === "paused") {
      e.preventDefault();
      if (simRef.current) {
        simRef.current.phase = "playing";
        syncUi({ phase: "playing" });
      }
      return;
    }
    if (isBotRun()) return;
    if (e.type === "pointerdown") {
      e.preventDefault();
      dropGhostStrokes(e.currentTarget, e.pointerId);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (e.type === "pointercancel" || e.type === "lostpointercapture") {
      swipeRef.current?.feed("cancel", e.pointerId, e.clientX, e.clientY, performance.now());
      return;
    }
    const kind =
      e.type === "pointerdown"
        ? "down"
        : e.type === "pointermove"
          ? "move"
          : e.type === "pointercancel"
            ? "cancel"
            : "up";
    swipeRef.current?.feed(
      kind,
      e.pointerId,
      e.clientX,
      e.clientY,
      performance.now(),
    );
  }

  return (
    <main className="shell">
      <div
        className={`cabinet${ui.phase === "playing" || ui.phase === "clearing" || ui.phase === "paused" ? " is-play" : ""}${ui.phase === "paused" ? " is-paused" : ""}${ui.phase === "over" ? " is-over" : ""}${ui.picking ? " is-pick" : ""}${showPad(ui.padMode) ? "" : " is-keys"}${ui.padSize === "huge" ? " is-pad-huge" : ""}${ui.danger ? " is-danger" : ""}${ui.brink ? " is-brink" : ""}${ui.failing ? " is-topout" : ""}${ui.lockPop ? " is-slam" : ""}${ui.tintPop ? " is-tint" : ""}${ui.takeover ? " is-takeover" : ""}${ui.cinema ? " is-cinema" : ""}${ui.mode === "zen" ? " is-zen" : ""}${ui.mode === "sprint" ? " is-sprint" : ""}${ui.mode === "siege" ? " is-siege" : ""}${(ui.botPlay || ui.mode === "watch") ? " is-watch" : ""}${viewW < 720 ? " is-narrow" : ""}`}
        style={{
          ["--bezel" as string]: themeOf(ui.theme).frame,
          ["--accent" as string]: ui.live
            ? themeOf(ui.theme).fill[ui.live]
            : themeOf(ui.theme).flash,
          ["--piece" as string]: ui.live
            ? themeOf(ui.theme).fill[ui.live]
            : themeOf(ui.theme).frame,
          ["--mode" as string]: modeOf(ui.mode).tint,
          ["--moon" as string]:
            ui.mode === "daily" ? String(0.45 + moonPhase() * 0.55) : "1",
        }}
      >
        <header className="topbar">
          <h1 className="logo">Stack</h1>
          {ui.offline && (
            <p className="off-mark" aria-live="polite">
              No signal
            </p>
          )}
          {ui.phase === "title" && (
            <p className="hi">Best {ui.high.toLocaleString()}</p>
          )}
        </header>

        {(ui.phase === "playing" || ui.phase === "clearing" || ui.phase === "paused") && (
          <div className="hud" role="status">
            <p className="hud-cell is-score">
              <span>Score</span>
              <b>{ui.score.toLocaleString()}</b>
            </p>
            {hudCells(ui).map((cell) => (
              <p className="hud-cell" key={cell.label}>
                <span>{cell.label}</span>
                <b>{cell.value}</b>
              </p>
            ))}
            {powersAllowed(ui.mode) && !botDriving(ui) && (
              <p className="hud-cell is-cr" data-qa="hud-cr">
                <span>Credits</span>
                <b key={ui.credits}>{ui.credits.toLocaleString()}</b>
              </p>
            )}
            <em data-qa="hud-mode">{botDriving(ui) ? botHudLabel(ui.mode) : modeOf(ui.mode).name}</em>
            {ui.mode === "sprint" && sprintPace(ui.clock, ui.lines, ui.sprintBest) ? (
              <small>{sprintPace(ui.clock, ui.lines, ui.sprintBest)}</small>
            ) : null}
            {ui.phase === "playing" ? (
              <button
                type="button"
                className="hud-pause"
                onPointerDown={(e) => {
                  e.preventDefault();
                  unlockAudio();
                  if (simRef.current) {
                    pauseToggle(simRef.current);
                    setMusicPaused(simRef.current.phase === "paused");
                    syncUi({ phase: simRef.current.phase });
                  }
                }}
              >
                Pause
              </button>
            ) : (
              <span className="hud-pause is-on">Paused</span>
            )}
          </div>
        )}

        <div className={`stage${ui.holdRight ? " is-flip" : ""}`}>
          <aside className="rail">
            <p className="rail-label">Hold</p>
            <div
              className={`pocket pocket-hold${ui.phase === "playing" && !ui.canHold ? " is-spent" : ""}${ui.holdPeek ? " is-swap" : ""}`}
              role="button"
              tabIndex={0}
              aria-label="Hold piece"
              onPointerDown={(e) => {
                e.preventDefault();
                if (ui.botPlay || ui.mode === "watch") return;
                unlockAudio();
                inputRef.current?.tap({ hold: true });
                holdUsed.current = true;
                advanceCoach("hold");
              }}
            >
              <MiniPiece key={ui.hold ?? "empty"} id={ui.hold} theme={ui.theme} />
              {ui.holdPeek && (
                <span className="hold-peek" aria-hidden="true">
                  <MiniPiece id={ui.holdPeek} theme={ui.theme} />
                </span>
              )}
            </div>
          </aside>

          <div
            ref={wellRef}
            className={`well${ui.levelPop ? " is-level" : ""}`}
            onPointerDown={onWellPointer}
            onPointerMove={onWellPointer}
            onPointerUp={onWellPointer}
            onPointerCancel={onWellPointer}
            onLostPointerCapture={onWellPointer}
          >
            <canvas ref={canvasRef} />
            <canvas ref={vizCanvasRef} className="viz" aria-hidden="true" />
            <div className="marquee">
              <span>
                {ui.theme === "citrine"
                  ? "Citrine"
                  : ui.theme === "blood"
                    ? "Blood Moon"
                    : ui.theme === "quiet"
                      ? "Quiet Glass"
                      : `HI ${ui.high.toLocaleString()}`}
              </span>
            </div>
            {ui.mode === "classic" && <i className="scan" aria-hidden="true" />}
            {ui.mode === "daily" && <i className="moon-wash" aria-hidden="true" />}
            {!ui.intro && ui.phase === "title" && (
              <p className="carving" aria-hidden="true">
                {modeOf(ui.mode).carving}
              </p>
            )}
            {ui.intro && ui.phase === "playing" && (
              <div className="intro" aria-hidden="true">
                <em>{botDriving(ui) ? botHudLabel(ui.mode) : modeOf(ui.mode).name}</em>
                <b>{ui.intro}</b>
                <p>{modeOf(ui.mode).carving}</p>
              </div>
            )}
            {ui.phase === "title" && !ui.watching && (
              <div className={`veil${ui.lifting ? " is-lift" : ""}`}>
                <p className="veil-kicker">
                  {ui.mode === "daily" &&
                  saveRef.current.daily.date === manilaDateKey() &&
                  saveRef.current.daily.score > 0
                    ? `Daily ${saveRef.current.daily.score.toLocaleString()}`
                    : "Insert coin"}
                </p>
                {ui.bagLine && (
                  <p className="bag-up">Today’s bag is up.</p>
                )}
                <p className="veil-title">Stack</p>
                <p className="veil-hint">Press start</p>
                {isAndroid() && (
                  <p className="veil-hint">
                    Slide sideways on the stack. Tap to turn. Use Drop — don’t swipe down.
                  </p>
                )}
                {!!getLastReplay() && (
                  <button
                    type="button"
                    className="text-btn"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unlockAudio();
                      watchLast();
                    }}
                  >
                    Watch last
                  </button>
                )}
                {ui.mode !== "watch" && (
                  <button
                    type="button"
                    className={`text-btn${ui.botPlay ? " is-on" : ""}`}
                    data-qa="bot-plays"
                    aria-pressed={ui.botPlay}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleBotPlay();
                    }}
                  >
                    {ui.botPlay ? "Bot on" : "Bot plays"}
                  </button>
                )}
                {ui.mode !== "watch" && (
                  <button
                    type="button"
                    className="text-btn"
                    data-qa="watch-bot"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unlockAudio();
                      startGame("watch");
                    }}
                  >
                    Watch bot
                  </button>
                )}
                <button
                  type="button"
                  className="play-btn"
                  data-qa="play"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unlockAudio();
                    startGame();
                  }}
                >
                  {ui.mode === "watch" || (ui.botPlay && botAllowed(ui.mode))
                    ? botStartLabel(ui.mode)
                    : ui.mode === "daily" &&
                        saveRef.current.daily.date === manilaDateKey() &&
                        saveRef.current.daily.score > 0
                      ? "Try again"
                      : "Start"}
                </button>
                {ui.banner && (
                  <p className="veil-hint" data-qa="bot-skip">
                    {ui.banner}
                  </p>
                )}
              </div>
            )}
            {ui.phase === "title" && ui.watching && (
              <button
                type="button"
                className="text-btn watch-stop"
                onPointerDown={(e) => {
                  e.preventDefault();
                  syncUi({ watching: false });
                }}
              >
                Stop
              </button>
            )}
            {ui.phase === "paused" && (
              <div className="veil is-pause">
                <div className="pause-card">
                  <p className="veil-kicker">Still here</p>
                  <p className="veil-title">Paused</p>
                  <button
                    type="button"
                    className="play-btn"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unlockAudio();
                      if (simRef.current) {
                        simRef.current.phase = "playing";
                        setMusicPaused(false);
                        setMusicTension(
                          simRef.current.mode !== "zen" && inDanger(simRef.current),
                        );
                        syncUi({ phase: "playing" });
                      }
                    }}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    data-qa="new-game"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unlockAudio();
                      startGame(ui.mode);
                    }}
                  >
                    New game
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      goHome();
                    }}
                  >
                    Home
                  </button>
                  <div className="pause-links">
                    <button
                      type="button"
                      className="text-btn"
                      data-qa="pause-store"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openShop();
                      }}
                    >
                      Store
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      data-qa="pause-settings"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openSettings();
                      }}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      data-qa="pause-modes"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        unlockAudio();
                        syncUi({ modesOpen: true });
                      }}
                    >
                      Modes
                    </button>
                  </div>
                </div>
              </div>
            )}
            {ui.phase === "over" && !ui.failing && ui.coinTake && (
              <div className="veil">
                <p className="veil-kicker">Insert coin</p>
                <p className="veil-title">Stack</p>
              </div>
            )}
            {ui.phase === "over" && !ui.failing && !ui.coinTake && (
              <div className="veil is-polaroid">
                {ui.recap && ui.recap.stacks > 0 ? (
                  <p className="stamp" aria-hidden="true">
                    Stack
                  </p>
                ) : null}
                <button
                  type="button"
                  className="veil-x"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goHome();
                  }}
                >
                  Home
                </button>
                <p className="veil-kicker">
                  {ui.epitaph ??
                    (ui.won
                      ? ui.mode === "sprint"
                        ? formatElapsed(ui.clock)
                        : "Time"
                      : ui.score >= ui.high && ui.score > 0
                        ? "New best"
                        : "Game over")}
                </p>
                <p className="veil-title">{ui.score.toLocaleString()}</p>
                {ui.recap?.dailyDate && (
                  <p className="daily-stamp">
                    {formatManilaDate(ui.recap.dailyDate)}
                    {ui.recap.streakCount && ui.recap.streakCount > 1
                      ? ` · ${ui.recap.streakCount} days`
                      : ui.recap.streakCount === 1
                        ? " · streak starts"
                        : ""}
                  </p>
                )}
                {ui.cause && <p className="veil-hint is-cause">{ui.cause}</p>}
                {ui.tip && <p className="veil-hint">{ui.tip}</p>}
                {ui.recap && (
                  <ul className="recap">
                    <li>
                      <span>Lines</span>
                      <b>{ui.recap.lines}</b>
                    </li>
                    <li>
                      <span>Level</span>
                      <b>{ui.recap.level}</b>
                    </li>
                    {ui.recap.combo > 0 && (
                      <li>
                        <span>Best combo</span>
                        <b>x{ui.recap.combo}</b>
                      </li>
                    )}
                    {ui.recap.tspins > 0 && (
                      <li>
                        <span>T-spins</span>
                        <b>{ui.recap.tspins}</b>
                      </li>
                    )}
                    {(ui.recap.stacks > 0 || ui.recap.mode === "sprint") && (
                      <li>
                        <span>{ui.recap.mode === "sprint" ? "Time" : "Stacks"}</span>
                        <b>
                          {ui.recap.mode === "sprint"
                            ? formatElapsed(ui.recap.clock)
                            : ui.recap.stacks}
                        </b>
                      </li>
                    )}
                    {ui.recap.perfects > 0 && (
                      <li>
                        <span>All clear</span>
                        <b>{ui.recap.perfects}</b>
                      </li>
                    )}
                    {ui.recap.clean != null && (
                      <li className={ui.recap.clean >= 20 ? "is-clean" : "is-messy"}>
                        <span>Clean</span>
                        <b>
                          {ui.recap.clean} / {ui.recap.pieces && ui.recap.pieces < 20 ? ui.recap.pieces : 20}
                        </b>
                      </li>
                    )}
                    {ui.recap.extras != null && ui.recap.clean == null && (
                      <li className={ui.recap.extras === 0 ? "is-clean" : "is-messy"}>
                        <span>Extra taps</span>
                        <b>{ui.recap.extras}</b>
                      </li>
                    )}
                  </ul>
                )}
                {ui.recap?.mode === "sprint" && ui.recap.splits.length > 0 && (
                  <ul className="splits">
                    {ui.recap.splits.map((s, i) => (
                      <li key={i}>
                        <span>{(i + 1) * 10}</span>
                        <b>{formatElapsed(s)}</b>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="play-btn"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unlockAudio();
                    startGame();
                  }}
                >
                  {ui.botPlay || ui.mode === "watch" ? "Watch again" : replayRef.current ? "Play again" : "Retry"}
                </button>
                {ui.recap && (
                  <button
                    type="button"
                    className="text-btn share-run"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void shareRun({
                        mode: modeOf(ui.mode).name,
                        score: ui.score,
                        lines: ui.recap!.lines,
                        combo: ui.recap!.combo,
                        clock: ui.recap!.clock,
                        splits: ui.mode === "sprint" ? ui.recap!.splits : undefined,
                        frames: getLastReplay() ?? replayRef.current ?? undefined,
                        epitaph: ui.epitaph ?? undefined,
                        still: bestStill.current?.snap,
                        callout: bestStill.current?.label,
                        date: ui.recap?.dailyDate
                          ? formatManilaDate(ui.recap.dailyDate)
                          : undefined,
                      });
                    }}
                  >
                    Share clip
                  </button>
                )}
                {(getLastReplay() || replayRef.current) && (
                  <button
                    type="button"
                    className="text-btn"
                    data-qa="watch-last-over"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unlockAudio();
                      watchLast();
                    }}
                  >
                    Watch last
                  </button>
                )}
              </div>
            )}
            {ui.phase === "playing" &&
              ui.pred &&
              !ui.intro &&
              modeOf(ui.mode).ghost &&
              (ui.pred.lock || ui.pred.rows <= 5) && (
              <p className={`pred-chip${ui.pred.lock ? " is-lock" : ""}`}>
                {ui.pred.lock ? "Lock" : ui.pred.kick ? "Kick ready" : `${ui.pred.rows} to lock`}
              </p>
            )}
            {ui.phase === "playing" && (ui.combo > 0 || ui.b2b) && (
              <div
                className={`combo-meter${ui.comboPop ? " is-live" : ""}`}
              >
                <span
                  key={`c-${ui.comboPop}`}
                  className={ui.combo > 0 ? `is-on${ui.comboPop ? " is-pop" : ""}` : ""}
                >
                  {ui.combo > 0 ? `x${ui.combo}` : "combo"}
                </span>
                <i>
                  <b
                    className={ui.comboPop ? "is-pop" : ""}
                    style={{ width: `${Math.min(100, ui.combo * 12)}%` }}
                  />
                </i>
                <em
                  key={`b-${ui.b2bPop}`}
                  className={ui.b2b ? `is-on${ui.b2bPop ? " is-fire" : ""}` : ""}
                >
                  B2B
                </em>
              </div>
            )}
            {ui.phase === "playing" && ui.comboPop > 0 && ui.combo > 0 && (
              <p key={`cb-${ui.comboPop}`} className="combo-burst">
                x{ui.combo}
              </p>
            )}
            {ui.phase === "playing" && ui.b2bPop > 0 && ui.b2b && (
              <p key={`bb-${ui.b2bPop}`} className="b2b-burst">
                B2B
              </p>
            )}
            {ui.phase === "playing" && ui.callout && (
              <p className={`callout is-${ui.callout.rank}`} aria-live="polite">
                <b>{ui.callout.title}</b>
                {ui.callout.sub && <em>{ui.callout.sub}</em>}
              </p>
            )}
            {ui.phase === "playing" && ui.holeHint && !ui.coach && (
              <p className="hole-hint">One more. Close the hole.</p>
            )}
            {ui.goal && ui.phase === "playing" && (
              <p className="banner is-goal" aria-live="polite">
                <b>{ui.goal.name}</b>
                <em>
                  {ui.goal.n > 1 ? "Daily goals" : "Daily goal"} paid +{ui.goal.cr} CR
                </em>
              </p>
            )}
            {ui.banner && ui.phase === "playing" && (
              <p className={`banner is-${bannerKind.current}`}>{ui.banner}</p>
            )}
            {ui.failing && (
              <p className="banner is-big is-topout" aria-live="assertive">
                Topped out
              </p>
            )}
            {ui.gesture && ui.phase === "playing" && (
              <p className="gchip">{ui.gesture}</p>
            )}
          </div>

          <aside className="rail rail-next">
            <p className="rail-label">Next</p>
            <div className="next-list">
              {(ui.next.length ? ui.next : [null, null, null, null, null])
                .slice(0, 5)
                .map((id, i) => (
                  <button
                    type="button"
                    className={`pocket pocket-sm${ui.picking ? " is-pickable" : ""}${i === 0 && ui.handoff ? " is-handoff" : ""}`}
                    key={i}
                    disabled={!ui.picking || !id}
                    aria-label={ui.picking ? `Use ${id ?? "piece"}` : undefined}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (ui.picking) chooseNext(i);
                    }}
                  >
                    <MiniPiece id={id} theme={ui.theme} />
                  </button>
                ))}
            </div>
            {ui.phase === "playing" && ui.bag.length > 0 && (
              <div className={`bag-strip${ui.bagPop ? " is-fill" : ""}`}>
                <b>
                  {ui.bag.length}
                  <span>in bag</span>
                </b>
                {ui.bag.map((id, i) => (
                  <i key={`${id}-${i}`} style={{ background: themeOf(ui.theme).fill[id] }} />
                ))}
              </div>
            )}
          </aside>
        </div>

        {ui.coach && ui.phase === "playing" ? (
          <CoachCard step={ui.coach} onSkip={finishCoach} />
        ) : (
          !botDriving(ui) && powersAllowed(ui.mode) && (
            <PowerBar
              inv={ui.inv}
              credits={ui.credits}
              shieldOn={ui.shield}
              slowOn={ui.slow}
              onUse={usePower}
              onBuy={stockPower}
              pickOn={ui.picking}
              armed={ui.powerAsk}
            />
          )
        )}
        {ui.mode === "siege" && ui.siege && ui.phase === "playing" && (
          <SiegeRail
            snap={ui.siege}
            onAim={() => {
              const s = siegeRef.current;
              if (!s) return;
              cycleAim(s);
              sfxSelect();
              syncUi({ siege: snapshotSiege(s) });
            }}
          />
        )}
        {!(ui.botPlay || ui.mode === "watch") && (
        <TouchPad
          onHold={(key, down) => {
            unlockAudio();
            inputRef.current?.setTouch({ [key]: down });
            if (down && (key === "left" || key === "right")) {
              inputRef.current?.tap({ [key]: true });
              advanceCoach(key);
            }
          }}
          onCw={() => {
            unlockAudio();
            inputRef.current?.tap({ cw: true });
            advanceCoach("cw");
          }}
          onCcw={() => {
            unlockAudio();
            inputRef.current?.tap({ ccw: true });
            advanceCoach("ccw");
          }}
          onFlip={() => {
            unlockAudio();
            inputRef.current?.tap({ flip: true });
            advanceCoach("cw");
          }}
          onHard={() => {
            unlockAudio();
            if (ui.phase === "title" || ui.phase === "over") {
              if (wantCoin()) startGame();
            } else if (wantHard()) {
              inputRef.current?.tap({ hard: true });
              advanceCoach("hard");
            }
          }}
          onHoldPiece={() => {
            unlockAudio();
            holdUsed.current = true;
            inputRef.current?.tap({ hold: true });
            advanceCoach("hold");
          }}
          slam={ui.lockPop}
          spent={ui.phase === "playing" && !ui.canHold}
          dropAsk={ui.dropAsk}
          onUndo={
            ui.phase === "playing" && ui.mode === "zen" && ui.canUndo
              ? () => {
                  const sim = simRef.current;
                  if (!sim || !undoZen(sim)) return;
                  sfxHold();
                  haptic("select");
                  syncUi({
                    canUndo: false,
                    score: sim.score,
                    lines: sim.lines,
                    hold: sim.hold,
                    next: sim.next,
                    bag: sim.bag.slice(),
                    live: sim.piece?.id ?? null,
                  });
                }
              : undefined
          }
        />
        )}
        {(ui.botPlay || ui.mode === "watch") &&
          (ui.phase === "playing" || ui.phase === "clearing" || ui.phase === "paused") && (
            <div className="watch-bar" role="status" aria-label={botHudLabel(ui.mode)}>
              <span data-qa="watch-label">{botHudLabel(ui.mode)}</span>
              <button
                type="button"
                data-qa="watch-pace"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const next = botPace.current === 1 ? 2 : 1;
                  botPace.current = next;
                  syncUi({ watchPace: next });
                }}
              >
                {ui.watchPace}×
              </button>
              <button
                type="button"
                data-qa="watch-leave"
                onPointerDown={(e) => {
                  e.preventDefault();
                  goHome();
                }}
              >
                {ui.mode === "zen" ? "Home" : "Leave"}
              </button>
            </div>
          )}

        {ui.phase === "title" && (
          <ModeChips
            mode={ui.mode}
            streak={ui.streak}
            onPick={pickMode}
            onMore={() => {
              unlockAudio();
              syncUi({ modesOpen: true });
            }}
          />
        )}

        <footer className="foot">
          <button type="button" className="icon-btn" onClick={() => openShop()} aria-label="Store" data-qa="open-shop">
            Store
          </button>
          <button type="button" className="icon-btn" onClick={openSettings} aria-label="Settings">
            Settings
          </button>
          <button type="button" className="icon-btn" onClick={() => syncUi({ modesOpen: true })} aria-label="Modes">
            Modes
          </button>
          <button type="button" className="icon-btn" onClick={openBoard} aria-label="Scores">
            Scores
          </button>
          <button type="button" className="icon-btn" onClick={toggleMute}>
            {radioLabel(ui.musicVol, ui.sfxVol)}
          </button>
        </footer>
        {/* An install is an offer, not a greeting: the first title belongs to Start. */}
        {!ui.standalone && saveRef.current.played && !saveRef.current.a2hs && ui.phase === "title" && (
          <div className="a2hs" data-qa="a2hs">
            <InstallButton />
            <button
              type="button"
              className="a2hs-x"
              aria-label="Dismiss install"
              onClick={() => {
                saveRef.current = { ...saveRef.current, a2hs: true };
                writeSave(saveRef.current);
                syncUi({});
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        <p className="help">
          {botDriving(ui) && (ui.phase === "playing" || ui.phase === "paused" || ui.phase === "clearing")
            ? ui.mode === "zen"
              ? "The bot is playing · Pause or Home"
              : "The bot is playing · Pause or Leave"
            : isAndroid()
            ? ui.swipeDrop
              ? "Slide left or right · tap to rotate · swipe down soft · flick or Drop slams"
              : "Slide left or right · tap to rotate · Drop slams · Hold parks"
            : isIOS()
              ? "Slide left or right · tap to turn · Drop slams · Hold parks"
              : showPad(ui.padMode)
                ? "Drag left or right · tap to rotate · Hold parks · Drop slams"
                : "← → move · ↑ / X rotate · F 180 · ↓ soft · Space hard · C hold · P pause"}
        </p>
        <ShopSheet
          open={ui.shop}
          credits={ui.credits}
          buying={buying}
          want={want}
          onClose={closeShop}
          onBuyCredits={onBuySku}
          onBuyPower={onBuyPower}
        />
        {ui.modesOpen && (
          <div className="shop-veil is-modes" role="dialog" aria-label="Modes">
            <div className="shop">
              <header className="shop-top">
                <div>
                  <p className="shop-kicker">Cabinet</p>
                  <h2>Modes</h2>
                </div>
                <button
                  type="button"
                  className="shop-x"
                  aria-label="Close"
                  onClick={() => syncUi({ modesOpen: false })}
                >
                  Close
                </button>
              </header>
              <ModeStrip
                mode={ui.mode}
                sprintBest={ui.sprintBest}
                daily={saveRef.current.daily}
                streak={ui.streak}
                onPick={pickMode}
              />
              <div className="sheet-bot-row">
                <button
                  type="button"
                  className={`text-btn${ui.botPlay ? " is-on" : ""}`}
                  data-qa="sheet-bot-plays"
                  aria-pressed={ui.botPlay}
                  onClick={() => toggleBotPlay()}
                >
                  {ui.botPlay ? "Bot on" : "Bot plays"}
                </button>
                <p>
                  {ui.mode === "finesse"
                    ? "The bot does not play Finesse."
                    : ui.botPlay
                      ? `The bot will play ${ui.mode === "watch" ? "Marathon" : modeOf(ui.mode).name}.`
                      : "Watch bot is Marathon. Bot plays works on every other mode."}
                </p>
              </div>
              <MissionRow book={ui.missions} />
            </div>
          </div>
        )}
        <SettingsSheet
          open={ui.settings}
          haptic={ui.haptic}
          hardConfirm={ui.hardConfirm}
          ghost={ui.ghost}
          padMode={ui.padMode}
          padSize={ui.padSize}
          marks={ui.marks}
          holdRight={ui.holdRight}
          scan={ui.scan}
          swipeDrop={ui.swipeDrop}
          clearWell={ui.clearWell}
          dasMs={ui.dasMs}
          arrMs={ui.arrMs}
          sdf={ui.sdf}
          theme={ui.theme}
          themes={saveRef.current.themes}
          credits={ui.credits}
          onClose={() => syncUi({ settings: false, theme: saveRef.current.theme })}
          onHaptic={setProfile}
          onHard={toggleHard}
          onGhost={toggleGhost}
          onPadMode={setPadMode}
          onPadSize={setPadSize}
          onMarks={toggleMarks}
          onHoldRight={toggleHoldRight}
          onScan={toggleScan}
          onSwipeDrop={toggleSwipeDrop}
          onClearWell={toggleClearWell}
          onHandling={setHandling}
          onTheme={onTheme}
          onPreview={previewTheme}
          musicVol={ui.musicVol}
          sfxVol={ui.sfxVol}
          onMix={setAudioMix}
          station={ui.station}
          onStation={pickStation}
        />
        <BoardSheet
          open={ui.board}
          scores={saveRef.current.scores}
          dailyRows={saveRef.current.dailyBoard.rows}
          dailyDate={saveRef.current.dailyBoard.date}
          yesterdayRows={saveRef.current.dailyPrev.rows}
          yesterdayDate={saveRef.current.dailyPrev.date}
          canWatchYesterday={
            !!getDailyReplay(
              saveRef.current.dailyBoard.date === manilaDateKey()
                ? saveRef.current.dailyPrev.date
                : saveRef.current.dailyBoard.date,
            )
          }
          onWatchYesterday={() => {
            const date =
              saveRef.current.dailyBoard.date === manilaDateKey()
                ? saveRef.current.dailyPrev.date
                : saveRef.current.dailyBoard.date;
            const snaps = getDailyReplay(date);
            syncUi({ board: false });
            if (snaps) watchLast(false, snaps);
          }}
          onClose={() => syncUi({ board: false })}
        />
      </div>
    </main>
  );
}

function botDriving(ui: Pick<Ui, "botPlay" | "mode">): boolean {
  return ui.botPlay || ui.mode === "watch";
}

function botHudLabel(mode: ModeId): string {
  if (mode === "watch") return "Watch bot";
  return `Bot · ${modeOf(mode).name}`;
}

function botStartLabel(mode: ModeId): string {
  if (mode === "watch") return "Watch";
  const short: Partial<Record<ModeId, string>> = {
    marathon: "Marathon",
    sprint: "Sprint",
    blitz: "Blitz",
    daily: "Daily",
    zen: "Zen",
    arcade: "Arcade",
    classic: "Classic",
    siege: "Siege",
  };
  return `Watch ${short[mode] ?? modeOf(mode).name}`;
}

/**
 * The two counters beside the score, and the word for each.
 *
 * Every mode counts something else there — a clock, a KO tally, twenty graded
 * pieces — and a bare number in a strip cannot say which.
 */
function hudCells(ui: Ui): { label: string; value: string }[] {
  if (ui.mode === "blitz")
    return [
      { label: "Time", value: formatClock(ui.timeLeft ?? 0) },
      { label: "Lines", value: `${ui.lines}` },
    ];
  if (ui.mode === "sprint")
    return [
      { label: "Time", value: formatElapsed(ui.clock) },
      { label: "Lines left", value: `${Math.max(0, 40 - ui.lines)}` },
    ];
  if (ui.mode === "finesse")
    return [
      { label: "Pieces", value: `${ui.finesseN}/20` },
      { label: "Clean", value: `${ui.finesseClean}` },
    ];
  if (ui.mode === "siege")
    return [
      { label: "KOs", value: `${ui.siege?.kos ?? 0}` },
      { label: "Lines", value: `${ui.lines}` },
    ];
  return [
    { label: "Level", value: `${ui.level}` },
    { label: "Lines", value: `${ui.lines}` },
  ];
}

function Stat({
  label,
  value,
  fill,
  hint,
  hot,
}: {
  label: string;
  value: string;
  fill?: number;
  hint?: string;
  hot?: "amber" | "red";
}) {
  return (
    <div className={`stat${hot ? ` is-${hot}` : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
      {fill != null && (
        <i className="stat-pip" style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }} />
      )}
    </div>
  );
}

function TickScore({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (Math.abs(shown - value) < 1) {
      setShown(value);
      return;
    }
    let raf = 0;
    const step = () => {
      setShown((s) => {
        const next = s + (value - s) * 0.24;
        if (Math.abs(value - next) < 1) return value;
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, shown]);
  return <Stat label="Score" value={Math.round(shown).toLocaleString()} />;
}

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getY: () => number;
      getRot: () => number;
      getPhase: () => Phase;
      getScore: () => number;
      getPiece: () => PieceId | null;
      setKeys: (codes: string[]) => void;
      tapLeft: () => void;
      tapRight: () => void;
      getGesture: () => GestureLabel | null;
      feedGesture: (
        type: "down" | "move" | "up" | "cancel",
        id: number,
        x: number,
        y: number,
        t?: number,
      ) => void;
      vizAlive: () => number;
      getCredits: () => number;
      getZap: () => number;
      getLines: () => number;
      getLevel: () => number;
      getMode: () => ModeId;
      getHold: () => PieceId | null;
      getBot: () => boolean;
      getBanner: () => string | null;
      topOut: () => void;
    };
  }
}

