/**
 * Synthesized game sounds (issue 0026). No asset files: every cue is generated
 * with the Web Audio API, mixed to a fixed level under one master gain, in a small
 * chiptune palette. One self-contained module — animations/sounds share the event
 * stream but the actual synthesis lives here.
 *
 * Browser autoplay policy creates the context suspended; we resume it on the first
 * user gesture (a once-listener, so the existing join/start click unlocks it with
 * no separate prompt). A single mute toggle, persisted in localStorage, gates all
 * playback.
 */

import type { SoundCue } from '@catan/shared';

const MUTE_KEY = 'catan.muted';
/** Master level — keeps the synth cues from being harsh. */
const MASTER_GAIN = 0.25;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
}

/**
 * Create/resume the AudioContext. Must run inside a user gesture the first time
 * (browser autoplay policy); the once-listener below guarantees that.
 */
export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

// Unlock on the first interaction anywhere — the join/start click qualifies, so
// there is never a separate "enable sound" prompt.
if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

/** Play a cue, unless muted or the context never unlocked. */
export function playCue(cue: SoundCue): void {
  if (muted || !ctx || !master || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  switch (cue) {
    case 'dice':
      // A short rattle: two quick filtered noise bursts.
      burst(t, 0.05, 2600, 0.5);
      burst(t + 0.06, 0.06, 2000, 0.5);
      break;
    case 'build':
      // A wood thunk: a low triangle blip with a fast decay.
      tone(t, { type: 'triangle', freq: 196, dur: 0.16, gain: 0.7, slideTo: 110 });
      break;
    case 'robber':
      // A low menacing thud.
      tone(t, { type: 'sine', freq: 90, dur: 0.3, gain: 0.9, slideTo: 55 });
      break;
    case 'steal':
      // A quick swipe — noise sweeping down.
      burst(t, 0.18, 1400, 0.55, 'highpass');
      break;
    case 'deal':
      // A soft card flick.
      burst(t, 0.05, 5000, 0.3, 'highpass');
      break;
    case 'dev':
      // A flip/whoosh — a fast upward sweep.
      tone(t, { type: 'sawtooth', freq: 300, dur: 0.18, gain: 0.4, slideTo: 900 });
      break;
    case 'yourTurn':
      // A friendly two-note "your move" cue.
      tone(t, { type: 'square', freq: 523, dur: 0.12, gain: 0.4 });
      tone(t + 0.12, { type: 'square', freq: 784, dur: 0.16, gain: 0.4 });
      break;
    case 'win': {
      // A short ascending fanfare: C–E–G–C.
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => tone(t + i * 0.13, { type: 'square', freq: f, dur: 0.2, gain: 0.5 }));
      break;
    }
  }
}

/** A single oscillator note with an attack/decay envelope. */
function tone(
  start: number,
  opts: { type: OscillatorType; freq: number; dur: number; gain: number; slideTo?: number },
): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, start + opts.dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(opts.gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + opts.dur + 0.02);
}

/** A short filtered white-noise burst (clicks, rattles, swipes). */
function burst(
  start: number,
  dur: number,
  filterFreq: number,
  gain: number,
  filterType: BiquadFilterType = 'bandpass',
): void {
  if (!ctx || !master) return;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(env).connect(master);
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** One second of white noise, reused for every burst. */
function getNoiseBuffer(): AudioBuffer {
  if (noiseBuffer || !ctx) return noiseBuffer as AudioBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}
