import type { BedId, StationId } from "./radio";

type Bus = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  noise: AudioBuffer;
  noiseLong: AudioBuffer;
  noiseShort: AudioBuffer;
  silence: AudioBuffer;
  pulse25: PeriodicWave;
  pulse50: PeriodicWave;
  pulse12: PeriodicWave;
  echo: Echo;
};

/** One tape loop the modern beds sing into. The pulse beds never reach it. */
type Echo = {
  delay: DelayNode;
  feed: GainNode;
  tone: BiquadFilterNode;
};

let bus: Bus | null = null;
let armed = false;
let muted = false;
let musicVol = 1;
let sfxVol = 1;
let leadMute = 0;
let duckUntil = 0;
let softGate = 0;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function stealLead(dur: number) {
  if (!bus) return;
  leadMute = Math.max(leadMute, bus.ctx.currentTime + dur);
}

function pulseWave(ctx: AudioContext, duty: number) {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

function makeLfsr(ctx: AudioContext, short: boolean, period: number) {
  const len = Math.floor(ctx.sampleRate * 0.7);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let reg = 1;
  let hold = 1;
  let acc = 0;
  for (let i = 0; i < len; i++) {
    if (acc <= 0) {
      const bit = short ? (reg ^ (reg >> 6)) & 1 : (reg ^ (reg >> 1)) & 1;
      reg = (reg >> 1) | (bit << 14);
      hold = bit ? 1 : -1;
      acc = period;
    }
    data[i] = hold;
    acc -= 1;
  }
  return buf;
}

/**
 * One delay, shared. Each repeat comes back darker than the last, which is what
 * keeps a bed with an echo on it sounding like a room and not a stutter.
 */
function makeEcho(ctx: AudioContext, out: GainNode): Echo {
  const delay = ctx.createDelay(1.2);
  const feed = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  delay.delayTime.value = 0.24;
  feed.gain.value = 0;
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  delay.connect(tone);
  tone.connect(feed);
  feed.connect(delay);
  delay.connect(out);
  return { delay, feed, tone };
}

function applyGains() {
  if (!bus) return;
  const t = bus.ctx.currentTime;
  bus.sfx.gain.setTargetAtTime(0.32 * sfxVol, t, 0.03);
  if (t < duckUntil) {
    bus.master.gain.setTargetAtTime(1, t, 0.02);
    return;
  }
  const bed = 0.18 * musicVol;
  bus.music.gain.setTargetAtTime(musicPaused ? bed * 0.28 : bed, t, 0.08);
  bus.master.gain.setTargetAtTime(1, t, 0.02);
}

function duckMusic(sec: number, depth = 0.2) {
  if (!bus || musicVol <= 0) return;
  const t = bus.ctx.currentTime;
  const bed = 0.18 * musicVol;
  const nowBed = musicPaused ? bed * 0.28 : bed;
  duckUntil = Math.max(duckUntil, t + sec);
  stealLead(sec);
  bus.music.gain.cancelScheduledValues(t);
  bus.music.gain.setTargetAtTime(nowBed * depth, t, 0.035);
  bus.music.gain.setTargetAtTime(nowBed, t + sec, 0.14);
}

export function isMuted(): boolean {
  return musicVol <= 0 && sfxVol <= 0;
}

export function getMix() {
  return { music: musicVol, sfx: sfxVol };
}

export function setMix(next: { music?: number; sfx?: number }) {
  if (next.music != null) musicVol = clamp01(next.music);
  if (next.sfx != null) sfxVol = clamp01(next.sfx);
  muted = isMuted();
  applyGains();
  if (musicVol > 0 && musicBed && !musicRaf) {
    musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
    musicRaf = requestAnimationFrame(pumpMusic);
  }
}

export function setMuted(next: boolean) {
  setMix({ music: next ? 0 : 1, sfx: next ? 0 : 1 });
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  return makeLfsr(ctx, false, 8);
}

/** A dead sample through the master. Some browsers only open the tap for a source started in the gesture. */
function kick() {
  if (!bus) return;
  const src = bus.ctx.createBufferSource();
  src.buffer = bus.silence;
  src.connect(bus.master);
  src.start();
}

const GESTURES = ["pointerdown", "touchend", "mousedown", "keydown"] as const;

/**
 * The cabinet is deaf until a gesture opens it, and only some controls remember to ask.
 * Listen wide so a player's first touch — any touch — is the one that turns the radio on.
 */
export function armAudio() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  for (const type of GESTURES) {
    window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
}

function disarm() {
  if (!armed || typeof window === "undefined") return;
  armed = false;
  for (const type of GESTURES) {
    window.removeEventListener(type, unlockAudio, { capture: true });
  }
}

export function unlockAudio() {
  if (!bus) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.gain.value = 0.32 * sfxVol;
    music.gain.value = 0.18 * musicVol;
    master.gain.value = 1;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    bus = {
      ctx,
      echo: makeEcho(ctx, music),
      master,
      sfx,
      music,
      noise: makeLfsr(ctx, false, 8),
      noiseLong: makeLfsr(ctx, false, 12),
      noiseShort: makeLfsr(ctx, true, 3),
      silence: ctx.createBuffer(1, 1, ctx.sampleRate),
      pulse25: pulseWave(ctx, 0.25),
      pulse50: pulseWave(ctx, 0.5),
      pulse12: pulseWave(ctx, 0.125),
    };
  }
  const { ctx } = bus;
  if (ctx.state === "running") {
    disarm();
    return;
  }
  kick();
  // A refused resume leaves every later sound falling into a locked bus, so stay armed for the next touch.
  void ctx.resume().then(
    () => {
      if (ctx.state === "running") disarm();
      else armAudio();
    },
    () => armAudio(),
  );
}

export function resumeAudio() {
  if (bus) unlockAudio();
}

function pulse(
  freq: number,
  dur: number,
  when = 0,
  duty: 12 | 25 | 50 = 25,
  vol = 0.45,
  dest: "sfx" | "music" = "sfx",
) {
  if (!bus) return;
  if (dest === "sfx" && sfxVol <= 0) return;
  if (dest === "music" && musicVol <= 0) return;
  const { ctx } = bus;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.setPeriodicWave(duty === 12 ? bus.pulse12 : duty === 50 ? bus.pulse50 : bus.pulse25);
  osc.frequency.setValueAtTime(Math.max(20, freq), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(dest === "sfx" ? bus.sfx : bus.music);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function tone(
  freq: number,
  dur: number,
  when = 0,
  type: OscillatorType = "square",
  vol = 0.8,
) {
  if (type === "square") {
    pulse(freq, dur, when, 25, vol);
    return;
  }
  if (!bus || sfxVol <= 0) return;
  const { ctx, sfx } = bus;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfx);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function slide(
  from: number,
  to: number,
  dur: number,
  when = 0,
  _type: OscillatorType = "sawtooth",
  vol = 0.35,
) {
  if (!bus || sfxVol <= 0) return;
  const { ctx, sfx } = bus;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.setPeriodicWave(bus.pulse25);
  osc.frequency.setValueAtTime(Math.max(20, from), t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfx);
  osc.start(t);
  osc.stop(t + dur + 0.04);
}

function noiseBurst(
  dur: number,
  when = 0,
  vol = 0.28,
  _freq = 1400,
  _q = 0.8,
  short = false,
) {
  if (!bus || sfxVol <= 0) return;
  const { ctx, sfx } = bus;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = short ? bus.noiseShort : bus.noiseLong;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(short ? 4200 : 1400, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfx);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function arp(notes: number[], step = 0.055, _type: OscillatorType = "square", vol = 0.46) {
  notes.forEach((f, i) => {
    if (f > 0) pulse(f, step * 1.4, i * step, 25, vol);
  });
}

export function sfxMove() {
  pulse(196, 0.016, 0, 50, 0.08);
}
export function sfxRotate() {
  pulse(330, 0.028, 0, 25, 0.26);
  pulse(392, 0.036, 0.024, 25, 0.24);
}
export function sfxLock() {
  pulse(147, 0.04, 0, 50, 0.22);
  noiseBurst(0.04, 0, 0.1, 240, 0.7, false);
}
export function sfxLand(mass = 1) {
  const m = Math.max(0.6, Math.min(1.4, mass));
  noiseBurst(0.03 + m * 0.02, 0, 0.08 + m * 0.1, 140, 0.4, m > 1);
}
export function sfxHold() {
  pulse(262, 0.036, 0, 25, 0.28);
  pulse(392, 0.048, 0.036, 25, 0.26);
}
export function sfxSoft() {
  if (!bus || sfxVol <= 0) return;
  const t = bus.ctx.currentTime;
  if (t < softGate) return;
  softGate = t + 0.055;
  slide(210, 140, 0.04, 0, "square", 0.09);
}
export function sfxOmen() {
  stealLead(0.16);
  pulse(1568, 0.12, 0, 12, 0.22);
  pulse(2093, 0.18, 0.06, 12, 0.16);
}
export function sfxSingle() {
  pulse(523, 0.07, 0, 25, 0.22);
}
export function sfxDouble() {
  pulse(523, 0.055, 0, 25, 0.24);
  pulse(659, 0.08, 0.055, 25, 0.26);
}
export function sfxTriple() {
  pulse(392, 0.05, 0, 25, 0.24);
  pulse(523, 0.055, 0.05, 25, 0.26);
  pulse(659, 0.1, 0.1, 25, 0.28);
}
export function sfxMini() {
  pulse(880, 0.05, 0, 12, 0.22);
  pulse(1175, 0.08, 0.045, 12, 0.2);
}
export function sfxTspin() {
  duckMusic(0.62, 0.2);
  noiseBurst(0.1, 0, 0.16, 1600, 0.72, true);
  pulse(311, 0.07, 0, 25, 0.3);
  pulse(392, 0.08, 0.05, 25, 0.32);
  pulse(523, 0.12, 0.1, 12, 0.26);
  pulse(784, 0.14, 0.16, 12, 0.22);
  slide(196, 392, 0.16, 0.02, "triangle", 0.16);
}
export function sfxTst() {
  duckMusic(0.58, 0.18);
  pulse(311, 0.05, 0, 25, 0.28);
  pulse(392, 0.06, 0.045, 25, 0.3);
  pulse(523, 0.07, 0.09, 25, 0.3);
  pulse(784, 0.1, 0.14, 12, 0.26);
  pulse(1047, 0.14, 0.2, 12, 0.22);
}
export function sfxClear(n = 1) {
  if (n >= 4) sfxTetris();
  else if (n === 3) sfxTriple();
  else if (n === 2) sfxDouble();
  else sfxSingle();
}
export function sfxLine(rank: "single" | "double" | "triple" | "tetris" | "mini" | "tspin" | "tst" | "pc") {
  if (rank === "pc") sfxPerfect();
  else if (rank === "tetris") sfxTetris();
  else if (rank === "tst") sfxTst();
  else if (rank === "tspin") sfxTspin();
  else if (rank === "mini") sfxMini();
  else if (rank === "triple") sfxTriple();
  else if (rank === "double") sfxDouble();
  else sfxSingle();
}
export function sfxShatter() {
  noiseBurst(0.1, 0, 0.14, 1800, 0.55, false);
  noiseBurst(0.06, 0.02, 0.1, 2800, 1, true);
}
export function sfxSweep() {
  stealLead(0.2);
  slide(240, 1400, 0.16, 0, "square", 0.2);
}
export function sfxHard() {
  stealLead(0.14);
  slide(620, 90, 0.1, 0, "square", 0.34);
  noiseBurst(0.09, 0, 0.24, 480, 0.55, true);
  pulse(98, 0.08, 0.02, 50, 0.22);
}
export function sfxTetris() {
  duckMusic(0.72, 0.16);
  noiseBurst(0.12, 0, 0.18, 1200, 0.75, true);
  arp([392, 523, 659, 784, 988, 784, 1047, 1319], 0.052, "square", 0.52);
  pulse(588, 0.16, 0.08, 12, 0.18);
  slide(196, 98, 0.2, 0.02, "triangle", 0.18);
}
export function sfxLevel() {
  stealLead(0.28);
  arp([523, 659, 784, 1047], 0.06);
}
export function sfxOver() {
  stealLead(0.22);
  slide(294, 110, 0.2, 0, "square", 0.26);
  noiseBurst(0.12, 0.02, 0.14, 220, 0.5, false);
}
export function sfxStart() {
  stealLead(0.18);
  arp([392, 523, 659], 0.055);
}
export function sfxFinesse(kind: "perfect" | "slide" | "turn") {
  if (kind === "perfect") {
    pulse(330, 0.028, 0, 50, 0.1);
    return;
  }
  if (kind === "slide") {
    pulse(247, 0.04, 0, 25, 0.16);
    pulse(196, 0.05, 0.03, 25, 0.12);
    return;
  }
  pulse(392, 0.04, 0, 12, 0.16);
  pulse(311, 0.055, 0.035, 12, 0.14);
}

export function sfxSelect() {
  pulse(659, 0.035, 0, 25, 0.36);
}

export function sfxZap() {
  noiseBurst(0.08, 0, 0.4, 2800, 1.4);
  slide(1800, 220, 0.12, 0, "square", 0.38);
  tone(1400, 0.04, 0.02, "square", 0.3);
}

export function sfxQuake() {
  noiseBurst(0.28, 0, 0.42, 180, 0.45);
  tone(70, 0.22, 0, "sine", 0.55);
  tone(48, 0.28, 0.04, "triangle", 0.4);
  slide(200, 55, 0.2, 0.02, "sawtooth", 0.2);
}

export function sfxSlow() {
  slide(620, 220, 0.28, 0, "sine", 0.28);
  tone(330, 0.18, 0.06, "triangle", 0.22);
}

export function sfxShield() {
  tone(480, 0.08, 0, "sine", 0.32);
  tone(720, 0.12, 0.05, "triangle", 0.28);
  slide(360, 880, 0.16, 0.02, "sine", 0.18);
}

export function sfxPick() {
  tone(784, 0.05, 0, "square", 0.36);
  tone(988, 0.08, 0.05, "triangle", 0.32);
  noiseBurst(0.1, 0.02, 0.16, 2400, 0.8);
}

export function sfxCombo(n: number) {
  const step = Math.min(8, Math.max(1, n));
  pulse(392 + step * 55, 0.055, 0, 25, 0.2);
  pulse(523 + step * 70, 0.08, 0.04, 12, 0.18);
}

export function sfxB2b() {
  pulse(392, 0.06, 0, 25, 0.26);
  pulse(523, 0.08, 0.05, 25, 0.28);
  pulse(784, 0.12, 0.1, 12, 0.22);
}

export function sfxPerfect() {
  duckMusic(0.95, 0.12);
  noiseBurst(0.16, 0, 0.2, 1600, 0.6, true);
  arp([523, 659, 784, 988, 1047, 1319, 1568, 2093], 0.06, "square", 0.5);
  pulse(1047, 0.22, 0.18, 12, 0.2);
  pulse(1568, 0.28, 0.28, 12, 0.16);
  slide(196, 392, 0.24, 0.04, "triangle", 0.16);
}

export function sfxPower(id: "zap" | "slow" | "shield" | "quake" | "pick") {
  if (id === "zap") sfxZap();
  else if (id === "slow") sfxSlow();
  else if (id === "shield") sfxShield();
  else if (id === "quake") sfxQuake();
  else sfxPick();
}

type Bed = {
  bpm: number;
  /** Notes per beat. Two — eighths — unless a bed needs sixteenths to move. */
  div?: number;
  lead: number[];
  harm: number[];
  bass: number[];
  /** Set on the beds that run the modern rack instead of the pulse pair. */
  rack?: Rack;
};

/**
 * How a modern bed is voiced. The notes are still three columns of numbers; this
 * is the amp they go through — what the lead is made of, how open the filters
 * sit, what the kit plays, and how much of it comes back off the delay.
 */
type Rack = {
  /** Lead and pad timbre: detuned saws, an electric-piano pair, or a plucked stab. */
  voice: "saw" | "keys" | "pluck";
  /**
   * Trim for the whole bed. A busy kit reads louder than a pulse pair playing
   * the same notes, and turning the dial should not turn the volume.
   */
  level?: number;
  /** How long a lead note holds, in steps. */
  hold: number;
  /** Where the filter over lead and pad opens, in Hz. */
  tone: number;
  /** How far the saws pull apart, in cents. Wider is lusher. */
  detune?: number;
  /** Where the bass filter opens, in Hz. */
  bassTone?: number;
  /** How long a bass note holds, in steps. */
  bassHold?: number;
  /** How far a late step is pushed, as a fraction of a step. */
  swing?: number;
  /** Delay in steps, how much feeds back, and how much of the bed is sent. */
  echo?: { steps: number; feed: number; wet: number };
  /** Kit patterns, read one step at a time and looped. Each number is a velocity. */
  kick?: number[];
  hat?: number[];
  clap?: number[];
};

const BEDS: Record<BedId, Bed> = {
  marathon: {
    bpm: 104,
    lead: [220, 262, 330, 294, 262, 247, 220, 0, 220, 262, 294, 330, 392, 330, 294, 262, 247, 294, 330, 0, 294, 262, 220, 196, 220, 262, 330, 294, 262, 220, 196, 220],
    harm: [165, 196, 262, 220, 196, 185, 165, 0, 165, 196, 220, 262, 294, 262, 220, 196, 185, 220, 262, 0, 220, 196, 165, 147, 165, 196, 262, 220, 196, 165, 147, 165],
    bass: [110, 0, 110, 0, 131, 0, 110, 0, 110, 0, 98, 0, 110, 0, 131, 0, 98, 0, 110, 0, 131, 0, 110, 0, 110, 0, 98, 0, 87, 0, 110, 0],
  },
  sprint: {
    bpm: 132,
    lead: [262, 330, 392, 330, 349, 392, 0, 330, 262, 294, 349, 330, 392, 440, 392, 330, 294, 349, 392, 0, 349, 330, 262, 294, 330, 392, 349, 330, 294, 262, 247, 262],
    harm: [196, 262, 294, 262, 262, 294, 0, 247, 196, 220, 262, 247, 294, 330, 294, 247, 220, 262, 294, 0, 262, 247, 196, 220, 247, 294, 262, 247, 220, 196, 185, 196],
    bass: [131, 0, 131, 0, 147, 0, 131, 0, 131, 0, 110, 0, 131, 0, 147, 0, 110, 0, 131, 0, 147, 0, 131, 0, 131, 0, 110, 0, 98, 0, 131, 0],
  },
  blitz: {
    bpm: 156,
    lead: [311, 370, 466, 0, 415, 370, 311, 247, 311, 370, 415, 466, 554, 466, 415, 370, 247, 311, 370, 0, 311, 277, 247, 208, 247, 311, 370, 415, 370, 311, 277, 311],
    harm: [233, 277, 370, 0, 311, 277, 233, 185, 233, 277, 311, 370, 415, 370, 311, 277, 185, 233, 277, 0, 233, 208, 185, 156, 185, 233, 277, 311, 277, 233, 208, 233],
    bass: [155, 0, 155, 0, 185, 0, 155, 0, 155, 0, 139, 0, 155, 0, 185, 0, 123, 0, 155, 0, 185, 0, 155, 0, 155, 0, 139, 0, 123, 0, 155, 0],
  },
  daily: {
    bpm: 108,
    lead: [220, 262, 330, 262, 294, 330, 0, 220, 247, 294, 370, 330, 294, 262, 247, 220, 196, 247, 294, 0, 262, 220, 196, 175, 196, 220, 262, 294, 262, 220, 196, 220],
    harm: [165, 196, 247, 196, 220, 247, 0, 165, 185, 220, 277, 247, 220, 196, 185, 165, 147, 185, 220, 0, 196, 165, 147, 131, 147, 165, 196, 220, 196, 165, 147, 165],
    bass: [110, 0, 110, 0, 131, 0, 110, 0, 123, 0, 110, 0, 98, 0, 110, 0, 98, 0, 110, 0, 131, 0, 110, 0, 110, 0, 98, 0, 87, 0, 110, 0],
  },
  arcade: {
    bpm: 128,
    lead: [196, 247, 294, 247, 330, 294, 0, 247, 220, 262, 330, 294, 349, 330, 294, 247, 196, 247, 294, 0, 262, 220, 196, 175, 196, 247, 294, 330, 294, 247, 220, 196],
    harm: [147, 196, 220, 196, 247, 220, 0, 185, 165, 196, 247, 220, 262, 247, 220, 185, 147, 185, 220, 0, 196, 165, 147, 131, 147, 185, 220, 247, 220, 185, 165, 147],
    bass: [98, 0, 98, 0, 110, 0, 98, 0, 110, 0, 98, 0, 87, 0, 98, 0, 82, 0, 98, 0, 110, 0, 98, 0, 98, 0, 87, 0, 73, 0, 98, 0],
  },
  classic: {
    bpm: 96,
    lead: [196, 220, 247, 196, 262, 247, 0, 196, 175, 196, 220, 247, 262, 247, 220, 196, 165, 196, 220, 0, 196, 175, 147, 165, 175, 196, 220, 247, 220, 196, 175, 196],
    harm: [147, 165, 185, 147, 196, 185, 0, 147, 131, 147, 165, 185, 196, 185, 165, 147, 123, 147, 165, 0, 147, 131, 110, 123, 131, 147, 165, 185, 165, 147, 131, 147],
    bass: [98, 0, 98, 0, 110, 0, 98, 0, 87, 0, 98, 0, 110, 0, 98, 0, 82, 0, 98, 0, 110, 0, 98, 0, 98, 0, 87, 0, 73, 0, 98, 0],
  },
  zen: {
    bpm: 72,
    lead: [196, 0, 247, 0, 294, 0, 247, 196, 220, 0, 262, 0, 330, 0, 262, 220, 196, 0, 247, 0, 294, 0, 247, 0, 175, 0, 196, 0, 220, 0, 196, 0],
    harm: [147, 0, 185, 0, 220, 0, 185, 147, 165, 0, 196, 0, 247, 0, 196, 165, 147, 0, 185, 0, 220, 0, 185, 0, 131, 0, 147, 0, 165, 0, 147, 0],
    bass: [98, 0, 0, 0, 98, 0, 0, 0, 110, 0, 0, 0, 98, 0, 0, 0, 87, 0, 0, 0, 98, 0, 0, 0, 73, 0, 0, 0, 87, 0, 0, 0],
  },
  finesse: {
    bpm: 116,
    lead: [262, 294, 330, 0, 294, 330, 392, 330, 349, 392, 440, 392, 330, 294, 262, 294, 247, 294, 330, 0, 294, 262, 220, 247, 262, 330, 294, 262, 247, 220, 196, 262],
    harm: [196, 220, 247, 0, 220, 247, 294, 247, 262, 294, 330, 294, 247, 220, 196, 220, 185, 220, 247, 0, 220, 196, 165, 185, 196, 247, 220, 196, 185, 165, 147, 196],
    bass: [131, 0, 131, 0, 147, 0, 131, 0, 147, 0, 131, 0, 110, 0, 131, 0, 123, 0, 131, 0, 147, 0, 131, 0, 131, 0, 110, 0, 98, 0, 131, 0],
  },
  ghost: {
    bpm: 84,
    lead: [220, 0, 262, 233, 220, 0, 196, 175, 196, 0, 220, 262, 294, 262, 220, 196, 175, 0, 196, 220, 233, 220, 196, 175, 147, 0, 175, 196, 220, 0, 196, 175],
    harm: [165, 0, 196, 175, 165, 0, 147, 131, 147, 0, 165, 196, 220, 196, 165, 147, 131, 0, 147, 165, 175, 165, 147, 131, 110, 0, 131, 147, 165, 0, 147, 131],
    bass: [110, 0, 0, 0, 110, 0, 98, 0, 87, 0, 0, 0, 110, 0, 98, 0, 73, 0, 0, 0, 87, 0, 98, 0, 110, 0, 0, 0, 98, 0, 87, 0],
  },
  lastcall: {
    bpm: 92,
    lead: [262, 294, 349, 294, 262, 233, 220, 233, 262, 0, 294, 262, 220, 196, 175, 196, 220, 262, 294, 0, 262, 220, 196, 175, 165, 196, 220, 262, 233, 220, 196, 175],
    harm: [196, 220, 262, 220, 196, 175, 165, 175, 196, 0, 220, 196, 165, 147, 131, 147, 165, 196, 220, 0, 196, 165, 147, 131, 123, 147, 165, 196, 175, 165, 147, 131],
    bass: [87, 0, 87, 0, 116, 0, 87, 0, 98, 0, 98, 0, 131, 0, 98, 0, 110, 0, 110, 0, 87, 0, 87, 0, 116, 0, 98, 0, 87, 0, 87, 0],
  },
  // Four bars of Am–F–C–G, stabbed off the beat where the kick is not.
  house: {
    bpm: 124,
    lead: [0, 523, 0, 440, 0, 659, 0, 523, 0, 523, 0, 440, 0, 698, 0, 523, 0, 523, 0, 392, 0, 659, 0, 523, 0, 494, 0, 392, 0, 587, 0, 494],
    harm: [0, 330, 0, 262, 0, 440, 0, 330, 0, 349, 0, 262, 0, 440, 0, 349, 0, 330, 0, 262, 0, 392, 0, 330, 0, 392, 0, 294, 0, 494, 0, 392],
    bass: [0, 110, 0, 110, 0, 110, 0, 220, 0, 87, 0, 87, 0, 87, 0, 175, 0, 131, 0, 131, 0, 131, 0, 262, 0, 98, 0, 98, 0, 98, 0, 196],
    rack: {
      voice: "saw",
      level: 0.7,
      hold: 1.1,
      tone: 2600,
      detune: 11,
      bassTone: 420,
      bassHold: 0.8,
      echo: { steps: 1.5, feed: 0.2, wet: 0.2 },
      kick: [1, 0, 0.92, 0, 1, 0, 0.92, 0],
      hat: [0, 0.42, 0.16, 0.5, 0, 0.42, 0.18, 0.55],
      clap: [0, 0, 0.5, 0, 0, 0, 0.55, 0],
    },
  },
  // Cmaj7–Am7–Dm7–G7, played late and left blurry.
  lofi: {
    bpm: 78,
    lead: [523, 0, 0, 494, 0, 392, 0, 0, 440, 0, 392, 0, 0, 330, 0, 0, 523, 0, 0, 440, 0, 349, 0, 294, 494, 0, 0, 392, 0, 349, 0, 0],
    harm: [330, 0, 0, 0, 262, 0, 0, 0, 262, 0, 0, 0, 220, 0, 0, 0, 349, 0, 0, 0, 294, 0, 0, 0, 294, 0, 0, 0, 247, 0, 0, 0],
    bass: [131, 0, 0, 0, 98, 0, 0, 0, 110, 0, 0, 0, 82, 0, 0, 0, 73, 0, 0, 0, 110, 0, 0, 0, 98, 0, 0, 0, 73, 0, 0, 0],
    rack: {
      voice: "keys",
      hold: 3.2,
      tone: 1500,
      bassTone: 260,
      bassHold: 2.2,
      swing: 0.24,
      echo: { steps: 3, feed: 0.26, wet: 0.26 },
      kick: [0.8, 0, 0, 0, 0, 0.62, 0, 0],
      hat: [0, 0.3, 0.4, 0, 0.26, 0.32, 0.4, 0.24],
      clap: [0, 0, 0, 0, 0.42, 0, 0, 0.2],
    },
  },
  // Sixteenths, because the bass is the whole point. Am for a bar, then F.
  synthwave: {
    bpm: 108,
    div: 4,
    lead: [880, 0, 0, 0, 0, 0, 0, 0, 784, 0, 0, 0, 659, 0, 0, 0, 698, 0, 0, 0, 0, 0, 0, 0, 659, 0, 0, 0, 587, 0, 0, 0],
    harm: [330, 0, 0, 0, 0, 0, 0, 0, 262, 0, 0, 0, 0, 0, 0, 0, 262, 0, 0, 0, 0, 0, 0, 0, 220, 0, 0, 0, 0, 0, 0, 0],
    bass: [110, 110, 110, 110, 110, 110, 220, 110, 110, 110, 110, 110, 110, 220, 110, 220, 87, 87, 87, 87, 87, 87, 175, 87, 87, 87, 87, 87, 87, 175, 87, 175],
    rack: {
      voice: "saw",
      level: 0.82,
      hold: 6,
      tone: 2200,
      detune: 16,
      bassTone: 700,
      bassHold: 0.85,
      echo: { steps: 3, feed: 0.3, wet: 0.28 },
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0.4],
      hat: [0, 0, 0.3, 0, 0, 0, 0.34, 0, 0, 0, 0.3, 0, 0, 0, 0.38, 0.2],
      clap: [0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0, 0.72, 0, 0, 0],
    },
  },
  // Half time and wide open: F–C–G–Am up where the air is.
  future: {
    bpm: 148,
    lead: [880, 0, 0, 784, 0, 0, 698, 0, 784, 0, 0, 659, 0, 0, 587, 0, 988, 0, 0, 880, 0, 0, 784, 0, 880, 0, 0, 784, 0, 0, 659, 0],
    harm: [523, 0, 0, 440, 0, 0, 349, 0, 392, 0, 0, 330, 0, 0, 262, 0, 587, 0, 0, 494, 0, 0, 392, 0, 523, 0, 0, 440, 0, 0, 330, 0],
    bass: [87, 0, 0, 0, 0, 0, 87, 0, 65, 0, 0, 0, 0, 0, 65, 0, 98, 0, 0, 0, 0, 0, 98, 0, 110, 0, 0, 0, 0, 0, 110, 0],
    rack: {
      voice: "saw",
      level: 0.86,
      hold: 2.6,
      tone: 3400,
      detune: 23,
      bassTone: 320,
      bassHold: 2.4,
      echo: { steps: 2, feed: 0.22, wet: 0.24 },
      kick: [1, 0, 0, 0, 0, 0, 0.85, 0],
      hat: [0, 0.3, 0.4, 0.28, 0, 0.3, 0.42, 0.3],
      clap: [0, 0, 0, 0, 0.8, 0, 0, 0],
    },
  },
  // Shuffled sixteenths, kick on one and the back half of three. Am7, then Dm7.
  garage: {
    bpm: 130,
    div: 4,
    lead: [0, 0, 523, 0, 0, 659, 0, 0, 0, 0, 440, 0, 392, 0, 0, 523, 0, 0, 587, 0, 0, 523, 0, 0, 0, 0, 440, 0, 349, 0, 0, 440],
    harm: [0, 0, 330, 0, 0, 392, 0, 0, 0, 0, 262, 0, 247, 0, 0, 330, 0, 0, 349, 0, 0, 330, 0, 0, 0, 0, 294, 0, 220, 0, 0, 294],
    bass: [110, 0, 0, 0, 0, 0, 110, 0, 0, 82, 0, 0, 0, 0, 110, 0, 73, 0, 0, 0, 0, 0, 73, 0, 0, 110, 0, 0, 0, 0, 73, 0],
    rack: {
      voice: "pluck",
      level: 0.9,
      hold: 1.4,
      tone: 2000,
      detune: 8,
      bassTone: 240,
      bassHold: 1.6,
      swing: 0.18,
      echo: { steps: 3, feed: 0.26, wet: 0.24 },
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0],
      hat: [0, 0.24, 0.34, 0.2, 0, 0.26, 0.36, 0.22, 0, 0.24, 0.34, 0.2, 0, 0.28, 0.4, 0.24],
      clap: [0, 0, 0, 0, 0.72, 0, 0, 0, 0, 0, 0, 0, 0.74, 0, 0, 0.3],
    },
  },
};

/** The mode the run asked for, kept so Auto can answer again when the dial moves. */
let musicRun: string | null = null;
/** The bed on the air. Null when the radio is off. */
let musicBed: BedId | null = null;
/** The station the player tuned to, or null while the dial sits on Auto. */
let station: BedId | null = null;
let musicStep = 0;
let musicNext = 0;
let musicRaf = 0;
let musicPaused = false;
let musicTight = false;
let sirenId = 0;

export function setMusicTension(on: boolean) {
  // The well says "danger" every frame it is in danger, and a honk per frame is a drone, not a siren.
  if (on === musicTight && (!on || sirenId)) return;
  musicTight = on;
  if (sirenId) {
    clearInterval(sirenId);
    sirenId = 0;
  }
  if (!on || !bus || musicVol <= 0) return;
  const honk = () => {
    if (!musicTight || !bus) return;
    const t = bus.ctx.currentTime;
    hum(92, 0.32, t, 0.13, true);
    hum(124, 0.26, t + 0.16, 0.1, true);
  };
  honk();
  sirenId = window.setInterval(honk, 880);
}

function hum(freq: number, dur: number, when: number, vol = 0.22, bass = false) {
  if (!bus || musicVol <= 0 || freq <= 0) return;
  if (!bass && when < leadMute) return;
  const { ctx, music } = bus;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  if (bass) osc.type = "triangle";
  else osc.setPeriodicWave(musicBed === "classic" ? bus.pulse50 : bus.pulse25);
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  g.connect(music);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

/**
 * A modern bed's note. Two saws pulled apart, an electric-piano pair, or one
 * plucked triangle — each under a filter that closes as the note dies, which is
 * the difference between a pad and a faster square wave.
 */
function chord(
  freq: number,
  dur: number,
  when: number,
  vol: number,
  rack: Rack,
  wet: number,
  soft = false,
) {
  if (!bus || musicVol <= 0 || freq <= 0 || when < leadMute) return;
  const { ctx, music } = bus;
  const open = Math.min(11000, rack.tone * (musicTight ? 1.22 : 1) * (soft ? 0.7 : 1));
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = rack.voice === "pluck" ? 5 : 0.9;
  lp.frequency.setValueAtTime(open, when);
  lp.frequency.exponentialRampToValueAtTime(Math.max(220, open * 0.4), when + dur);
  const g = ctx.createGain();
  const attack = rack.voice === "pluck" ? 0.005 : Math.min(0.14, dur * 0.3);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  lp.connect(g);
  g.connect(music);
  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    g.connect(send);
    send.connect(bus.echo.delay);
  }
  const cents = rack.detune ?? 10;
  const parts: Array<[OscillatorType, number, number]> =
    rack.voice === "keys"
      ? [
          ["triangle", 0, 1],
          ["sine", 0, 0.5],
        ]
      : rack.voice === "pluck"
        ? [["triangle", 0, 1]]
        : [
            ["sawtooth", -cents, 1],
            ["sawtooth", cents, 1],
          ];
  parts.forEach(([type, off, mix], n) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    // The quiet half of the piano pair is an octave up; that is the tine, not a second note.
    osc.frequency.setValueAtTime(freq * (rack.voice === "keys" && n === 1 ? 2 : 1), when);
    osc.detune.setValueAtTime(off, when);
    if (mix < 1) {
      const trim = ctx.createGain();
      trim.gain.value = mix;
      osc.connect(trim);
      trim.connect(lp);
    } else {
      osc.connect(lp);
    }
    osc.start(when);
    osc.stop(when + dur + 0.05);
  });
}

/** The low end: one saw squeezed under a resonant filter, with a sine under it for weight. */
function bassNote(freq: number, dur: number, when: number, vol: number, cutoff: number) {
  if (!bus || musicVol <= 0 || freq <= 0) return;
  const { ctx, music } = bus;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 7;
  lp.frequency.setValueAtTime(cutoff, when);
  lp.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  lp.connect(g);
  g.connect(music);
  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.setValueAtTime(freq, when);
  saw.connect(lp);
  saw.start(when);
  saw.stop(when + dur + 0.04);
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(freq, when);
  subGain.gain.value = 0.6;
  sub.connect(subGain);
  subGain.connect(lp);
  sub.start(when);
  sub.stop(when + dur + 0.04);
}

/** A round kick: a pitch drop, no click. */
function drumKick(when: number, vol: number) {
  if (!bus || musicVol <= 0) return;
  const { ctx, music } = bus;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(138, when);
  osc.frequency.exponentialRampToValueAtTime(46, when + 0.1);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
  osc.connect(g);
  g.connect(music);
  osc.start(when);
  osc.stop(when + 0.2);
}

/** A hat: a sliver of the same noise the pad's cousins use, with the low end cut away. */
function drumHat(when: number, vol: number) {
  if (!bus || musicVol <= 0) return;
  const { ctx, music } = bus;
  const src = ctx.createBufferSource();
  src.buffer = bus.noiseShort;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7400;
  const g = ctx.createGain();
  const dur = 0.03 + vol * 0.06;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(music);
  // A different slice each time, so a bar of hats is not the same tick sixteen times.
  src.start(when, (musicStep * 0.041) % 0.5);
  src.stop(when + dur + 0.02);
}

/** The backbeat: filtered noise with a fast front and a short room on the tail. */
function drumClap(when: number, vol: number) {
  if (!bus || musicVol <= 0) return;
  const { ctx, music } = bus;
  const src = ctx.createBufferSource();
  src.buffer = bus.noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1750;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), when + 0.004);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.3), when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  src.connect(bp);
  bp.connect(g);
  g.connect(music);
  src.start(when, (musicStep * 0.037) % 0.4);
  src.stop(when + 0.18);
}

/** Read one step off a kit pattern. Short patterns loop under a longer bed. */
function hit(pattern: number[] | undefined, at: number): number {
  if (!pattern?.length) return 0;
  return pattern[at % pattern.length] ?? 0;
}

/** Point the shared delay at whatever is on the air, and shut it for the pulse beds. */
function tuneEcho(rack: Rack | undefined, step: number, now: number) {
  if (!bus) return;
  const { delay, feed } = bus.echo;
  if (!rack?.echo) {
    feed.gain.setTargetAtTime(0, now, 0.08);
    return;
  }
  const time = Math.max(0.02, Math.min(1.1, rack.echo.steps * step));
  if (Math.abs(delay.delayTime.value - time) > 0.002) {
    delay.delayTime.setTargetAtTime(time, now, 0.06);
  }
  feed.gain.setTargetAtTime(rack.echo.feed, now, 0.12);
}

function pumpPulse(spec: Bed, i: number, when: number, step: number) {
  const note = spec.lead[i] ?? 0;
  const lift = musicTight && note > 0 ? note * 1.122 : note;
  if (lift > 0) hum(lift, step * 1.7, when, musicTight ? 0.24 : 0.2, false);
  const h = spec.harm[i] ?? 0;
  if (h > 0 && when >= leadMute) {
    hum(musicTight ? h * 1.06 : h, step * 1.5, when, 0.1, false);
  }
  const b = spec.bass[i] ?? 0;
  if (b > 0) hum(b, step * 2.4, when, 0.16, true);
}

function pumpRack(spec: Bed, rack: Rack, i: number, when: number, step: number) {
  // The kick and the bass stay on the grid; everything on top of them can lean late.
  const late = rack.swing && i % 2 === 1 ? when + step * rack.swing : when;
  const wet = rack.echo?.wet ?? 0;
  const lvl = rack.level ?? 1;
  const note = spec.lead[i] ?? 0;
  if (note > 0) {
    const lift = musicTight ? note * 1.122 : note;
    chord(lift, step * rack.hold, late, lvl * (musicTight ? 0.11 : 0.095), rack, wet);
  }
  const h = spec.harm[i] ?? 0;
  if (h > 0) {
    chord(musicTight ? h * 1.06 : h, step * rack.hold * 1.5, late, lvl * 0.055, rack, wet * 0.5, true);
  }
  const b = spec.bass[i] ?? 0;
  if (b > 0) bassNote(b, step * (rack.bassHold ?? 0.9), when, lvl * 0.15, rack.bassTone ?? 340);
  // The kit carries these beds, so it sits up where a pulse bed's harmonics used to be.
  const k = hit(rack.kick, musicStep);
  if (k > 0) drumKick(when, lvl * 0.46 * k);
  const c = hit(rack.clap, musicStep);
  if (c > 0) drumClap(late, lvl * 0.22 * c);
  const t = hit(rack.hat, musicStep);
  if (t > 0) drumHat(late, lvl * 0.15 * t);
}

function pumpMusic() {
  musicRaf = 0;
  if (!bus || !musicBed || musicVol <= 0) return;
  const spec = BEDS[musicBed];
  const bpm = spec.bpm * (musicTight ? 1.32 : 1);
  const step = 60 / bpm / (spec.div ?? 2);
  const now = bus.ctx.currentTime;
  tuneEcho(spec.rack, step, now);
  if (musicNext < now - 0.2) musicNext = now;
  while (musicNext < now + 0.35) {
    const i = musicStep % spec.lead.length;
    if (spec.rack) pumpRack(spec, spec.rack, i, musicNext, step);
    else pumpPulse(spec, i, musicNext, step);
    musicNext += step;
    musicStep += 1;
  }
  musicRaf = requestAnimationFrame(pumpMusic);
}

function bedFor(mode: string): BedId {
  if (station) return station;
  return mode in BEDS ? (mode as BedId) : "marathon";
}

/**
 * Turn the dial. Auto hands the choice back to the mode; anything else holds
 * that bed for every run until the player says otherwise. A run already on the
 * air swaps over on the spot, so the pick is something you hear, not something
 * you take on faith.
 */
export function setStation(id: StationId) {
  const next = id === "auto" ? null : id;
  if (next === station) return;
  station = next;
  if (!musicRun) return;
  musicBed = bedFor(musicRun);
  musicStep = 0;
  musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
  if (musicVol > 0 && !musicRaf) musicRaf = requestAnimationFrame(pumpMusic);
}

export function startMusic(mode: string) {
  unlockAudio();
  musicRun = mode;
  musicBed = bedFor(mode);
  musicStep = 0;
  musicPaused = false;
  musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
  if (!musicRaf) musicRaf = requestAnimationFrame(pumpMusic);
}

export function stopMusic() {
  musicRun = null;
  musicBed = null;
  musicPaused = false;
  musicTight = false;
  if (sirenId) {
    clearInterval(sirenId);
    sirenId = 0;
  }
  if (musicRaf) cancelAnimationFrame(musicRaf);
  musicRaf = 0;
}

export function setMusicPaused(next: boolean) {
  musicPaused = next;
  applyGains();
  if (!next && musicBed && musicVol > 0 && !musicRaf) {
    musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
    musicRaf = requestAnimationFrame(pumpMusic);
  }
}
