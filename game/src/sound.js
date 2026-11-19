// Synthesized sound for NEON BAY: every effect is an oscillator or a burst
// of filtered noise, and the music is a looped synthwave bassline scheduled
// ahead of time — no audio files, so the game stays offline. The audio
// context starts on the first user gesture, as browsers require, and
// everything is guarded so a missing audio device never breaks the game.
import { MUTE_KEY } from './config.js';

const MUSIC_BPM = 96;
const BEAT = 60 / MUSIC_BPM;
/** A minor-key bassline, one note per beat, looped (Hz). */
const BASSLINE = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
/** A sparse pad chord, one per bar (Hz). */
const PAD = [110, 130.81, 164.81];

export function createSound() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let beatIndex = 0;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, at, dur, type, gain, slideTo) {
    const ac = ctx;
    if (!ac || muted) return;
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime + at);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + at + dur);
      g.gain.setValueAtTime(0, ac.currentTime + at);
      g.gain.linearRampToValueAtTime(gain, ac.currentTime + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(ac.currentTime + at);
      osc.stop(ac.currentTime + at + dur + 0.05);
    } catch {
      // Sound is garnish; never let it break play.
    }
  }

  function noise(at, dur, gain, lowpass) {
    const ac = ctx;
    if (!ac || muted) return;
    try {
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buffer = ac.createBuffer(1, len, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const g = ac.createGain();
      g.gain.value = gain;
      src.connect(filter);
      filter.connect(g);
      g.connect(ac.destination);
      src.start(ac.currentTime + at);
    } catch {
      // Sound is garnish; never let it break play.
    }
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const beat = beatIndex % 8;
      const at = nextNoteTime - ctx.currentTime;
      // Bass on every beat, a little louder on the first of the bar.
      tone(BASSLINE[beat], at, BEAT * 0.9, 'sawtooth', beat === 0 ? 0.055 : 0.04);
      // Hat tick on the off-beats.
      if (beat % 2 === 1) noise(at, 0.03, 0.02, 8000);
      // Pad at the top of each bar.
      if (beat === 0) {
        for (const f of PAD) tone(f, at, BEAT * 7.5, 'triangle', 0.018);
      }
      nextNoteTime += BEAT;
      beatIndex += 1;
    }
  }

  return {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage can be off; the toggle still works for this visit.
      }
      return muted;
    },
    unlock() {
      ensure();
      if (ctx && !musicTimer) {
        nextNoteTime = ctx.currentTime + 0.1;
        beatIndex = 0;
        musicTimer = window.setInterval(scheduleMusic, 90);
      }
    },
    click() {
      tone(660, 0, 0.05, 'sine', 0.05);
    },
    punch() {
      noise(0, 0.08, 0.16, 900);
      tone(140, 0, 0.08, 'sine', 0.1, 70);
    },
    shoot() {
      noise(0, 0.14, 0.28, 3200);
      tone(220, 0, 0.09, 'square', 0.08, 60);
    },
    crash() {
      noise(0, 0.25, 0.3, 500);
      tone(90, 0, 0.2, 'sawtooth', 0.12, 40);
    },
    explode() {
      noise(0, 0.7, 0.4, 300);
      tone(60, 0, 0.6, 'sawtooth', 0.16, 30);
    },
    pickup() {
      tone(880, 0, 0.1, 'sine', 0.07);
      tone(1318, 0.07, 0.14, 'sine', 0.06);
    },
    steal() {
      tone(330, 0, 0.08, 'square', 0.05);
      tone(494, 0.08, 0.1, 'square', 0.05);
    },
    wanted() {
      // Two-tone siren stab.
      tone(740, 0, 0.16, 'square', 0.05);
      tone(554, 0.16, 0.16, 'square', 0.05);
      tone(740, 0.32, 0.16, 'square', 0.05);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.24, 'triangle', 0.09));
    },
    fail() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.12, 0.22, 'sawtooth', 0.05));
    },
    hurt() {
      tone(180, 0, 0.12, 'sawtooth', 0.08, 90);
    },
    engine(speed01) {
      // A soft engine drone, called every frame while driving; its pitch
      // follows the car's speed. Cheap: one short blip a frame.
      if (!ctx || muted) return;
      tone(50 + speed01 * 90, 0, 0.07, 'sawtooth', 0.018);
    },
  };
}
