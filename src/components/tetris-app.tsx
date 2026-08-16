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
  sfxLock,
  sfxMove,
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
import { createInput, type InputApi } from "@/game/input";
import { applyMissions, type MissionBook } from "@/game/missions";
import {
  dailySeed,
  formatClock,
  modeOf,
  utcDateKey,
  type ModeId,
} from "@/game/modes";
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
  type Sim,
} from "@/game/sim";
import { cellsOf, kickLabel } from "@/game/pieces";
import { HIDDEN_ROWS, COLS, type Phase, type PieceId } from "@/game/types";
import {
  buyWithCredits,
  consumePower,
  purchaseSku,
  type Inventory,
  type PowerId,
  type Sku,
} from "@/game/shop";
import { CoachCard, nextCoach, type CoachStep } from "./coach-card";
import { MiniPiece } from "./mini-piece";
import { Mascots, mascotMood } from "./mascots";
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
  } | null;
  tip: string | null;
  pred: { rows: number; lock: boolean; kick: boolean } | null;
  holdPeek: PieceId | null;
  failing: boolean;
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
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const [buying, setBuying] = useState<string | null>(null);
  const [keysOn, setKeysOn] = useState(() => hasKeyboard());

  useEffect(() => onKeyboard(() => setKeysOn(true)), []);

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
    });
    flashBanner(mode === "daily" ? `Daily · ${utcDateKey().slice(5)}` : modeOf(mode).name);
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
      syncUi();
    }
    if (ev === "clear") {
      sfxClear();
      haptic("clear");
      shakeRef.current = 5;
      flashBanner(sim.lastClear ?? "CLEAR");
      fireChain(sim, false);
      if (sim.lastPerfect) juicePerfect();
      syncUi();
    }
    if (ev === "tetris" || ev === "tspin") {
      sfxTetris();
      haptic("tetris");
      shakeRef.current = ev === "tetris" ? 12 : 8;
      well3dRef.current?.punch(ev === "tetris" ? 0.35 : 0.25);
      flashBanner(sim.lastClear ?? "STACK");
      fireChain(sim, ev === "tetris" || ev === "tspin");
      if (ev === "tetris") payMissions({ tetris: 1 });
      if (sim.lastPerfect) juicePerfect();
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

    if (sim.phase === "playing") setMusicTension(inDanger(sim));

    if (sim.score !== u.score || sim.level !== u.level || sim.lines !== u.lines) {
      if (sim.lines > u.lines) payMissions({ lines: sim.lines - u.lines, level: sim.level });
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
    });
    if (sim.won && sim.mode === "sprint") payMissions({ modeWin: "sprint" });
    if (sim.history.length > 1) {
      replayRef.current = sim.history.slice();
      replayI.current = 0;
      replayT.current = 0;
    }
    syncUi({
      phase: "over",
      high: saveRef.current.high,
      won: sim.won,
      clock: sim.clock,
      sprintBest: saveRef.current.sprintBest,
      recap: {
        lines: sim.lines,
        combo: sim.maxCombo,
        tspins: sim.tspins,
        stacks: sim.stacks,
        clock: sim.clock,
        splits: sim.splits.slice(),
        perfects: sim.perfects,
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
  }

  function stepReplay(dt: number) {
    const snaps = replayRef.current;
    if (!snaps || snaps.length === 0) return;
    replayT.current += dt;
    if (replayT.current < REPLAY_STEP) return;
    replayT.current = 0;
    replayI.current = (replayI.current + 1) % snaps.length;
  }

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
    sfxShatter();
    if (kind === "stack" || kind === "tspin" || kind === "triple") sfxSweep();
  }

  function juicePerfect() {
    well3dRef.current?.perfectBurst();
    sfxPerfect();
    haptic("win");
    shakeRef.current = 14;
    flashBanner("ALL CLEAR");
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
    bannerT.current = big ? 1.35 : mid ? 1.05 : 0.8;
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
    if (view && snaps && view.phase === "over" && snaps[replayI.current]) {
      const s = snaps[replayI.current]!;
      view = { ...view, board: s.board, piece: s.piece, score: s.score, lines: s.lines };
    }
    well3dRef.current?.draw(
      view,
      reduce ? 0 : shakeRef.current,
      theme,
      uiRef.current.ghost && modeOf(uiRef.current.mode).ghost,
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
    const off = uiRef.current.musicVol <= 0 && uiRef.current.sfxVol <= 0;
    const music = off ? 1 : 0;
    const sfx = off ? 1 : 0;
    setMix({ music, sfx });
    saveRef.current = { ...saveRef.current, musicVol: music, sfxVol: sfx, muted: !off };
    writeSave(saveRef.current);
    syncUi({ musicVol: music, sfxVol: sfx, muted: !off });
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
      return true;
    }
    hardArm.current = now;
    flashBanner("Drop?");
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

  function onTheme(id: ThemeId) {
    const next = buyTheme(saveRef.current, id);
    if (!next) return;
    saveRef.current = next;
    writeSave(next);
    syncUi({ theme: next.theme, credits: next.credits });
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
        className={`cabinet${ui.phase === "playing" || ui.phase === "clearing" ? " is-play" : ""}${ui.picking ? " is-pick" : ""}${showPad(ui.padMode) ? "" : " is-keys"}`}
      >
        <header className="topbar">
          <h1 className="logo">Stack</h1>
          <button type="button" className="cr-pill" onClick={openShop} data-qa="open-shop">
            {ui.credits.toLocaleString()} CR
          </button>
          <p className="hi">Best {ui.high.toLocaleString()}</p>
        </header>

        <div className="stats">
          <Stat label="Score" value={ui.score.toLocaleString()} />
          <Stat
            label={
              ui.mode === "blitz" ? "Time" : ui.mode === "sprint" ? "Clock" : "Level"
            }
            value={
              ui.mode === "blitz"
                ? formatClock(ui.timeLeft ?? 0)
                : ui.mode === "sprint"
                  ? formatClock(ui.clock)
                  : String(ui.level)
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
        </div>

        <div className="stage">
          <aside className="rail">
            <p className="rail-label">Hold</p>
            <div
              className="pocket pocket-hold"
              role="button"
              tabIndex={0}
              aria-label="Hold piece"
              onPointerDown={(e) => {
                e.preventDefault();
                unlockAudio();
                inputRef.current?.tap({ hold: true });
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

          <div className="pit">
          <div
            ref={wellRef}
            className="well"
            onPointerDown={onWellPointer}
            onPointerMove={onWellPointer}
            onPointerUp={onWellPointer}
            onPointerCancel={onWellPointer}
            onLostPointerCapture={onWellPointer}
          >
            <canvas ref={canvasRef} />
            <canvas ref={vizCanvasRef} className="viz" aria-hidden="true" />
            {ui.phase === "title" && (
              <div className="veil">
                <p className="veil-kicker">{modeOf(ui.mode).blurb}</p>
                <p className="veil-title">Stack</p>
                {isAndroid() && (
                  <p className="veil-hint">
                    Slide sideways on the stack. Tap to turn. Use Drop — don’t swipe down.
                  </p>
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
                  Play
                </button>
              </div>
            )}
            {ui.phase === "paused" && (
              <div className="veil is-pause">
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
                      setMusicTension(inDanger(simRef.current));
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
            {ui.phase === "over" && !ui.failing && (
              <div className="veil">
                <p className="veil-kicker">
                  {ui.won
                    ? ui.mode === "sprint"
                      ? formatClock(ui.clock)
                      : "Time"
                    : ui.score >= ui.high && ui.score > 0
                      ? "New best"
                      : "Game over"}
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
                      });
                    }}
                  >
                    Share run
                  </button>
                )}
              </div>
            )}
            {ui.phase === "playing" && ui.pred && modeOf(ui.mode).ghost && (
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
            {ui.phase === "playing" && (
              <button
                type="button"
                className="well-pause"
                aria-label="Pause"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
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
          <Mascots
            mood={mascotMood({
              failing: ui.failing,
              combo: ui.combo,
              banner: ui.banner,
              lock: !!ui.pred?.lock,
            })}
          />
          </div>

          <aside className="rail">
            <p className="rail-label">Next</p>
            <div className="next-list">
              {(ui.next.length ? ui.next : [null, null, null, null, null])
                .slice(0, 5)
                .map((id, i) => (
                  <button
                    type="button"
                    className={`pocket pocket-sm${ui.picking ? " is-pickable" : ""}`}
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
          </aside>
        </div>

        <PowerBar
          inv={ui.inv}
          shieldOn={ui.shield}
          slowOn={ui.slow}
          onUse={usePower}
          pickOn={ui.picking}
        />

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
            inputRef.current?.tap({ hold: true });
            advanceCoach("hold");
          }}
        />

        {(ui.phase === "title" || ui.phase === "over" || ui.phase === "paused") && (
          <ModeStrip
            mode={ui.mode}
            sprintBest={ui.sprintBest}
            daily={saveRef.current.daily}
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
            {ui.muted ? "Sound off" : "Sound on"}
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
          theme={ui.theme}
          themes={saveRef.current.themes}
          credits={ui.credits}
          onClose={() => syncUi({ settings: false })}
          onHaptic={setProfile}
          onHard={toggleHard}
          onGhost={toggleGhost}
          onPadMode={setPadMode}
          musicVol={ui.musicVol}
          sfxVol={ui.sfxVol}
          onMix={setAudioMix}
          onTheme={onTheme}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
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
