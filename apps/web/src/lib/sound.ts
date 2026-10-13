/**
 * Tiny synthesized sound kit (WebAudio) — no audio assets required.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseBurst(duration: number, freq: number, gain: number, q = 1) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

function tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + duration + 0.05);
}

export const sfx = {
  deal: () => noiseBurst(0.08, 3200, 0.35, 0.8),
  flip: () => noiseBurst(0.06, 2400, 0.3, 1.2),
  chips: () => {
    for (let i = 0; i < 3; i++) setTimeout(() => noiseBurst(0.04, 5200 + i * 400, 0.25, 6), i * 45);
  },
  check: () => {
    noiseBurst(0.05, 900, 0.5, 2);
    setTimeout(() => noiseBurst(0.05, 900, 0.4, 2), 110);
  },
  fold: () => noiseBurst(0.18, 1500, 0.25, 0.6),
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.35, 0.09, 'triangle', i * 0.08));
  },
  lose: () => {
    [392, 311.13].forEach((f, i) => tone(f, 0.4, 0.07, 'sine', i * 0.12));
  },
  turn: () => tone(880, 0.12, 0.05, 'sine'),
};
