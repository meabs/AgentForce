/**
 * FLEET AUDIO: every sound here is synthesized live with WebAudio (no samples, no assets),
 * and the "voice lines" use the browser's own SpeechSynthesis engine.
 *
 * Browsers only allow audio after a user gesture, so the context is created lazily and
 * resumed on the first pointer / key press. Mute state persists in localStorage.
 */
import { useSyncExternalStore } from 'react';

const STORE_KEY = 'afc.sound';
type Listener = () => void;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fxBus: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<Listener>();
const lastPlayed: Record<string, number> = {};

function readMuted() {
  try {
    return localStorage.getItem(STORE_KEY) === 'off';
  } catch {
    return false;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(STORE_KEY, m ? 'off' : 'on');
  } catch {
    /* private mode: keep it in memory */
  }
  if (m) {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  } else {
    unlock();
    window.setTimeout(() => sfx.ack(), 30);
  }
  emit();
}

export function toggleMuted() {
  setMuted(!muted);
}

export function useMuted() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted,
    () => muted,
  );
}

/** True once the AudioContext is running (a user gesture happened). */
export function audioUnlocked() {
  return !!ctx && ctx.state === 'running';
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ctx.destination);
    // A short feedback delay gives everything a "big bridge" space feel.
    fxBus = ctx.createGain();
    fxBus.gain.value = 0.22;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    fxBus.connect(delay).connect(tone).connect(fb).connect(delay);
    tone.connect(master);
  }
  return ctx;
}

/** Start audio inside a user gesture. This is deliberately best-effort on iOS. */
export function unlock(): Promise<void> {
  const c = ensure();
  if (!c || c.state !== 'suspended') return Promise.resolve();
  return c.resume().catch(() => {
    // The replay remains usable when Safari rejects an audio resume.
  });
}

if (typeof window !== 'undefined') {
  const once = () => unlock();
  window.addEventListener('pointerdown', once, { capture: true });
  window.addEventListener('keydown', once, { capture: true });
}

/** Rate limit per sound so bursts of events don't machine-gun the speakers. */
function gate(name: string, ms: number) {
  const now = performance.now();
  if (now - (lastPlayed[name] ?? -1e9) < ms) return false;
  lastPlayed[name] = now;
  return true;
}

function ready(name: string, gapMs: number) {
  if (muted) return null;
  const c = ensure();
  if (!c || !master) return null;
  if (c.state !== 'running') return null;
  if (!gate(name, gapMs)) return null;
  return c;
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  to?: number;
  at?: number;
  dur: number;
  vol?: number;
  attack?: number;
  detune?: number;
  filter?: number;
  wet?: boolean;
}

function tone(c: AudioContext, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  const vol = o.vol ?? 0.2;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master!);
  if (o.wet !== false && fxBus) g.connect(fxBus);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

function noise(c: AudioContext, o: { at?: number; dur: number; vol?: number; from: number; to: number; q?: number }) {
  const t0 = c.currentTime + (o.at ?? 0);
  const len = Math.ceil(c.sampleRate * o.dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = o.q ?? 3;
  bp.frequency.setValueAtTime(o.from, t0);
  bp.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.15, t0 + o.dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(bp).connect(g).connect(master!);
  if (fxBus) g.connect(fxBus);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export const sfx = {
  /** Unit selected: a crisp two-pip blip. */
  select() {
    const c = ready('select', 60);
    if (!c) return;
    tone(c, { type: 'square', freq: 1320, dur: 0.05, vol: 0.06, filter: 4000, wet: false });
    tone(c, { type: 'square', freq: 1980, at: 0.055, dur: 0.07, vol: 0.05, filter: 5000 });
  },
  /** Soft UI tick for hovers / minor toggles. */
  tick() {
    const c = ready('tick', 40);
    if (!c) return;
    tone(c, { type: 'triangle', freq: 2600, dur: 0.025, vol: 0.03, wet: false });
  },
  /** Command acknowledged: rising three-note chirp. */
  ack() {
    const c = ready('ack', 90);
    if (!c) return;
    [72, 76, 79].forEach((n, i) =>
      tone(c, { type: 'square', freq: NOTE(n), at: i * 0.06, dur: 0.09, vol: 0.07, filter: 3200 }),
    );
  },
  /** HOLD: two descending pips. */
  hold() {
    const c = ready('hold', 90);
    if (!c) return;
    tone(c, { type: 'square', freq: NOTE(76), dur: 0.08, vol: 0.06, filter: 2400 });
    tone(c, { type: 'square', freq: NOTE(69), at: 0.09, dur: 0.12, vol: 0.06, filter: 2000 });
  },
  /** RETREAT: falling sweep. */
  retreat() {
    const c = ready('retreat', 150);
    if (!c) return;
    tone(c, { type: 'sawtooth', freq: 880, to: 180, dur: 0.45, vol: 0.07, filter: 1800 });
  },
  /** Unit warps in: noise whoosh + rising sine + sparkle. */
  warp() {
    const c = ready('warp', 200);
    if (!c) return;
    noise(c, { dur: 0.7, vol: 0.18, from: 300, to: 5000, q: 2 });
    tone(c, { type: 'sine', freq: 160, to: 1400, dur: 0.6, vol: 0.12 });
    tone(c, { type: 'triangle', freq: NOTE(91), at: 0.55, dur: 0.25, vol: 0.05 });
    tone(c, { type: 'triangle', freq: NOTE(96), at: 0.62, dur: 0.3, vol: 0.04 });
  },
  /** Agent finished: a short original brass-ish fanfare (detuned saws through a lowpass). */
  fanfare() {
    const c = ready('fanfare', 900);
    if (!c) return;
    const seq: Array<[number, number, number]> = [
      [67, 0, 0.14],
      [72, 0.14, 0.14],
      [76, 0.28, 0.14],
      [79, 0.42, 0.5],
    ];
    for (const [n, at, dur] of seq) {
      for (const d of [-7, 7]) tone(c, { type: 'sawtooth', freq: NOTE(n), at, dur, vol: 0.05, detune: d, filter: 2600, attack: 0.02 });
    }
    for (const n of [72, 76, 79, 84])
      tone(c, { type: 'sawtooth', freq: NOTE(n), at: 0.95, dur: 1.1, vol: 0.035, filter: 2200, attack: 0.06 });
    tone(c, { type: 'sine', freq: NOTE(48), at: 0.95, dur: 1.2, vol: 0.12, attack: 0.04 });
  },
  /** Error / blocked: alternating two-tone klaxon. */
  klaxon() {
    const c = ready('klaxon', 2500);
    if (!c) return;
    for (let i = 0; i < 4; i++) {
      tone(c, { type: 'square', freq: 520, to: 640, at: i * 0.32, dur: 0.16, vol: 0.06, filter: 1500 });
      tone(c, { type: 'square', freq: 400, at: i * 0.32 + 0.16, dur: 0.16, vol: 0.06, filter: 1300 });
    }
    tone(c, { type: 'sine', freq: 70, dur: 1.3, vol: 0.12, attack: 0.05 });
  },
  /** A failed order: short buzz. */
  error() {
    const c = ready('error', 300);
    if (!c) return;
    tone(c, { type: 'sawtooth', freq: 140, dur: 0.22, vol: 0.09, filter: 900 });
    tone(c, { type: 'sawtooth', freq: 147, dur: 0.22, vol: 0.07, filter: 900 });
  },
  /** Territory tile revealed: tiny glassy ping, heavily rate limited. */
  reveal() {
    const c = ready('reveal', 650);
    if (!c) return;
    const n = [84, 86, 88, 91, 93][Math.floor(Math.random() * 5)];
    tone(c, { type: 'sine', freq: NOTE(n), dur: 0.18, vol: 0.025 });
  },
  /** Boot / title swell for the demo. */
  boot() {
    const c = ready('boot', 1500);
    if (!c) return;
    for (const [n, d] of [
      [36, 0],
      [43, 4],
      [48, -4],
    ] as const)
      tone(c, { type: 'sawtooth', freq: NOTE(n), dur: 2.6, vol: 0.05, detune: d, filter: 700, attack: 0.9 });
    noise(c, { dur: 2.2, vol: 0.06, from: 200, to: 2400, q: 1 });
    tone(c, { type: 'triangle', freq: NOTE(84), at: 1.6, dur: 0.8, vol: 0.04 });
  },
  /** Radio squelch played before a voice line. */
  squelch() {
    const c = ready('squelch', 120);
    if (!c) return;
    noise(c, { dur: 0.12, vol: 0.08, from: 1800, to: 2600, q: 4 });
    tone(c, { type: 'square', freq: 1700, dur: 0.04, vol: 0.03, wet: false });
  },
};

// ---------------------------------------------------------------- voice

let voicePick: SpeechSynthesisVoice | null | undefined;
function pickVoice(): SpeechSynthesisVoice | null {
  if (voicePick !== undefined) return voicePick;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null; // not loaded yet, try again next time
  const pref = [/Google UK English Male/i, /Daniel/i, /Microsoft (George|Ryan|Guy)/i, /en-GB/i, /en[-_]/i];
  voicePick = null;
  for (const re of pref) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) {
      voicePick = v;
      break;
    }
  }
  return voicePick;
}

let lastVoiceAt = 0;
let voiceWatchdog: number | undefined;

/**
 * Short robotic voice line. Low pitch + clipped rate reads as "ship computer".
 * Lines are dropped (not queued) when another one played very recently, unless `force`.
 */
export function say(text: string, opts: { force?: boolean; rate?: number; pitch?: number } = {}) {
  if (muted) return;
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  const now = performance.now();
  if (!opts.force && now - lastVoiceAt < 1400) return;
  lastVoiceAt = now;
  try {
    if (opts.force) synth.cancel();
    sfx.squelch();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.pitch = opts.pitch ?? 0.35;
    u.rate = opts.rate ?? 1.02;
    u.volume = 0.9;
    u.onend = () => {
      if (voiceWatchdog) window.clearTimeout(voiceWatchdog);
      voiceWatchdog = undefined;
    };
    synth.speak(u);
    // Safari can leave an utterance in "speaking" forever. Nothing waits for
    // speech, but clearing it keeps later cues from becoming a stuck queue.
    if (voiceWatchdog) window.clearTimeout(voiceWatchdog);
    voiceWatchdog = window.setTimeout(() => {
      try {
        synth.cancel();
      } catch {
        /* speech engine unavailable */
      }
    }, 8_000);
  } catch {
    /* speech engine unavailable (headless, locked down): stay silent */
  }
}

/** Canonical voice lines, kept original and short. */
export const VOICE = {
  ready: 'Unit ready.',
  orders: 'Orders received.',
  complete: 'Mission complete.',
  alert: 'Alert. Unit requires attention.',
  approved: 'Plan approved. Proceeding.',
  holding: 'Holding position.',
  retreat: 'Falling back.',
  online: 'Fleet command online.',
  allHome: 'All units returning to base.',
};

/** "VECTOR-2" -> "Vector 2" so speech engines don't spell callsigns letter by letter. */
export function spoken(callsign: string) {
  return callsign
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
