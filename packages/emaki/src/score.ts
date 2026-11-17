// The film's sound, played by the page itself (WebAudio), so it follows the film's actual timing: live in the show
// and the article figures, and offline (OfflineAudioContext) for the video render.
// A film's score.js calls a small score API (S.program / note / chord / fx / ticks / master) with times from T
// (each scene's running start); this collects those calls into events and synthesises them with a few instruments.
// House style: action tones only (a soft note for each thing that happens on screen), no background bed.

export interface Program { inst: string; gain: number; rev: number; pan: number; bright: number }
export type Ev =
  | { kind: 'note'; track: string; midi: number; t: number; dur: number; vel: number }
  | { kind: 'fx'; name: string; t: number; dur: number; vel: number; pitch?: number };
export interface Score { programs: Record<string, Program>; events: Ev[]; master: { gain: number; fadeOut: number } }

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(n: string | number): number {
  if (typeof n === 'number') return n;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n.trim());
  if (!m) return 69;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const db = (g: number) => 10 ** (g / 20);
/** Level that brings these soft scores (velocities 20–50) to about −18 LUFS. */
const MAKEUP = 15;

/** Peak level of each voice. The action tones (bells, marimba, plucks) sit well above the pad bed. */
export const VOICE_LEVEL: Record<string, number> = { pad: 0.12, bell: 0.6, vibes: 0.6, marimba: 0.62, pluck: 0.52, ep: 0.42, bass: 0.5 };

/** Instruments left out everywhere: the sustained background bed. Remove 'pad' to bring a bed back. */
export const MUTED_INSTRUMENTS = ['pad'];

/** Runs a score.js against `T` (scene id → start time, s) and records what it asks for. */
export function collectScore(code: string, T: Record<string, number>): Score {
  const programs: Record<string, Program> = {}, events: Ev[] = [], master = { gain: -6, fadeOut: 1.5 };
  let bpm = 120, t0 = 0;
  const at = (o: { t?: number; beat?: number }) => (o.t ?? t0 + (o.beat ?? 0) * (60 / bpm));
  const len = (o: { dur?: number; beats?: number }, d: number) => o.dur ?? (o.beats != null ? o.beats * (60 / bpm) : d);
  const S = {
    tempo: (b: number, o: { t0?: number } = {}) => { bpm = b; t0 = o.t0 ?? 0; },
    program: (track: string, inst: string, o: Partial<Program> = {}) => {
      programs[track] = { inst, gain: o.gain ?? 0, rev: o.rev ?? 0.3, pan: o.pan ?? 0, bright: o.bright ?? 0.5 };
    },
    note: (track: string, n: string | number, o: { t?: number; beat?: number; dur?: number; beats?: number; vel?: number } = {}) =>
      events.push({ kind: 'note', track, midi: midi(n), t: at(o), dur: len(o, 0.8), vel: o.vel ?? 60 }),
    chord: (track: string, ns: (string | number)[], o: { t?: number; beat?: number; dur?: number; beats?: number; vel?: number } = {}) =>
      ns.forEach((n) => S.note(track, n, o)),
    fx: (name: string, t: number, o: { dur?: number; vel?: number; pitch?: number } = {}) =>
      events.push({ kind: 'fx', name, t, dur: o.dur ?? 0.5, vel: o.vel ?? 50, pitch: o.pitch }),
    ticks: (ts: number[], o: { vel?: number } = {}) => ts.forEach((t) => S.fx('tick', t, o)),
    master: (o: { gain?: number; fadeOut?: number }) => Object.assign(master, o),
    // Pattern helpers from other score dialects are accepted and ignored.
    pattern: () => {}, drums: () => {}, drum: () => {},
  };
  const kit = { score: (fn: (s: typeof S, T: Record<string, number>) => void) => fn(S, T) };
  new Function('kit', code)(kit);
  const muted = new Set(Object.entries(programs).filter(([, p]) => MUTED_INSTRUMENTS.includes(p.inst)).map(([track]) => track));
  const kept = events.filter((e) => !(e.kind === 'note' && muted.has(e.track)));
  kept.sort((a, b) => a.t - b.t);
  return { programs, events: kept, master };
}

// ── Synthesis ──────────────────────────────────────────────────────────────────────────────────────

function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const r = rng(7); b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}
function impulse(ctx: BaseAudioContext, secs = 2.6) {
  const r = rng(11), n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * (1 - i / n) ** 3; }
  return b;
}

/** An oscillator's waveform and pitch (Hz), detuned in cents. */
interface Wave { type: OscillatorType; f: number; detune?: number }
/** An amplitude envelope: rises over `attack` s to `peak`, then falls away over about `decay` s; with `sustain`
 *  (a fraction of the peak) it settles there instead, holds `hold` s past the attack, then releases over `release` s. */
interface Envelope { attack: number; peak: number; decay: number; sustain?: number; release?: number; hold?: number }

/** A mixer for one playback: tracks feed a dry bus and a shared reverb; everything ends at `out`. */
class Mix {
  out: GainNode; rev: ConvolverNode; nodes: AudioScheduledSourceNode[] = [];
  constructor(public ctx: BaseAudioContext, dest: AudioNode, gainDb: number) {
    // Master: level, then a gentle compressor so the effects and stacked chords never clip.
    this.out = ctx.createGain(); this.out.gain.value = db(gainDb + MAKEUP);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
    this.out.connect(comp).connect(dest);
    this.rev = ctx.createConvolver(); this.rev.buffer = impulse(ctx);
    const rg = ctx.createGain(); rg.gain.value = 0.55; this.rev.connect(rg).connect(this.out);
  }
  /** An input with level, pan and reverb send. */
  input(p: { gain: number; pan: number; rev: number }) {
    const g = this.ctx.createGain(); g.gain.value = db(p.gain);
    const pan = this.ctx.createStereoPanner(); pan.pan.value = p.pan;
    g.connect(pan).connect(this.out);
    const s = this.ctx.createGain(); s.gain.value = p.rev; g.connect(s).connect(this.rev);
    return g;
  }
  /** An oscillator of `wave` into `to`, sounding from `at` to `end`. */
  osc(to: AudioNode, wave: Wave, at: number, end: number) {
    const o = this.ctx.createOscillator(); o.type = wave.type; o.frequency.value = wave.f; o.detune.value = wave.detune ?? 0;
    o.connect(to); o.start(at); o.stop(end); this.nodes.push(o); return o;
  }
  /** A gain into `to` shaped by `e` from `at`: attack to the peak, then a decay to 0 or, with sustain, a held level
   *  released after `hold`. */
  env(to: AudioNode, at: number, e: Envelope) {
    const { attack: a, peak, decay, sustain = 0, release: rel = 0.05, hold = 0 } = e;
    const g = this.ctx.createGain(), p = g.gain;
    p.setValueAtTime(0, at); p.linearRampToValueAtTime(peak, at + a);
    if (sustain > 0) { p.setTargetAtTime(peak * sustain, at + a, decay / 3); p.setValueAtTime(peak * sustain, at + a + hold); p.setTargetAtTime(0, at + a + hold, rel / 3); }
    else p.setTargetAtTime(0, at + a, decay / 4);
    g.connect(to); return g;
  }
  noise(at: number, dur: number, to: AudioNode) {
    const s = this.ctx.createBufferSource(); s.buffer = noise(this.ctx); s.connect(to);
    s.start(at, (at * 7.3) % 1.5, dur); this.nodes.push(s); return s;
  }
}

/** One note to voice: the mix, its program, frequency, velocity (0 … 1, shaped), start, length and input. */
interface Strike { m: Mix; p: Program; f: number; v: number; at: number; dur: number; input: AudioNode }

/** A vibraphone/bell: a long sine with a fourth-harmonic shimmer and a slow tremolo. */
function bell({ m, f, v, at, dur, input }: Strike) {
  const g = m.env(input, at, { attack: 0.004, peak: v * VOICE_LEVEL.bell, decay: Math.max(1.2, dur + 0.8) });
  const end = at + dur + 2.5;
  m.osc(g, { type: 'sine', f }, at, end);
  const h = m.env(input, at, { attack: 0.002, peak: v * 0.12, decay: 0.5 }); m.osc(h, { type: 'sine', f: f * 4 }, at, end);
  const trem = m.ctx.createOscillator(); trem.frequency.value = 5.2; const tg = m.ctx.createGain(); tg.gain.value = v * 0.06;
  trem.connect(tg).connect(g.gain); trem.start(at); trem.stop(end); m.nodes.push(trem);
}

/** Each instrument's voice. Anything not named here plays as the bass. */
const INSTRUMENTS: Record<string, (s: Strike) => void> = {
  pad: ({ m, p, f, v, at, dur, input }) => {
    const lp = m.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + p.bright * 1800; lp.Q.value = 0.3;
    const g = m.env(input, at, { attack: 0.9, peak: v * VOICE_LEVEL.pad, decay: 1, sustain: 1, release: 1.4, hold: Math.max(0.1, dur - 0.9) }); lp.connect(g);
    const end = at + dur + 2;
    m.osc(lp, { type: 'sawtooth', f, detune: -7 }, at, end); m.osc(lp, { type: 'sawtooth', f, detune: 7 }, at, end); m.osc(lp, { type: 'triangle', f: f / 2 }, at, end);
  },
  vibes: bell,
  bell,
  marimba: ({ m, f, v, at, input }) => {
    const g = m.env(input, at, { attack: 0.003, peak: v * VOICE_LEVEL.marimba, decay: 0.55 }); const end = at + 1.2;
    m.osc(g, { type: 'sine', f }, at, end);
    const h = m.env(input, at, { attack: 0.002, peak: v * 0.2, decay: 0.09 }); m.osc(h, { type: 'sine', f: f * 4 }, at, end);
  },
  pluck: ({ m, f, v, at, input }) => {
    const lp = m.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, at); lp.frequency.setTargetAtTime(700, at, 0.12);
    const g = m.env(input, at, { attack: 0.003, peak: v * VOICE_LEVEL.pluck, decay: 0.45 }); lp.connect(g);
    m.osc(lp, { type: 'triangle', f }, at, at + 1); m.osc(lp, { type: 'sawtooth', f, detune: 4 }, at, at + 1);
  },
  ep: ({ m, f, v, at, dur, input }) => {
    const g = m.env(input, at, { attack: 0.006, peak: v * VOICE_LEVEL.ep, decay: Math.max(1.4, dur + 0.6) }); const end = at + dur + 2;
    const car = m.osc(g, { type: 'sine', f }, at, end);
    const mod = m.ctx.createOscillator(); mod.frequency.value = f; const mi = m.ctx.createGain();
    mi.gain.setValueAtTime(f * 1.2, at); mi.gain.setTargetAtTime(f * 0.1, at, 0.25);
    mod.connect(mi).connect(car.frequency); mod.start(at); mod.stop(end); m.nodes.push(mod);
  },
};

/** Bass and anything else: a round sine. */
function bass({ m, f, v, at, dur, input }: Strike) {
  const g = m.env(input, at, { attack: 0.01, peak: v * VOICE_LEVEL.bass, decay: Math.max(0.6, dur) }); m.osc(g, { type: 'sine', f }, at, at + dur + 1); m.osc(g, { type: 'triangle', f }, at, at + dur + 1);
}

function playNote(m: Mix, p: Program, e: Extract<Ev, { kind: 'note' }>, at: number, input: AudioNode) {
  const voice = Object.hasOwn(INSTRUMENTS, p.inst) ? INSTRUMENTS[p.inst] : bass;
  voice({ m, p, f: hz(e.midi), v: (e.vel / 127) ** 0.9, at, dur: e.dur, input });
}

/** One effect to sound: the mix, the event, its start and input, and its shaped velocity. */
interface Hit { m: Mix; e: Extract<Ev, { kind: 'fx' }>; at: number; input: AudioNode; v: number }

function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7) {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
}
const VIBES: Program = { inst: 'vibes', gain: 0, rev: 0.5, pan: 0, bright: 0.5 };
/** A vibes note of `mi` at `t` (the pitched effects are made of these). */
const ring = ({ m, input }: Hit, mi: number, t: number, vel: number) =>
  playNote(m, VIBES, { kind: 'note', track: 'fx', midi: mi, t: 0, dur: 1, vel }, t, input);
/** A noise sweep through a band-pass rising from 300 Hz to `top` over the effect, swelling and fading. */
function sweep({ m, e, at, input, v }: Hit, top: number) {
  const bp = filter(m.ctx, 'bandpass', 300, 1.2); bp.frequency.setValueAtTime(300, at); bp.frequency.exponentialRampToValueAtTime(top, at + e.dur);
  const g = m.ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v * 0.35, at + e.dur * 0.6); g.gain.linearRampToValueAtTime(0, at + e.dur);
  bp.connect(g).connect(input); m.noise(at, e.dur + 0.05, bp);
}

/** Each effect's sound. Anything not named here is a short sine blip. */
const EFFECTS: Record<string, (h: Hit) => void> = {
  click: ({ m, at, input, v }) => { const g = m.env(input, at, { attack: 0.001, peak: v * 0.5, decay: 0.025 }); const hp = filter(m.ctx, 'highpass', 2400); hp.connect(g); m.noise(at, 0.05, hp); },
  tick: ({ m, at, input, v }) => { const g = m.env(input, at, { attack: 0.001, peak: v * 0.3, decay: 0.04 }); m.osc(g, { type: 'sine', f: 2100 }, at, at + 0.1); },
  thud: ({ m, at, input, v }) => { const g = m.env(input, at, { attack: 0.004, peak: v * 0.9, decay: 0.3 }); const o = m.osc(g, { type: 'sine', f: 95 }, at, at + 0.6); o.frequency.setTargetAtTime(48, at, 0.08); },
  pop: ({ m, at, input, v }) => { const g = m.env(input, at, { attack: 0.002, peak: v * 0.45, decay: 0.07 }); const o = m.osc(g, { type: 'sine', f: 420 }, at, at + 0.2); o.frequency.setTargetAtTime(980, at, 0.02); },
  whoosh: (h) => sweep(h, 2400),
  revswell: (h) => sweep(h, 5000),
  roll: ({ m, e, at, input }) => { for (let k = 0; k * 0.06 < e.dur; k++) playFx(m, { ...e, name: 'tick', vel: e.vel * 0.7 }, at + k * 0.06, input); },
  ding: (h) => ring(h, h.e.pitch ?? 84, h.at, h.e.vel),
  chime: (h) => [0, 4, 7].forEach((d, i) => ring(h, (h.e.pitch ?? 79) + d, h.at + i * 0.09, h.e.vel * 0.8)),
  sparkle: (h) => [0, 4, 7, 12, 16].forEach((d, i) => ring(h, (h.e.pitch ?? 84) + d, h.at + i * 0.05, h.e.vel * 0.55)),
};
const blip = ({ m, at, input, v }: Hit) => { const g = m.env(input, at, { attack: 0.001, peak: v * 0.3, decay: 0.05 }); m.osc(g, { type: 'sine', f: 1500 }, at, at + 0.1); };

function playFx(m: Mix, e: Extract<Ev, { kind: 'fx' }>, at: number, input: AudioNode) {
  const sound = Object.hasOwn(EFFECTS, e.name) ? EFFECTS[e.name] : blip;
  sound({ m, e, at, input, v: (e.vel / 127) ** 0.9 });
}

/**
 * Schedules the score's events from film time `from` to `to` on `ctx`, so film time `from` sounds at context time `at`.
 * `end` is the film's length (for the master fade). Returns a handle that stops it.
 */
export function play(ctx: BaseAudioContext, dest: AudioNode, score: Score, from: number, to: number, at: number, end: number) {
  const m = new Mix(ctx, dest, score.master.gain);
  const fadeAt = end - score.master.fadeOut;
  if (to > fadeAt && score.master.fadeOut > 0) {
    const fa = at + Math.max(0, fadeAt - from), p = m.out.gain;
    p.setValueAtTime(db(score.master.gain + MAKEUP), fa); p.linearRampToValueAtTime(0.0001, at + (end - from) + 0.6);
  }
  const inputs: Record<string, AudioNode> = {};
  const inputOf = (track: string) => (inputs[track] ??= m.input(score.programs[track] ?? { gain: 0, pan: 0, rev: 0.3 }));
  for (const e of score.events) {
    if (e.t >= to) break;
    // Notes already sounding at `from` (a pad chord) start with what is left of them; anything else before `from` is skipped.
    if (e.t < from && !(e.kind === 'note' && e.t + e.dur > from + 0.2)) continue;
    const when = at + Math.max(0, e.t - from);
    if (e.kind === 'note') {
      const left = e.t < from ? { ...e, dur: e.t + e.dur - from } : e;
      playNote(m, score.programs[e.track] ?? { inst: 'vibes', gain: 0, pan: 0, rev: 0.3, bright: 0.5 }, left, when, inputOf(e.track));
    } else playFx(m, e, when, inputOf('__fx'));
  }
  return { stop: () => { const t = ctx.currentTime; m.out.gain.cancelScheduledValues(t); m.out.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => m.out.disconnect(), 400); } };
}

/** The whole score rendered offline, as a 16-bit stereo WAV (bytes). */
export async function renderWav(score: Score, duration: number, sampleRate = 48000): Promise<Uint8Array> {
  const ctx = new OfflineAudioContext(2, Math.ceil((duration + 0.2) * sampleRate), sampleRate);
  play(ctx, ctx.destination, score, 0, duration, 0, duration);
  const buf = await ctx.startRendering();
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, 2, true); out.setUint32(24, sampleRate, true); out.setUint32(28, sampleRate * 4, true); out.setUint16(32, 4, true);
  out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return new Uint8Array(out.buffer);
}
