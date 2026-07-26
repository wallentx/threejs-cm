const VOICE_LIMITS = Object.freeze({
  gunshot: 12,
  cannon: 4,
  explosion: 3,
  ui: 2
});

const NOISE_SPECS = Object.freeze({
  gunshot_mg: { duration: 0.08, cutoff: 1200, gain: 0.32 },
  gunshot_rifle: { duration: 0.20, cutoff: 800, gain: 0.70 },
  cannon: { duration: 0.50, cutoff: 420, gain: 0.80 },
  explosion: { duration: 1.20, cutoff: 400, gain: 0.92 }
});

function seededNoise(index) {
  // Audio is presentation-only, but stable noise makes cache construction repeatable.
  let value = (index + 1) * 747796405 + 2891336453;
  value = Math.imul(value ^ (value >>> 16), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1;
}

export class SoundEngine {
  constructor({ voiceLimits = VOICE_LIMITS } = {}) {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.voiceLimits = { ...VOICE_LIMITS, ...voiceLimits };
    this.activeVoices = new Map();
    this.noiseBuffers = new Map();
  }

  init() {
    if (!this.ctx) {
      const scope = globalThis.window ?? globalThis;
      const AudioCtx = scope.AudioContext || scope.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.74, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.();
    return true;
  }

  reserveVoice(category, sourceCount) {
    const limit = this.voiceLimits[category] ?? 1;
    const active = this.activeVoices.get(category);
    if (active?.size >= limit) return null;

    const voice = { category, remaining: sourceCount, sources: [], nodes: [] };
    if (active) active.add(voice);
    else this.activeVoices.set(category, new Set([voice]));
    return voice;
  }

  releaseVoice(voice) {
    if (!voice || voice.released) return;
    voice.released = true;
    const active = this.activeVoices.get(voice.category);
    active?.delete(voice);
    if (active?.size === 0) this.activeVoices.delete(voice.category);
    for (const node of voice.nodes) node.disconnect?.();
    voice.nodes.length = 0;
    voice.sources.length = 0;
  }

  attachSource(voice, source, nodes, stopAt) {
    voice.sources.push(source);
    voice.nodes.push(...nodes);
    source.onended = () => {
      voice.remaining--;
      if (voice.remaining <= 0) this.releaseVoice(voice);
    };
    source.start();
    source.stop(stopAt);
  }

  getNoiseBuffer(id) {
    const cached = this.noiseBuffers.get(id);
    if (cached) return cached;
    const spec = NOISE_SPECS[id];
    const size = Math.ceil(this.ctx.sampleRate * spec.duration);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) channel[index] = seededNoise(index);
    this.noiseBuffers.set(id, buffer);
    return buffer;
  }

  playNoise(voice, id, startAt, duration = NOISE_SPECS[id].duration) {
    const spec = NOISE_SPECS[id];
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this.getNoiseBuffer(id);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(spec.cutoff, startAt);
    filter.frequency.exponentialRampToValueAtTime(Math.max(32, spec.cutoff * 0.11), startAt + duration);
    gain.gain.setValueAtTime(spec.gain, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    this.attachSource(voice, source, [source, filter, gain], startAt + duration + 0.01);
  }

  playGunshot(type = 'garand') {
    if (!this.enabled || !this.init()) return false;
    const voice = this.reserveVoice('gunshot', 1);
    if (!voice) return false;
    const id = type === 'mg42' ? 'gunshot_mg' : 'gunshot_rifle';
    this.playNoise(voice, id, this.ctx.currentTime);
    return true;
  }

  playCannon() {
    if (!this.enabled || !this.init()) return false;
    const voice = this.reserveVoice('cannon', 2);
    if (!voice) return false;
    const startAt = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(30, startAt + 0.6);
    gain.gain.setValueAtTime(0.72, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.7);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    this.attachSource(voice, oscillator, [oscillator, gain], startAt + 0.71);
    this.playNoise(voice, 'cannon', startAt);
    return true;
  }

  playExplosion() {
    if (!this.enabled || !this.init()) return false;
    const voice = this.reserveVoice('explosion', 1);
    if (!voice) return false;
    this.playNoise(voice, 'explosion', this.ctx.currentTime);
    return true;
  }

  playUIClick() {
    if (!this.enabled || !this.init()) return false;
    const voice = this.reserveVoice('ui', 1);
    if (!voice) return false;
    const startAt = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(800, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(400, startAt + 0.05);
    gain.gain.setValueAtTime(0.2, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.05);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    this.attachSource(voice, oscillator, [oscillator, gain], startAt + 0.06);
    return true;
  }

  dispose() {
    for (const voices of this.activeVoices.values()) {
      for (const voice of [...voices]) {
        for (const source of voice.sources) {
          source.onended = null;
          source.stop?.();
        }
        this.releaseVoice(voice);
      }
    }
    this.activeVoices.clear();
    this.noiseBuffers.clear();
    this.masterGain?.disconnect?.();
    this.masterGain = null;
    const context = this.ctx;
    this.ctx = null;
    context?.close?.();
  }
}
