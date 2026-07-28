import {
  validateBattlefieldAudioProvider,
  validateBattlefieldAudioResourceSet
} from './audio/BattlefieldAudioContract.js';

function seededNoise(index, seed = 0) {
  // Audio is presentation-only, but stable noise keeps cached synthesis repeatable.
  let value = (index + 1 + seed) * 747796405 + 2891336453;
  value = Math.imul(value ^ (value >>> 16), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1;
}

export class SoundEngine {
  constructor({ audioProvider, voiceLimits = {} } = {}) {
    this.audioProvider = validateBattlefieldAudioProvider(audioProvider);
    this.audioResources = validateBattlefieldAudioResourceSet(
      this.audioProvider.createResources()
    );
    this.assetBinding = this.audioResources.assetBinding ?? null;
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.disposed = false;
    this.voiceLimits = {
      ...this.audioResources.voiceLimits,
      ...voiceLimits
    };
    this.activeVoices = new Map();
    this.noiseBuffers = new Map();
    this.lastEventId = null;
  }

  init() {
    if (this.disposed) return false;
    if (!this.ctx) {
      const scope = globalThis.window ?? globalThis;
      const AudioCtx = scope.AudioContext || scope.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.audioResources.masterGain,
        this.ctx.currentTime
      );
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      const resume = this.ctx.resume?.();
      // Resume is presentation-only; a rejected browser gesture must not become
      // an unhandled rejection outside the synchronous playback boundary.
      resume?.catch?.(() => {});
    }
    return true;
  }

  reserveVoice(category, sourceCount, eventId) {
    const limit = this.voiceLimits[category] ?? 1;
    const active = this.activeVoices.get(category);
    if (active?.size >= limit) return null;

    const voice = {
      category,
      eventId,
      assetBinding: this.assetBinding,
      remaining: sourceCount,
      sources: [],
      nodes: []
    };
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

  getNoiseBuffer(eventId, layerIndex, layer) {
    const key = `${eventId}:${layerIndex}`;
    const cached = this.noiseBuffers.get(key);
    if (cached) return cached;
    const size = Math.ceil(this.ctx.sampleRate * layer.durationSeconds);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) {
      channel[index] = seededNoise(index, layer.seed ?? 0);
    }
    this.noiseBuffers.set(key, buffer);
    return buffer;
  }

  playNoiseLayer(voice, eventId, layer, layerIndex, startAt) {
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this.getNoiseBuffer(eventId, layerIndex, layer);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(layer.cutoffStartHz, startAt);
    filter.frequency.exponentialRampToValueAtTime(
      layer.cutoffEndHz,
      startAt + layer.durationSeconds
    );
    gain.gain.setValueAtTime(layer.gain, startAt);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      startAt + layer.durationSeconds
    );
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    this.attachSource(
      voice,
      source,
      [source, filter, gain],
      startAt + layer.durationSeconds + 0.01
    );
  }

  playOscillatorLayer(voice, layer, startAt) {
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = layer.waveform;
    oscillator.frequency.setValueAtTime(layer.startHz, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      layer.endHz,
      startAt + layer.durationSeconds
    );
    gain.gain.setValueAtTime(layer.gain, startAt);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      startAt + layer.durationSeconds
    );
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    this.attachSource(
      voice,
      oscillator,
      [oscillator, gain],
      startAt + layer.durationSeconds + 0.01
    );
  }

  playEvent(eventId) {
    if (!this.enabled || !this.init()) return false;
    const event = this.audioResources.events[eventId];
    if (!event) {
      throw new Error(`battlefield audio provider resolved unknown event ${eventId}`);
    }
    const voice = this.reserveVoice(event.category, event.layers.length, eventId);
    if (!voice) return false;
    const startAt = this.ctx.currentTime;
    try {
      event.layers.forEach((layer, index) => {
        if (layer.type === 'noise') {
          this.playNoiseLayer(voice, eventId, layer, index, startAt);
        } else {
          this.playOscillatorLayer(voice, layer, startAt);
        }
      });
    } catch (error) {
      for (const source of voice.sources) {
        source.onended = null;
        try {
          source.stop?.();
        } catch {
          // A partial WebAudio graph must still release its voice reservation.
        }
      }
      this.releaseVoice(voice);
      throw error;
    }
    this.lastEventId = eventId;
    return true;
  }

  playWeapon(weapon) {
    return this.playEvent(this.audioResources.resolveWeaponEvent(weapon));
  }

  playExplosion(context = {}) {
    return this.playEvent(this.audioResources.resolveExplosionEvent(context));
  }

  playUIClick(context = {}) {
    return this.playEvent(this.audioResources.resolveUiEvent(context));
  }

  playBuildingDamage(context = {}) {
    return this.playEvent(this.audioResources.resolveBuildingDamageEvent(context));
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
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
    this.audioResources.dispose();
    return true;
  }
}
