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
  if (musicVol > 0 && musicMode && !musicRaf) {
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
  duckMusic(0.48, 0.22);
  pulse(311, 0.06, 0, 25, 0.28);
  pulse(392, 0.07, 0.05, 25, 0.3);
  pulse(523, 0.12, 0.1, 12, 0.24);
  noiseBurst(0.08, 0.02, 0.12, 1800, 0.7, true);
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

type Bed = { bpm: number; lead: number[]; harm: number[]; bass: number[] };

const BEDS: Record<string, Bed> = {
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
};

let musicMode: string | null = null;
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
  else osc.setPeriodicWave(musicMode === "classic" ? bus.pulse50 : bus.pulse25);
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  g.connect(music);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function pumpMusic() {
  musicRaf = 0;
  if (!bus || !musicMode || musicVol <= 0) return;
  const spec = BEDS[musicMode] ?? BEDS.marathon!;
  const bpm = spec.bpm * (musicTight ? 1.32 : 1);
  const step = 60 / bpm / 2;
  const now = bus.ctx.currentTime;
  if (musicNext < now - 0.2) musicNext = now;
  while (musicNext < now + 0.35) {
    const i = musicStep % spec.lead.length;
    const note = spec.lead[i] ?? 0;
    const lift = musicTight && note > 0 ? note * 1.122 : note;
    if (lift > 0) hum(lift, step * 1.7, musicNext, musicTight ? 0.24 : 0.2, false);
    const h = spec.harm[i] ?? 0;
    if (h > 0 && musicNext >= leadMute) {
      hum(musicTight ? h * 1.06 : h, step * 1.5, musicNext, 0.1, false);
    }
    const b = spec.bass[i] ?? 0;
    if (b > 0) hum(b, step * 2.4, musicNext, 0.16, true);
    musicNext += step;
    musicStep += 1;
  }
  musicRaf = requestAnimationFrame(pumpMusic);
}

export function startMusic(mode: string) {
  unlockAudio();
  musicMode = mode;
  musicStep = 0;
  musicPaused = false;
  musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
  if (!musicRaf) musicRaf = requestAnimationFrame(pumpMusic);
}

export function stopMusic() {
  musicMode = null;
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
  if (!next && musicMode && musicVol > 0 && !musicRaf) {
    musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
    musicRaf = requestAnimationFrame(pumpMusic);
  }
}
