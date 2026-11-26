// Sound: everything is synthesised with WebAudio — an engine drone that follows
// the throttle, wind that follows the speed, a chime for each ring, a thud for a
// crash and a little fanfare for a landing. No audio files, no network.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windGain: null,
    windFilter: null,
    muted: false,
    started: false,
  };
  return audio;
}

/** Start the audio graph. Must run from a user gesture (click / keypress). */
export function startAudio(audio) {
  if (audio.started) {
    if (audio.ctx && audio.ctx.state === 'suspended') void audio.ctx.resume();
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(ctx.destination);

    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineOsc2 = ctx.createOscillator();
    audio.engineOsc2.type = 'sine';
    audio.engineOsc2.frequency.value = 110;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineOsc.connect(engineFilter);
    audio.engineOsc2.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    // Wind: looped noise through a bandpass, loud only when fast.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    audio.windFilter = ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 700;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0;
    noise.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    noise.start();

    audio.started = true;
  } catch {
    audio.started = false;
  }
}

/** Every frame while flying: engine pitch and wind follow throttle and speed. */
export function updateAudio(audio, plane, flying) {
  if (!audio.started || !audio.ctx) return;
  const now = audio.ctx.currentTime;
  const targetEngine = flying && !audio.muted ? 0.05 + plane.throttle * 0.09 : 0;
  audio.engineGain.gain.setTargetAtTime(targetEngine, now, 0.1);
  audio.engineOsc.frequency.setTargetAtTime(48 + plane.throttle * 70 + plane.speed * 0.35, now, 0.1);
  audio.engineOsc2.frequency.setTargetAtTime(96 + plane.throttle * 140 + plane.speed * 0.7, now, 0.1);
  const wind = flying && !audio.muted ? Math.max(0, (plane.speed - 18) / 95) * 0.12 : 0;
  audio.windGain.gain.setTargetAtTime(wind, now, 0.15);
  audio.windFilter.frequency.setTargetAtTime(500 + plane.speed * 12, now, 0.15);
}

function tone(audio, frequency, startAt, duration, type, volume) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}

/** Two-note chime when a ring is flown. */
export function playRingChime(audio) {
  tone(audio, 660, 0, 0.22, 'sine', 0.25);
  tone(audio, 990, 0.09, 0.3, 'sine', 0.22);
}

/** Low thud and falling tone for a crash. */
export function playCrash(audio) {
  tone(audio, 160, 0, 0.5, 'sine', 0.4);
  tone(audio, 70, 0.05, 0.7, 'triangle', 0.35);
  tone(audio, 45, 0.1, 0.9, 'sawtooth', 0.2);
}

/** A short rising fanfare for a good landing. */
export function playLanding(audio) {
  tone(audio, 523, 0, 0.25, 'triangle', 0.25);
  tone(audio, 659, 0.12, 0.25, 'triangle', 0.25);
  tone(audio, 784, 0.24, 0.4, 'triangle', 0.28);
}

/** Toggle sound on/off; returns the new muted state. */
export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  return audio.muted;
}
