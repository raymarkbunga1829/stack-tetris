import { useEffect, useRef, useState } from "react";
import {
  resumeAudio,
  setMix,
  setMuted,
  sfxClear,
  sfxCombo,
  sfxB2b,
  sfxHard,
  sfxHold,
  sfxLevel,
  sfxLock,
  sfxMove,
  sfxOmen,
  sfxOver,
  sfxPerfect,
  sfxPower,
  sfxRotate,
  sfxSelect,
  sfxShatter,
  sfxStart,
  sfxSweep,
  sfxTetris,
  setMusicPaused,
  setMusicTension,
  startMusic,
  stopMusic,
  unlockAudio,
} from "@/game/audio";
import { haptic, setHaptic } from "@/game/haptics";
import { hasKeyboard, isAndroid, isIOS, onKeyboard, showPad, type PadMode } from "@/game/device";
import { createGestures, type GestureEmit, type GestureLabel } from "@/game/gestures";
import { createInput, type InputApi, type Pad } from "@/game/input";
import { applyMissions, type MissionBook } from "@/game/missions";
import {
  dailySeed,
  formatClock,
  sprintPace,
  moonPhase,
  modeOf,
  utcDateKey,
  type ModeId,
} from "@/game/modes";
import { clearLastStain, getLastAsh, getLastReplay, getLastStain, setLastAsh, setLastReplay, setLastStain } from "@/game/last-replay";
import { nameRun } from "@/game/run-name";
import { shareRun } from "@/game/share-run";
import { REPLAY_STEP, type Snap } from "@/game/replay";
import { resizeCanvas } from "@/game/render";
import { createViz } from "@/game/viz";
import { createWell3d, type Well3d } from "@/game/well3d";
import { loadSave, recordRun, writeSave, type HapticProfile, type SaveData } from "@/game/save";
import { buyTheme, themeOf, type ThemeId } from "@/game/themes";
import {
  advance,
  applyPower,
  createSim,
  dirtyRows,
  dragPiece,
  ghostY,
  inDanger,
  pauseToggle,
  pickFromNext,
  predictCollision,
  pulseAction,
  undoZen,
  type Sim,
} from "@/game/sim";
import { cellsOf, kickLabel } from "@/game/pieces";
import { HIDDEN_ROWS, COLS, ROWS, DAS_TOUCH, DAS, type Phase, type PieceId } from "@/game/types";
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
import { ModeStrip } from "./mode-strip";
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
  gesture: string | null;
  muted: boolean;
  musicVol: number;
  sfxVol: number;
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
  watching: boolean;
  streak: { count: number; last: string };
  missions: MissionBook;
  picking: boolean;
  combo: number;
  b2b: boolean;
  comboPop: number;
  b2bPop: number;
  sprintBest: number | null;
  recap: {
    lines: number;
    combo: number;
    tspins: number;
    stacks: number;
    clock: number;
    splits: number[];
    perfects: number;
    extras?: number;
  } | null;
  tip: string | null;
  pred: { rows: number; lock: boolean; kick: boolean } | null;
  holdPeek: PieceId | null;
  failing: boolean;
  live: PieceId | null;
  danger: boolean;
  bag: PieceId[];
  canHold: boolean;
  canUndo: boolean;
  lockPop: number;
  lifting: boolean;
  pbPop: number;
  coinTake: boolean;
  levelPop: number;
  bagPop: number;
  dropAsk: boolean;
  intro: string | null;
  takeover: number;
  cinema: boolean;
  handoff: PieceId | null;
  epitaph: string | null;
  siege: import("@/game/siege").SiegeSnap | null;
};

function forceCoach() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("coach");
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
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
  const swipeRef = useRef<ReturnType<typeof createGestures> | null>(null);
  const applyGestureRef = useRef<(ev: GestureEmit) => void>(() => {});
  const lastGestureRef = useRef<GestureLabel | null>(null);
  const gestureT = useRef(0);
  const grabRef = useRef<number | null>(null);
  const hardArm = useRef(0);
  const replayRef = useRef<Snap[] | null>(null);
  const replayI = useRef(0);
  const replayT = useRef(0);
  const comboSeen = useRef(-1);
  const b2bSeen = useRef(false);
  const failT = useRef(0);
  const dying = useRef(false);
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
    gesture: null,
    muted: saveRef.current.muted,
    musicVol: saveRef.current.musicVol,
    sfxVol: saveRef.current.sfxVol,
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
    watching: false,
    streak: saveRef.current.streak,
    missions: saveRef.current.missions,
    picking: false,
    combo: 0,
    b2b: false,
    comboPop: 0,
    b2bPop: 0,
    sprintBest: saveRef.current.sprintBest,
    recap: null,
    tip: null,
    pred: null,
    holdPeek: null,
    failing: false,
    live: null,
    danger: false,
    bag: [],
    canHold: true,
    canUndo: false,
    lockPop: 0,
    lifting: false,
    pbPop: 0,
    coinTake: false,
    levelPop: 0,
    bagPop: 0,
    dropAsk: false,
    intro: null,
    takeover: 0,
    cinema: false,
    handoff: null,
    epitaph: null,
    siege: null,
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const [buying, setBuying] = useState<string | null>(null);
  const [keysOn, setKeysOn] = useState(() => hasKeyboard());
  const pulseRef = useRef<(p: Partial<Pad>) => void>(() => {});
  const finesseKeys = useRef(0);
  const finesseN = useRef(0);
  const finesseExtras = useRef(0);
  const pieceBorn = useRef({ x: 3, keys: 0 });
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

  useEffect(() => onKeyboard(() => setKeysOn(true)), []);

  useEffect(() => {
    if (ui.phase !== "title" || ui.watching || ui.lifting || ui.settings || ui.shop) return;
    if (!getLastReplay()) return;
    const t = window.setTimeout(() => watchLast(true), 1600);
    return () => clearTimeout(t);
  }, [ui.phase, ui.watching, ui.lifting, ui.settings, ui.shop]);

  useEffect(() => {
    document.documentElement.classList.toggle("is-android", isAndroid());
    document.documentElement.classList.toggle("is-ios", isIOS());
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
    return () => mq.removeEventListener("change", onMode);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const vizCanvas = vizCanvasRef.current;
    const well = wellRef.current;
    if (!canvas || !well) return;

    const input = createInput();
    inputRef.current = input;
    input.setPulse((p) => pulseRef.current(p));
    const gestures = createGestures((ev) => applyGestureRef.current(ev));
    swipeRef.current = gestures;

    try {
      const engine = createWell3d(canvas);
      well3dRef.current = engine;
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

  function startGame(nextMode?: ModeId) {
    const mode = nextMode ?? saveRef.current.mode;
    if (uiRef.current.phase === "title" && !uiRef.current.lifting) {
      syncUi({ lifting: true });
      window.setTimeout(() => beginGame(mode), 480);
      return;
    }
    beginGame(mode);
  }

  function beginGame(mode: ModeId) {
    saveRef.current = { ...saveRef.current, mode };
    writeSave(saveRef.current);
    const seed = mode === "daily" ? dailySeed() : undefined;
    const sim = createSim({ mode, seed });
    simRef.current = sim;
    shakeRef.current = 0;
    replayRef.current = null;
    hardArm.current = 0;
    sfxStart();
    haptic("select");
    startMusic(mode);
    comboSeen.current = -1;
    b2bSeen.current = false;
    dying.current = false;
    failT.current = 0;
    holdPeekT.current = 0;
    finesseKeys.current = 0;
    finesseN.current = 0;
    finesseExtras.current = 0;
    pieceBorn.current = { x: sim.piece?.x ?? 3, keys: 0 };
    holdUsed.current = false;
    lockN.current = 0;
    sawOmen.current = false;
    uglySaid.current = false;
    siegeRef.current = mode === "siege" ? createSiege() : null;
    bagN.current = sim.bag.length;
    splitSeen.current = 0;
    quietT.current = 1.55;
    well3dRef.current?.setAsh(getLastAsh());
    const stain = getLastStain();
    well3dRef.current?.setStain(stain?.cells ?? null);
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
                ? utcDateKey().slice(5)
                : mode === "zen"
                  ? "Still"
                  : mode === "arcade"
                    ? "Read"
                    : mode === "siege"
                      ? "8"
                      : "Go";
    window.setTimeout(() => {
      if (uiRef.current.phase === "playing") syncUi({ intro: null });
    }, 1600);
    syncUi({
      phase: "playing",
      banner: null,
      score: 0,
      lines: 0,
      level: sim.level,
      hold: null,
      next: sim.next,
      mode,
      clock: 0,
      timeLeft: sim.timeLeft,
      won: false,
      coach: forceCoach() || !saveRef.current.onboarded ? "drag" : null,
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
      pred: null,
      holdPeek: null,
      failing: false,
      watching: false,
      lifting: false,
      coinTake: false,
      dropAsk: false,
      intro,
      takeover: 0,
      cinema: false,
      epitaph: null,
      siege: siegeRef.current ? snapshotSiege(siegeRef.current) : null,
      live: sim.piece?.id ?? null,
      danger: false,
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
    if (simRef.current) simRef.current.phase = "title";
    syncUi({
      phase: "title",
      watching: false,
      failing: false,
      danger: false,
      live: null,
    });
  }

  function watchLast(auto = false) {
    const snaps = getLastReplay();
    if (!snaps) return;
    replayRef.current = snaps;
    replayI.current = 0;
    replayT.current = 0;
    attractOn.current = auto;
    attractUntil.current = auto ? performance.now() + 20000 : 0;
    if (!simRef.current) simRef.current = createSim({ mode: uiRef.current.mode });
    syncUi({ watching: true });
  }

  function tick(dt: number) {
    const input = inputRef.current;
    if (!input) return;
    const { held, just } = input.sample();
    const u = uiRef.current;

    if (just.confirm || (just.hard && (u.phase === "title" || u.phase === "over"))) {
      if (u.phase === "title" || u.phase === "over") {
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
    if (keyed) usePower(keyed);

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
    if (!sim || u.phase === "title") return;

    if (sim.phase === "paused" || sim.phase === "over") {
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
      quietT.current -= dt;
      return;
    }

    const falling = sim.piece;
    const ghostAt = falling ? ghostY(sim) : 0;
    const ev = advance(sim, dt, {
      heldLeft: held.left,
      heldRight: held.right,
      justLeft: just.left,
      justRight: just.right,
      softDrop: held.down,
      justHard: just.hard,
      justCw: just.cw,
      justCcw: just.ccw,
      justHold: just.hold,
      nudge: input.takeNudge(),
      das: showPad(u.padMode) ? DAS_TOUCH : DAS,
    });

    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 10);
    if (bannerT.current > 0) {
      bannerT.current -= dt;
      if (bannerT.current <= 0) syncUi({ banner: null });
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
      sim.canHold !== u.canHold ||
      !!sim.undo !== u.canUndo
    ) {
      syncUi({
        live,
        danger,
        bag: sim.bag.slice(),
        canHold: sim.canHold,
        canUndo: !!sim.undo,
      });
    }

    if (sim.mode === "finesse") {
      if (just.left || just.right || just.cw || just.ccw) pieceBorn.current.keys += 1;
    }
    if (ev === "move" && (just.left || just.right)) {
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
      syncUi({ holdPeek: sim.piece?.id ?? null });
    }
    if (ev === "lock") {
      sfxLock();
      haptic("lock");
      const engine = well3dRef.current;
      if (engine && falling) {
        engine.lockThump(
          cellsOf(falling.id, falling.rot, falling.x, falling.y),
          themeOf(saveRef.current.theme).fill[falling.id],
        );
        if (just.hard && ghostAt - falling.y >= 2) {
          engine.hardStreak(falling, ghostAt, themeOf(saveRef.current.theme).fill[falling.id]);
          sfxHard();
        }
      }
      if (held.down && falling && sim.piece && sim.piece.y > falling.y) {
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
        const spins = falling.rot === 0 ? 0 : falling.rot === 2 ? 2 : 1;
        const extra = Math.max(0, pieceBorn.current.keys - (Math.abs(falling.x - pieceBorn.current.x) + spins));
        finesseN.current += 1;
        finesseExtras.current += extra;
        flashBanner(extra === 0 ? "CLEAN" : `+${extra}`);
        if (finesseN.current >= 20 && !dying.current) {
          sim.won = true;
          sim.phase = "over";
          finishRun(sim);
        }
      }
      if (sim.piece) pieceBorn.current = { x: sim.piece.x, keys: 0 };
      lockN.current += 1;
      if (
        lockN.current >= 20 &&
        !holdUsed.current &&
        !saveRef.current.holdHinted
      ) {
        saveRef.current = { ...saveRef.current, holdHinted: true };
        writeSave(saveRef.current);
        flashBanner("Hold parks a piece.");
      }
      syncUi({ lockPop: u.lockPop + 1 });
    }
    if (ev === "clear") {
      haptic("clear");
      shakeRef.current = 5;
      if (!saveRef.current.niceSeen) {
        saveRef.current = { ...saveRef.current, niceSeen: true };
        writeSave(saveRef.current);
        flashBanner("Nice.");
      } else {
        flashBanner(sim.lastClear ?? "CLEAR");
      }
      fireChain(sim, false);
      if (sim.lastPerfect) juicePerfect();
      fireSiege(sim);
      syncUi();
    }
    if (ev === "tetris" || ev === "tspin") {
      haptic("tetris");
      shakeRef.current = ev === "tetris" ? 12 : 8;
      well3dRef.current?.punch(ev === "tetris" ? 0.35 : 0.25);
      if (sim.blessed && ev === "tetris") {
        sim.blessed = false;
        syncUi({ picking: true });
        flashBanner("Name it.");
      } else if (sim.curseLeft === 2 && ev === "tetris") {
        flashBanner("A lie.");
      } else if (!saveRef.current.niceSeen) {
        saveRef.current = { ...saveRef.current, niceSeen: true };
        writeSave(saveRef.current);
        flashBanner("Nice.");
      } else {
        flashBanner(sim.lastClear ?? "STACK");
      }
      fireChain(sim, ev === "tetris" || ev === "tspin");
      if (ev === "tetris") payMissions({ tetris: 1 });
      if (sim.lastPerfect) juicePerfect();
      fireSiege(sim);
      syncUi();
    }
    if (ev === "win" || ev === "over") {
      if (ev === "win") {
        sfxTetris();
        haptic("win");
        flashBanner(sim.won && sim.mode === "sprint" ? "CLEAR" : "TIME");
        finishRun(sim);
      } else if (!dying.current) {
        dying.current = true;
        sfxOver();
        haptic("over");
        well3dRef.current?.failBeat();
        failT.current = 0.9;
        syncUi({ failing: true });
      }
    }

    if (sim.pendingCoins) {
      saveRef.current = {
        ...saveRef.current,
        credits: saveRef.current.credits + sim.pendingCoins,
      };
      writeSave(saveRef.current);
      sim.pendingCoins = 0;
      syncUi({ credits: saveRef.current.credits });
    }

    if (sim.phase === "playing") setMusicTension(sim.mode === "classic" && inDanger(sim));
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
    if (done[0]) flashBanner(`+${payout} CR`);
    syncUi({ missions: book, credits: saveRef.current.credits });
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
    if (label === "STACK" || label === "ALL CLEAR") return 4;
    if (label === "TRIPLE" || label.includes("3")) return 3;
    if (label === "DOUBLE" || label.includes("2")) return 2;
    if (label === "SINGLE" || label === "T-SPIN") return 1;
    return 0;
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
    }
    if (!sim.won) {
      setLastAsh(sim.board);
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
      perfects: sim.perfects,
      extras: sim.mode === "finesse" ? finesseExtras.current : undefined,
    });
    let themes = saveRef.current.themes.slice();
    if (sim.perfects > 0 && !themes.includes("citrine")) themes = [...themes, "citrine"];
    if (saveRef.current.streak.count >= 10 && !themes.includes("blood")) themes = [...themes, "blood"];
    if (sim.mode === "finesse" && sim.won && finesseExtras.current === 0 && !themes.includes("quiet")) {
      themes = [...themes, "quiet"];
    }
    if (themes.length !== saveRef.current.themes.length) {
      saveRef.current = { ...saveRef.current, themes };
      writeSave(saveRef.current);
    }
    dying.current = false;
    failT.current = 0;
    syncUi({
      phase: "over",
      failing: false,
      coinTake: true,
      streak: saveRef.current.streak,
      danger: false,
      live: null,
      high: saveRef.current.high,
      won: sim.won,
      clock: sim.clock,
      epitaph,
      sprintBest: saveRef.current.sprintBest,
      recap: {
        lines: sim.lines,
        combo: sim.maxCombo,
        tspins: sim.tspins,
        stacks: sim.stacks,
        clock: sim.clock,
        splits: sim.splits.slice(),
        perfects: sim.perfects,
        extras: sim.mode === "finesse" ? finesseExtras.current : undefined,
      },
      tip:
        !sim.won && !saveRef.current.tipSeen
          ? "Hold saves a piece. Ghost shows the drop."
          : null,
    });
    if (!sim.won && !saveRef.current.tipSeen) {
      saveRef.current = { ...saveRef.current, tipSeen: true };
      writeSave(saveRef.current);
    }
    window.setTimeout(() => {
      if (uiRef.current.phase === "over") syncUi({ coinTake: false });
    }, 720);
  }

  function stepReplay(dt: number) {
    const snaps = replayRef.current;
    if (!snaps || snaps.length === 0) return;
    replayT.current += dt;
    if (replayT.current < REPLAY_STEP) return;
    replayT.current = 0;
    replayI.current = (replayI.current + 1) % snaps.length;
  }

  function pulseNow(p: Partial<Pad>) {
    const sim = simRef.current;
    const u = uiRef.current;
    if (p.hard && (u.phase === "title" || u.phase === "over")) {
      startGame();
      return;
    }
    if (!sim || sim.phase !== "playing") return;
    if (sim.mode === "finesse" && (p.left || p.right || p.cw || p.ccw)) {
      pieceBorn.current.keys += 1;
    }
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
      syncUi({ holdPeek: sim.piece?.id ?? null });
    }
    if (ev === "lock" || ev === "over") {
      sfxLock();
      haptic("lock");
      if (p.hard) sfxHard();
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
      if (ev === "over") {
        dying.current = true;
        well3dRef.current?.failBeat();
        failT.current = 0.9;
        syncUi({ failing: true });
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
    engine.punch(
      kind === "stack" ? 0.95 : kind === "tspin" ? 0.78 : kind === "triple" ? 0.62 : kind === "double" ? 0.48 : 0.32,
    );
    const tint =
      kind === "stack"
        ? "#f7f4ee"
        : kind === "tspin"
          ? "#c9d6ea"
          : kind === "triple"
            ? "#d4c4f0"
            : kind === "double"
              ? "#e8d4a0"
              : "#a8b4c4";
    engine.sparkRows(sim.clearRows, tint);
    engine.shatter(sim, themeOf(saveRef.current.theme));
    engine.sweep(kind);
    if (kind === "stack" || kind === "tspin") engine.nod(0.85);
    else if (kind === "triple") engine.nod(0.32);
    const n =
      kind === "stack" ? 4 : kind === "triple" ? 3 : kind === "double" ? 2 : kind === "tspin" ? 3 : 1;
    sfxClear(n);
    sfxShatter();
    if (kind === "stack") {
      shakeRef.current = 16;
      syncUi({ takeover: 1 });
      window.setTimeout(() => {
        if (uiRef.current.takeover) syncUi({ takeover: 0 });
      }, 430);
    }
  }

  function juicePerfect() {
    well3dRef.current?.perfectBurst();
    sfxPerfect();
    haptic("win");
    shakeRef.current = 14;
    flashBanner("ALL CLEAR");
    syncUi({ cinema: true });
    window.setTimeout(() => {
      if (uiRef.current.phase === "playing") syncUi({ cinema: false });
    }, 900);
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
      reduce ? 0 : shakeRef.current,
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

  function openShop() {
    unlockAudio();
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      syncUi({ phase: "paused", shop: true });
    } else {
      syncUi({ shop: true });
    }
  }

  function closeShop() {
    syncUi({ shop: false });
  }

  function usePower(id: PowerId) {
    unlockAudio();
    const sim = simRef.current;
    if (!sim || (sim.phase !== "playing" && sim.phase !== "clearing")) return;
    if (id === "pick") {
      if (uiRef.current.picking) {
        syncUi({ picking: false });
        return;
      }
      if ((saveRef.current.inv.pick ?? 0) < 1) return;
      flashBanner("Tap Next");
      syncUi({ picking: true });
      return;
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
    advanceCoach(label);

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
      if (action.name === "confirm" || action.name === "hard") startGame();
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
      dragPiece(sim, hit.col + grabRef.current, sim.piece.y);
      return;
    }
    if (action.name === "soft") return;
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
    startGame(id);
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

  function onWellPointer(e: React.PointerEvent<HTMLDivElement>) {
    unlockAudio();
    const phase = uiRef.current.phase;
    if (e.type === "pointerdown" && (phase === "title" || phase === "over")) {
      e.preventDefault();
      e.stopPropagation();
      startGame();
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
    if (e.type === "pointerdown") {
      e.preventDefault();
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
        className={`cabinet${ui.phase === "playing" || ui.phase === "clearing" ? " is-play" : ""}${ui.picking ? " is-pick" : ""}${showPad(ui.padMode) ? "" : " is-keys"}${ui.padSize === "huge" ? " is-pad-huge" : ""}${ui.danger ? " is-danger" : ""}${ui.lockPop ? " is-slam" : ""}${ui.takeover ? " is-takeover" : ""}${ui.cinema ? " is-cinema" : ""}${ui.mode === "zen" ? " is-zen" : ""}${ui.mode === "sprint" ? " is-sprint" : ""}${ui.mode === "siege" ? " is-siege" : ""}`}
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
          <button type="button" className="cr-pill" onClick={openShop} data-qa="open-shop">
            {ui.credits.toLocaleString()} CR
          </button>
          <p className="hi">Best {ui.high.toLocaleString()}</p>
        </header>

        <div className={`stats${ui.lockPop ? " is-lock" : ""}${ui.pbPop ? " is-pb" : ""}`}>
          <TickScore value={ui.score} />
          <Stat
            label={
              ui.mode === "blitz" ? "Time" : ui.mode === "sprint" ? "Clock" : ui.mode === "siege" ? "KOs" : "Level"
            }
            value={
              ui.mode === "blitz"
                ? formatClock(ui.timeLeft ?? 0)
                : ui.mode === "sprint"
                  ? formatClock(ui.clock)
                  : ui.mode === "siege"
                    ? String(ui.siege?.kos ?? 0)
                    : String(ui.level)
            }
            fill={
              ui.mode === "blitz" || ui.mode === "sprint"
                ? undefined
                : (ui.lines % 10) / 10
            }
            hint={
              ui.mode === "sprint"
                ? sprintPace(ui.clock, ui.lines, ui.sprintBest)
                : ui.mode === "siege" && ui.siege
                  ? `${ui.siege.badges} badges`
                  : undefined
            }
            hot={
              ui.mode === "blitz" && ui.timeLeft != null
                ? ui.timeLeft <= 3
                  ? "red"
                  : ui.timeLeft <= 10
                    ? "amber"
                    : undefined
                : undefined
            }
          />
          <Stat
            label={ui.mode === "sprint" ? "Goal" : "Lines"}
            value={
              ui.mode === "sprint"
                ? `${Math.max(0, 40 - ui.lines)} left`
                : String(ui.lines)
            }
          />
          {ui.phase === "playing" && (
            <button
              type="button"
              className="stat stat-pause"
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
              <span className="stat-label">Game</span>
              <span className="stat-value">Pause</span>
            </button>
          )}
        </div>

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
                unlockAudio();
                inputRef.current?.tap({ hold: true });
                holdUsed.current = true;
                advanceCoach("hold");
              }}
            >
              <MiniPiece key={ui.hold ?? "empty"} id={ui.hold} theme={ui.theme} />
              {ui.phase === "playing" && ui.live && !ui.holdPeek && (
                <span className="hold-swap" aria-hidden="true">
                  <MiniPiece id={ui.live} theme={ui.theme} />
                </span>
              )}
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
            <div className={`marquee${ui.phase === "over" || ui.phase === "paused" ? " is-dark" : ""}`}>
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
            {!ui.intro && (
              <p className="carving" aria-hidden="true">
                {modeOf(ui.mode).carving}
              </p>
            )}
            {ui.intro && ui.phase === "playing" && (
              <div className="intro" aria-hidden="true">
                <em>{modeOf(ui.mode).name}</em>
                <b>{ui.intro}</b>
                <p>{modeOf(ui.mode).carving}</p>
              </div>
            )}
            {ui.phase === "title" && !ui.watching && (
              <div className={`veil${ui.lifting ? " is-lift" : ""}`}>
                <p className="veil-kicker">
                  {ui.mode === "daily" &&
                  saveRef.current.daily.date === utcDateKey() &&
                  saveRef.current.daily.score > 0
                    ? `Daily ${saveRef.current.daily.score.toLocaleString()}`
                    : "Insert coin"}
                </p>
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
                  {ui.mode === "daily" &&
                  saveRef.current.daily.date === utcDateKey() &&
                  saveRef.current.daily.score > 0
                    ? "Try again"
                    : "Start"}
                </button>
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
                <button
                  type="button"
                  className="veil-x"
                  aria-label="Home"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goHome();
                  }}
                >
                  ×
                  <em>Home</em>
                </button>
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
                      setMusicTension(simRef.current.mode === "classic" && inDanger(simRef.current));
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
                  aria-label="Home"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goHome();
                  }}
                >
                  ×
                  <em>Home</em>
                </button>
                <p className="veil-kicker">
                  {ui.epitaph ??
                    (ui.won
                      ? ui.mode === "sprint"
                        ? formatClock(ui.clock)
                        : "Time"
                      : ui.score >= ui.high && ui.score > 0
                        ? "New best"
                        : "Game over")}
                </p>
                <p className="veil-title">{ui.score.toLocaleString()}</p>
                {ui.tip && <p className="veil-hint">{ui.tip}</p>}
                {ui.recap && (
                  <ul className="recap">
                    <li>
                      <span>Lines</span>
                      <b>{ui.recap.lines}</b>
                    </li>
                    <li>
                      <span>Best combo</span>
                      <b>x{ui.recap.combo}</b>
                    </li>
                    <li>
                      <span>T-spins</span>
                      <b>{ui.recap.tspins}</b>
                    </li>
                    <li>
                      <span>{ui.mode === "sprint" ? "Time" : "Stacks"}</span>
                      <b>
                        {ui.mode === "sprint"
                          ? formatClock(ui.recap.clock)
                          : ui.recap.stacks}
                      </b>
                    </li>
                    {ui.recap.perfects > 0 && (
                      <li>
                        <span>All clear</span>
                        <b>{ui.recap.perfects}</b>
                      </li>
                    )}
                    {ui.recap.extras != null && (
                      <li className={ui.recap.extras === 0 ? "is-clean" : "is-messy"}>
                        <span>Extra taps</span>
                        <b>{ui.recap.extras}</b>
                      </li>
                    )}
                  </ul>
                )}
                {ui.mode === "sprint" && ui.recap && ui.recap.splits.length > 0 && (
                  <ul className="splits">
                    {ui.recap.splits.map((s, i) => (
                      <li key={i}>
                        <span>{(i + 1) * 10}</span>
                        <b>{formatClock(s)}</b>
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
                  {replayRef.current ? "Play again" : "Retry"}
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
                      });
                    }}
                  >
                    Share clip
                  </button>
                )}
              </div>
            )}
            {ui.phase === "playing" && ui.pred && !ui.intro && modeOf(ui.mode).ghost && (
              <p className={`pred-chip${ui.pred.lock ? " is-lock" : ""}`}>
                {ui.pred.lock ? "Lock" : ui.pred.kick ? "Kick ready" : `${ui.pred.rows} to lock`}
              </p>
            )}
            {ui.phase === "playing" && (
              <div
                className={`combo-meter${ui.comboPop ? " is-live" : ""}`}
                aria-hidden={ui.combo <= 0 && !ui.b2b}
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
            {ui.coach && ui.phase === "playing" && (
              <CoachCard step={ui.coach} onSkip={finishCoach} />
            )}
            {ui.banner && ui.phase === "playing" && (
              <p className={`banner is-${bannerKind.current}`}>{ui.banner}</p>
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
              <div className={`bag-strip${ui.bagPop ? " is-fill" : ""}`} aria-label="Left in bag">
                <b>{ui.bag.length}</b>
                {ui.bag.map((id, i) => (
                  <i key={`${id}-${i}`} style={{ background: themeOf(ui.theme).fill[id] }} />
                ))}
              </div>
            )}
          </aside>
        </div>

        <PowerBar
          inv={ui.inv}
          shieldOn={ui.shield}
          slowOn={ui.slow}
          onUse={usePower}
          pickOn={ui.picking}
        />
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
          onHard={() => {
            unlockAudio();
            if (ui.phase === "title" || ui.phase === "over") startGame();
            else if (wantHard()) {
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

        {(ui.phase === "title" || ui.phase === "over" || ui.phase === "paused") && (
          <ModeStrip
            mode={ui.mode}
            sprintBest={ui.sprintBest}
            daily={saveRef.current.daily}
            streak={ui.streak}
            onPick={pickMode}
          />
        )}
        {ui.phase === "title" && <MissionRow book={ui.missions} />}

        <footer className="foot">
          <button type="button" className="text-btn" onClick={openShop}>
            Store
          </button>
          <button type="button" className="text-btn" onClick={openSettings}>
            Settings
          </button>
          <button type="button" className="text-btn" onClick={openBoard}>
            Scores
          </button>
          <button type="button" className="text-btn" onClick={toggleMute}>
            {ui.musicVol > 0 ? "Quiet" : ui.sfxVol > 0 ? "Sound off" : "Sound on"}
          </button>
          {ui.phase === "playing" && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                unlockAudio();
                if (simRef.current) {
                  pauseToggle(simRef.current);
                  syncUi({ phase: simRef.current.phase });
                }
              }}
            >
              Pause
            </button>
          )}
          {!ui.standalone && ui.phase !== "playing" && ui.phase !== "clearing" && (
            <a className="text-btn install" href="?install=1&platform=ios">
              Add to Home Screen
            </a>
          )}
        </footer>
        <p className="help help-keys">
          ← → move · ↑ / X / W rotate · Z / Q flip · ↓ soft · Space hard · C / Shift hold · P pause · 1–5 powers
        </p>
        <p className="help help-touch">
          Drag left or right · tap to rotate · Hold parks a piece · Drop slams it
        </p>
        <p className="help help-android">
          Android · one finger: slide left/right on the stack · tap to rotate ·
          ↓ soft · white Drop slams · Hold parks · don’t swipe down, that isn’t drop
        </p>
        <p className="help help-ios">
          iPhone · slide left/right on the stack · tap to turn · arrows move ·
          white Drop slams · Hold parks · don’t rest a finger, that used to hold
        </p>
        <ShopSheet
          open={ui.shop}
          credits={ui.credits}
          buying={buying}
          onClose={closeShop}
          onBuyCredits={onBuySku}
          onBuyPower={onBuyPower}
        />
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
          onTheme={onTheme}
          onPreview={previewTheme}
          musicVol={ui.musicVol}
          sfxVol={ui.sfxVol}
          onMix={setAudioMix}
        />
        <BoardSheet
          open={ui.board}
          scores={saveRef.current.scores}
          dailyRows={saveRef.current.dailyBoard.rows}
          dailyDate={saveRef.current.dailyBoard.date}
          onClose={() => syncUi({ board: false })}
        />
      </div>
    </main>
  );
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
    };
  }
}
