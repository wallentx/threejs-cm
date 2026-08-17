import {
  AUDIO_BUS_IDS,
  DEFAULT_BUS_GAINS,
  DEFAULT_MAX_ACTIVE_VOICES,
  DEFAULT_SPEED_OF_SOUND_MPS,
  calculateDistanceCutoffHz,
  calculateDistanceGain,
  calculatePropagationDelaySeconds,
  calculateVoicePriority,
  chooseVariation,
  createAggregationKey,
  getAcousticEnvironmentProfile,
  resolveEventAcoustics,
  resolveOcclusionAcoustics
} from './audio/BattlefieldAcoustics.js';
import {
  validateBattlefieldAudioProvider,
  validateBattlefieldAudioResourceSet
} from './audio/BattlefieldAudioContract.js';

function seededNoise(index, seed = 0) {
  let value = (index + 1 + seed) * 747796405 + 2891336453;
  value = Math.imul(value ^ (value >>> 16), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1;
}

function finitePosition(value, fallback = [0, 0, 0]) {
  const array = Array.isArray(value) ? value : value?.toArray?.();
  if (array?.length >= 3 && array.slice(0, 3).every(Number.isFinite)) {
    return [array[0], array[1], array[2]];
  }
  if ([value?.x, value?.y, value?.z].every(Number.isFinite)) {
    return [value.x, value.y, value.z];
  }
  return [...fallback];
}

function distanceBetween(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function setParam(param, value, time) {
  if (!param) return;
  if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, time);
  else param.value = value;
}

function smoothParam(param, value, time, timeConstant = 0.06) {
  if (!param) return;
  param.cancelScheduledValues?.(time);
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, time, timeConstant);
  } else {
    setParam(param, value, time);
  }
}

function rampParam(param, value, time) {
  if (!param) return;
  if (value > 0 && typeof param.exponentialRampToValueAtTime === 'function') {
    param.exponentialRampToValueAtTime(value, time);
  } else if (typeof param.linearRampToValueAtTime === 'function') {
    param.linearRampToValueAtTime(value, time);
  } else {
    setParam(param, value, time);
  }
}

function scheduleGainEnvelope(param, layer, startAt) {
  const attack = Math.max(0, layer.attackSeconds ?? 0);
  if (attack > 0) {
    setParam(param, 0.001, startAt);
    rampParam(param, layer.gain, startAt + attack);
  } else {
    setParam(param, layer.gain, startAt);
  }
  rampParam(param, 0.001, startAt + layer.durationSeconds);
}

function selectPoolEntry(pool, random) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length));
  return pool[index];
}

function countActiveVoices(activeVoices) {
  let total = 0;
  for (const voices of activeVoices.values()) total += voices.size;
  return total;
}

export class SoundEngine {
  constructor({
    audioProvider,
    voiceLimits = {},
    busGains = {},
    maxActiveVoices = DEFAULT_MAX_ACTIVE_VOICES,
    speedOfSoundMps = DEFAULT_SPEED_OF_SOUND_MPS,
    random = Math.random,
    occlusionIntervalSeconds = 0.25,
    maxOcclusionChecksPerUpdate = 8
  } = {}) {
    this.audioProvider = validateBattlefieldAudioProvider(audioProvider);
    this.audioResources = validateBattlefieldAudioResourceSet(
      this.audioProvider.createResources()
    );
    if (!Number.isSafeInteger(maxActiveVoices) || maxActiveVoices <= 0) {
      throw new TypeError('maxActiveVoices must be a positive integer');
    }
    if (!Number.isFinite(speedOfSoundMps) || speedOfSoundMps <= 0) {
      throw new TypeError('speedOfSoundMps must be a positive finite number');
    }
    this.assetBinding = this.audioResources.assetBinding ?? null;
    this.ctx = null;
    this.masterGain = null;
    this.outputCompressor = null;
    this.busNodes = new Map();
    this.reverbNetworks = new Map();
    this.enabled = true;
    this.disposed = false;
    this.voiceLimits = { ...this.audioResources.voiceLimits, ...voiceLimits };
    this.busGains = { ...DEFAULT_BUS_GAINS, ...busGains };
    this.maxActiveVoices = maxActiveVoices;
    this.speedOfSoundMps = speedOfSoundMps;
    this.random = typeof random === 'function' ? random : Math.random;
    this.occlusionIntervalSeconds = Math.max(0.05, occlusionIntervalSeconds);
    this.maxOcclusionChecksPerUpdate = Math.max(1, maxOcclusionChecksPerUpdate | 0);
    this.activeVoices = new Map();
    this.allVoices = new Set();
    this.noiseBuffers = new Map();
    this.driveCurves = new Map();
    this.aggregationClusters = new Map();
    this.virtualizedRecent = [];
    this.virtualizedCount = 0;
    this.aggregatedCount = 0;
    this.occlusionQuery = null;
    this.environmentQuery = null;
    this.listenerPosition = [0, 0, 0];
    this.listenerForward = [0, 0, -1];
    this.listenerUp = [0, 1, 0];
    this.lastEventId = null;
    this.currentEnvironment = getAcousticEnvironmentProfile('openField');
  }

  init() {
    if (this.disposed) return false;
    if (!this.ctx) {
      const scope = globalThis.window ?? globalThis;
      const AudioCtx = scope.AudioContext || scope.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      setParam(this.masterGain.gain, this.audioResources.masterGain, this.ctx.currentTime);
      this.outputCompressor = this.ctx.createDynamicsCompressor?.() ?? null;
      if (this.outputCompressor) {
        setParam(this.outputCompressor.threshold, -8, this.ctx.currentTime);
        setParam(this.outputCompressor.knee, 8, this.ctx.currentTime);
        setParam(this.outputCompressor.ratio, 3, this.ctx.currentTime);
        this.masterGain.connect(this.outputCompressor);
        this.outputCompressor.connect(this.ctx.destination);
      } else {
        this.masterGain.connect(this.ctx.destination);
      }
      for (const busId of AUDIO_BUS_IDS) {
        const bus = this.ctx.createGain();
        setParam(bus.gain, this.busGains[busId], this.ctx.currentTime);
        bus.connect(this.masterGain);
        this.busNodes.set(busId, bus);
      }
      this.applyListenerPose();
    }
    if (this.ctx.state === 'suspended') {
      const resume = this.ctx.resume?.();
      resume?.catch?.(() => {});
    }
    return true;
  }

  configureSpatialModel({ occlusionQuery = null, environmentQuery = null } = {}) {
    if (occlusionQuery != null && typeof occlusionQuery !== 'function') {
      throw new TypeError('audio occlusionQuery must be a function');
    }
    if (environmentQuery != null && typeof environmentQuery !== 'function') {
      throw new TypeError('audio environmentQuery must be a function');
    }
    this.occlusionQuery = occlusionQuery;
    this.environmentQuery = environmentQuery;
  }

  setListenerPose(position, forward = [0, 0, -1], up = [0, 1, 0]) {
    this.listenerPosition = finitePosition(position, this.listenerPosition);
    this.listenerForward = finitePosition(forward, this.listenerForward);
    this.listenerUp = finitePosition(up, this.listenerUp);
    this.applyListenerPose();
  }

  applyListenerPose() {
    const listener = this.ctx?.listener;
    if (!listener) return;
    const time = this.ctx.currentTime;
    if (listener.positionX) {
      setParam(listener.positionX, this.listenerPosition[0], time);
      setParam(listener.positionY, this.listenerPosition[1], time);
      setParam(listener.positionZ, this.listenerPosition[2], time);
      setParam(listener.forwardX, this.listenerForward[0], time);
      setParam(listener.forwardY, this.listenerForward[1], time);
      setParam(listener.forwardZ, this.listenerForward[2], time);
      setParam(listener.upX, this.listenerUp[0], time);
      setParam(listener.upY, this.listenerUp[1], time);
      setParam(listener.upZ, this.listenerUp[2], time);
    } else {
      listener.setPosition?.(...this.listenerPosition);
      listener.setOrientation?.(...this.listenerForward, ...this.listenerUp);
    }
  }

  setBusGain(busId, gain) {
    if (!AUDIO_BUS_IDS.includes(busId)) throw new Error(`unknown audio bus ${busId}`);
    if (!Number.isFinite(gain) || gain < 0) throw new TypeError('audio bus gain must be non-negative');
    this.busGains[busId] = gain;
    smoothParam(this.busNodes.get(busId)?.gain, gain, this.ctx?.currentTime ?? 0);
  }

  recordVirtualized(eventId, context) {
    this.virtualizedCount++;
    this.virtualizedRecent.push({ eventId, ...context });
    if (this.virtualizedRecent.length > 64) this.virtualizedRecent.shift();
  }

  findLowestPriority(voices) {
    let lowest = null;
    for (const voice of voices) {
      if (!lowest || voice.priority < lowest.priority) lowest = voice;
    }
    return lowest;
  }

  evictVoice(voice) {
    if (!voice || voice.evicted || voice.released) return;
    voice.evicted = true;
    const active = this.activeVoices.get(voice.category);
    active?.delete(voice);
    if (active?.size === 0) this.activeVoices.delete(voice.category);
    const now = this.ctx.currentTime;
    smoothParam(voice.dryGain?.gain, 0.0001, now, 0.015);
    for (const source of voice.sources) {
      try { source.stop(now + 0.03); } catch {}
    }
  }

  reserveVoice(category, sourceCount, eventId, priority) {
    const categoryLimit = this.voiceLimits[category] ?? 1;
    const activeCategory = this.activeVoices.get(category) ?? new Set();
    if (activeCategory.size >= categoryLimit) {
      const weakest = this.findLowestPriority(activeCategory);
      if (!weakest || priority <= weakest.priority * 1.1) return null;
      this.evictVoice(weakest);
    }
    if (countActiveVoices(this.activeVoices) >= this.maxActiveVoices) {
      const allActive = [];
      for (const voices of this.activeVoices.values()) allActive.push(...voices);
      const weakest = this.findLowestPriority(allActive);
      if (!weakest || priority <= weakest.priority * 1.1) return null;
      this.evictVoice(weakest);
    }
    const voice = {
      category, eventId, priority, assetBinding: this.assetBinding,
      remaining: sourceCount, sources: [], nodes: [],
      createdAt: this.ctx.currentTime,
      nextOcclusionAt: this.ctx.currentTime + this.occlusionIntervalSeconds
    };
    const set = this.activeVoices.get(category);
    if (set) set.add(voice);
    else this.activeVoices.set(category, new Set([voice]));
    this.allVoices.add(voice);
    return voice;
  }

  releaseVoice(voice) {
    if (!voice || voice.released) return;
    voice.released = true;
    const active = this.activeVoices.get(voice.category);
    active?.delete(voice);
    if (active?.size === 0) this.activeVoices.delete(voice.category);
    this.allVoices.delete(voice);
    for (const [key, cluster] of this.aggregationClusters) {
      if (cluster.voice === voice) this.aggregationClusters.delete(key);
    }
    for (const node of voice.nodes) node.disconnect?.();
    voice.nodes.length = 0;
    voice.sources.length = 0;
  }

  attachSource(voice, source, nodes, startAt, stopAt) {
    voice.sources.push(source);
    voice.nodes.push(source, ...nodes);
    source.onended = () => {
      voice.remaining--;
      if (voice.remaining <= 0) this.releaseVoice(voice);
    };
    source.start(startAt);
    source.stop(stopAt);
  }

  getNoiseBuffer(eventId, layerIndex, layer, seed) {
    const noiseColor = layer.noiseColor ?? 'white';
    const key = `${eventId}:${layerIndex}:${seed}:${noiseColor}`;
    const cached = this.noiseBuffers.get(key);
    if (cached) return cached;
    const size = Math.ceil(this.ctx.sampleRate * layer.durationSeconds);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let brown = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let index = 0; index < channel.length; index++) {
      const white = seededNoise(index, seed);
      if (noiseColor === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        channel[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6
          + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (noiseColor === 'brown') {
        brown = (brown + white * 0.02) / 1.02;
        channel[index] = Math.max(-1, Math.min(1, brown * 3.5));
      } else {
        channel[index] = white;
      }
    }
    this.noiseBuffers.set(key, buffer);
    return buffer;
  }

  getDriveCurve(drive) {
    const amount = Math.max(0, Number(drive) || 0);
    if (amount <= 0) return null;
    const key = amount.toFixed(3);
    const cached = this.driveCurves.get(key);
    if (cached) return cached;
    const curve = new Float32Array(1024);
    const normalizer = Math.tanh(amount);
    for (let index = 0; index < curve.length; index++) {
      const input = index / (curve.length - 1) * 2 - 1;
      curve[index] = Math.tanh(input * amount) / normalizer;
    }
    this.driveCurves.set(key, curve);
    return curve;
  }

  getReverbNetwork(profile) {
    const cached = this.reverbNetworks.get(profile.id);
    if (cached) return cached;
    if (!this.ctx.createConvolver) return null;
    const convolver = this.ctx.createConvolver();
    const wetGain = this.ctx.createGain();
    const size = Math.max(1, Math.ceil(this.ctx.sampleRate * profile.durationSeconds));
    const impulse = this.ctx.createBuffer(2, size, this.ctx.sampleRate);
    let seed = 0;
    for (const char of profile.id) seed = (seed * 31 + char.charCodeAt(0)) | 0;
    for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
      const channel = impulse.getChannelData(channelIndex);
      let damped = 0;
      for (let index = 0; index < channel.length; index++) {
        const envelope = Math.pow(1 - index / channel.length, profile.decay);
        const noise = seededNoise(index, seed + channelIndex * 97);
        damped += (noise - damped) * (1 - profile.highFrequencyDamping);
        channel[index] = damped * envelope;
      }
    }
    convolver.buffer = impulse;
    setParam(wetGain.gain, profile.wet, this.ctx.currentTime);
    convolver.connect(wetGain);
    wetGain.connect(this.busNodes.get('environment'));
    const network = { profile, convolver, wetGain };
    this.reverbNetworks.set(profile.id, network);
    return network;
  }

  resolveEnvironment(context, position) {
    if (typeof context.environment === 'string') {
      return getAcousticEnvironmentProfile(context.environment);
    }
    if (context.environment?.id) return context.environment;
    try {
      return this.environmentQuery?.(position, this.listenerPosition, context)
        ?? getAcousticEnvironmentProfile('openField');
    } catch {
      return getAcousticEnvironmentProfile('openField');
    }
  }

  queryOcclusion(position, context) {
    if (!this.occlusionQuery) return resolveOcclusionAcoustics(null);
    try {
      return resolveOcclusionAcoustics(
        this.occlusionQuery(position, this.listenerPosition, context)
      );
    } catch {
      return resolveOcclusionAcoustics(null);
    }
  }

  createVoiceGraph(voice, acoustics, position, distanceGain, cutoffHz, occlusion, environment) {
    const input = this.ctx.createGain();
    const dryGain = this.ctx.createGain();
    const bus = this.busNodes.get(acoustics.bus) ?? this.busNodes.get('environment');
    Object.assign(voice, { input, dryGain, position, acoustics, occlusion, environment });
    voice.nodes.push(input, dryGain);
    let tail = input;
    if (acoustics.spatial) {
      const distanceFilter = this.ctx.createBiquadFilter();
      const occlusionFilter = this.ctx.createBiquadFilter();
      const occlusionGain = this.ctx.createGain();
      distanceFilter.type = 'lowpass';
      occlusionFilter.type = 'lowpass';
      setParam(distanceFilter.frequency, cutoffHz, this.ctx.currentTime);
      setParam(occlusionFilter.frequency, occlusion.cutoffHz, this.ctx.currentTime);
      setParam(occlusionGain.gain, occlusion.gain, this.ctx.currentTime);
      tail.connect(distanceFilter);
      distanceFilter.connect(occlusionFilter);
      occlusionFilter.connect(occlusionGain);
      tail = occlusionGain;
      Object.assign(voice, { distanceFilter, occlusionFilter, occlusionGain });
      voice.nodes.push(distanceFilter, occlusionFilter, occlusionGain);
      const panner = this.ctx.createPanner?.() ?? null;
      if (panner) {
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = acoustics.maxDistance;
        panner.rolloffFactor = 0;
        if (panner.positionX) {
          setParam(panner.positionX, position[0], this.ctx.currentTime);
          setParam(panner.positionY, position[1], this.ctx.currentTime);
          setParam(panner.positionZ, position[2], this.ctx.currentTime);
        } else {
          panner.setPosition?.(...position);
        }
        tail.connect(panner);
        tail = panner;
        voice.panner = panner;
        voice.nodes.push(panner);
      }
    }
    setParam(dryGain.gain, distanceGain, this.ctx.currentTime);
    tail.connect(dryGain);
    dryGain.connect(bus);
    const reverb = acoustics.reverbSend > 0 ? this.getReverbNetwork(environment) : null;
    if (reverb) {
      const sendGain = this.ctx.createGain();
      setParam(sendGain.gain, acoustics.reverbSend * distanceGain, this.ctx.currentTime);
      tail.connect(sendGain);
      sendGain.connect(reverb.convolver);
      voice.reverbSend = sendGain;
      voice.nodes.push(sendGain);
    }
  }

  playNoiseLayer(voice, eventId, layer, layerIndex, startAt, playbackRate) {
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    const shaper = layer.drive > 0 && this.ctx.createWaveShaper
      ? this.ctx.createWaveShaper()
      : null;
    const seed = selectPoolEntry(layer.seedPool, this.random) ?? layer.seed ?? 0;
    source.buffer = this.getNoiseBuffer(eventId, layerIndex, layer, seed);
    setParam(source.playbackRate, playbackRate, startAt);
    filter.type = layer.filterType ?? 'lowpass';
    setParam(filter.Q, layer.filterQ ?? 0.707, startAt);
    setParam(filter.frequency, layer.cutoffStartHz, startAt);
    rampParam(filter.frequency, layer.cutoffEndHz, startAt + layer.durationSeconds);
    scheduleGainEnvelope(gain.gain, layer, startAt);
    source.connect(filter);
    if (shaper) {
      shaper.curve = this.getDriveCurve(layer.drive);
      shaper.oversample = '2x';
      filter.connect(shaper);
      shaper.connect(gain);
    } else {
      filter.connect(gain);
    }
    gain.connect(voice.input);
    this.attachSource(voice, source, [filter, ...(shaper ? [shaper] : []), gain], startAt,
      startAt + layer.durationSeconds + 0.01);
  }

  playOscillatorLayer(voice, layer, startAt, playbackRate) {
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = layer.waveform;
    setParam(oscillator.frequency, layer.startHz * playbackRate, startAt);
    rampParam(oscillator.frequency, layer.endHz * playbackRate,
      startAt + layer.durationSeconds);
    scheduleGainEnvelope(gain.gain, layer, startAt);
    oscillator.connect(gain);
    gain.connect(voice.input);
    this.attachSource(voice, oscillator, [gain], startAt,
      startAt + layer.durationSeconds + 0.01);
  }

  playBufferLayer(voice, layer, startAt, playbackRate) {
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = selectPoolEntry(layer.buffers, this.random);
    setParam(source.playbackRate, playbackRate, startAt);
    scheduleGainEnvelope(gain.gain, layer, startAt);
    source.connect(gain);
    gain.connect(voice.input);
    this.attachSource(voice, source, [gain], startAt,
      startAt + layer.durationSeconds + 0.01);
  }

  emit(eventId, context = {}) {
    if (!this.enabled || !this.init()) return false;
    const event = this.audioResources.events[eventId];
    if (!event) throw new Error(`battlefield audio provider resolved unknown event ${eventId}`);
    const acoustics = resolveEventAcoustics(event);
    const position = finitePosition(context.position, this.listenerPosition);
    const distance = acoustics.spatial ? distanceBetween(position, this.listenerPosition) : 0;
    const baseDistanceGain = calculateDistanceGain(distance, acoustics);
    if (baseDistanceGain <= 0) {
      this.recordVirtualized(eventId, { reason: 'out-of-range', distance });
      return false;
    }
    const variation = chooseVariation(event, this.random);
    const occlusion = acoustics.spatial
      ? this.queryOcclusion(position, context)
      : resolveOcclusionAcoustics(null);
    const perceivedGain = baseDistanceGain * occlusion.gain * variation.gain;
    const priority = calculateVoicePriority({
      basePriority: acoustics.priority,
      perceivedGain,
      gameplayImportance: context.gameplayImportance,
      occluded: occlusion.occluded
    });
    const layers = event.layers.filter(layer =>
      !Number.isFinite(layer.maxDistance) || distance <= layer.maxDistance);
    if (layers.length === 0) {
      this.recordVirtualized(eventId, { reason: 'layer-distance', distance, priority });
      return false;
    }
    const aggregateKey = distance >= acoustics.aggregationDistance
      ? `${eventId}:${createAggregationKey(position, acoustics.aggregationCellSize)}`
      : null;
    const existingCluster = aggregateKey ? this.aggregationClusters.get(aggregateKey) : null;
    if (existingCluster?.voice && !existingCluster.voice.released
        && this.ctx.currentTime <= existingCluster.expiresAt) {
      existingCluster.count++;
      existingCluster.expiresAt = this.ctx.currentTime + acoustics.aggregationWindowSeconds;
      this.aggregatedCount++;
      smoothParam(existingCluster.voice.dryGain?.gain,
        Math.min(1.35, existingCluster.baseGain
          * (1 + Math.log2(existingCluster.count) * 0.14)),
        this.ctx.currentTime, 0.025);
      this.lastEventId = eventId;
      return true;
    }
    const voice = this.reserveVoice(event.category, layers.length, eventId, priority);
    if (!voice) {
      this.recordVirtualized(eventId, { reason: 'voice-budget', distance, priority });
      return false;
    }
    const propagationDelay = acoustics.spatial
      ? calculatePropagationDelaySeconds(distance, this.speedOfSoundMps) : 0;
    const environment = this.resolveEnvironment(context, position);
    const distanceCutoff = calculateDistanceCutoffHz(distance, acoustics)
      * variation.filterScale;
    Object.assign(voice, {
      distance,
      propagationDelay,
      cutoffHz: distanceCutoff,
      perceivedGain,
      context,
      startAt: this.ctx.currentTime + propagationDelay,
      layerRoles: layers.map((layer, index) => layer.role ?? `layer-${index}`)
    });
    this.currentEnvironment = environment;
    this.createVoiceGraph(voice, acoustics, position,
      baseDistanceGain * variation.gain, distanceCutoff, occlusion, environment);
    try {
      layers.forEach((layer, index) => {
        const startAt = voice.startAt + (layer.delaySeconds ?? 0);
        if (layer.type === 'noise') {
          this.playNoiseLayer(voice, eventId, layer, index, startAt, variation.playbackRate);
        } else if (layer.type === 'oscillator') {
          this.playOscillatorLayer(voice, layer, startAt, variation.playbackRate);
        } else {
          this.playBufferLayer(voice, layer, startAt, variation.playbackRate);
        }
      });
    } catch (error) {
      for (const source of voice.sources) {
        source.onended = null;
        try { source.stop?.(); } catch {}
      }
      this.releaseVoice(voice);
      throw error;
    }
    if (aggregateKey) {
      this.aggregationClusters.set(aggregateKey, {
        voice, count: 1, baseGain: baseDistanceGain * variation.gain,
        expiresAt: this.ctx.currentTime + acoustics.aggregationWindowSeconds
      });
    }
    this.lastEventId = eventId;
    return true;
  }

  update() {
    if (!this.ctx || this.disposed) return;
    const now = this.ctx.currentTime;
    for (const [key, cluster] of this.aggregationClusters) {
      if (cluster.voice.released || now > cluster.expiresAt) {
        this.aggregationClusters.delete(key);
      }
    }
    if (!this.occlusionQuery) return;
    let checks = 0;
    for (const voices of this.activeVoices.values()) {
      for (const voice of voices) {
        if (!voice.acoustics?.spatial || now < voice.nextOcclusionAt) continue;
        const occlusion = this.queryOcclusion(voice.position, voice.context);
        voice.occlusion = occlusion;
        smoothParam(voice.occlusionGain?.gain, occlusion.gain, now, 0.08);
        smoothParam(voice.occlusionFilter?.frequency, occlusion.cutoffHz, now, 0.08);
        voice.nextOcclusionAt = now + this.occlusionIntervalSeconds;
        if (++checks >= this.maxOcclusionChecksPerUpdate) return;
      }
    }
  }

  playEvent(eventId, context = {}) { return this.emit(eventId, context); }
  playWeapon(weapon, context = {}) {
    return this.emit(this.audioResources.resolveWeaponEvent(weapon), context);
  }
  playExplosion(context = {}) {
    return this.emit(this.audioResources.resolveExplosionEvent(context), context);
  }
  playImpact(context = {}) {
    return this.emit(this.audioResources.resolveImpactEvent(context), context);
  }
  playUIClick(context = {}) {
    return this.emit(this.audioResources.resolveUiEvent(context), context);
  }
  playBuildingDamage(context = {}) {
    return this.emit(this.audioResources.resolveBuildingDamageEvent(context), {
      ...context,
      position: context.position ?? context.worldPosition
    });
  }

  getDiagnostics() {
    const active = [];
    for (const voices of this.activeVoices.values()) {
      for (const voice of voices) {
        active.push({
          eventId: voice.eventId,
          category: voice.category,
          priority: voice.priority,
          distance: voice.distance,
          propagationDelay: voice.propagationDelay,
          occluded: voice.occlusion?.occluded ?? false,
          environment: voice.environment?.id ?? 'openField',
          cutoffHz: voice.cutoffHz,
          layerRoles: [...(voice.layerRoles ?? [])],
          position: voice.position ? [...voice.position] : null
        });
      }
    }
    active.sort((a, b) => b.priority - a.priority);
    return {
      enabled: this.enabled,
      contextState: this.ctx?.state ?? 'uninitialized',
      activeVoiceCount: active.length,
      maxActiveVoices: this.maxActiveVoices,
      activeVoices: active,
      virtualizedCount: this.virtualizedCount,
      virtualizedRecent: this.virtualizedRecent.slice(-12),
      aggregatedCount: this.aggregatedCount,
      aggregationClusterCount: this.aggregationClusters.size,
      environment: this.currentEnvironment.id,
      speedOfSoundMps: this.speedOfSoundMps,
      busGains: { ...this.busGains }
    };
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    for (const voice of [...this.allVoices]) {
      for (const source of voice.sources) {
        source.onended = null;
        try { source.stop?.(); } catch {}
      }
      this.releaseVoice(voice);
    }
    this.activeVoices.clear();
    this.allVoices.clear();
    this.aggregationClusters.clear();
    this.noiseBuffers.clear();
    this.driveCurves.clear();
    for (const network of this.reverbNetworks.values()) {
      network.convolver.disconnect?.();
      network.wetGain.disconnect?.();
    }
    this.reverbNetworks.clear();
    for (const bus of this.busNodes.values()) bus.disconnect?.();
    this.busNodes.clear();
    this.masterGain?.disconnect?.();
    this.outputCompressor?.disconnect?.();
    this.masterGain = null;
    this.outputCompressor = null;
    const context = this.ctx;
    this.ctx = null;
    context?.close?.();
    this.audioResources.dispose();
    return true;
  }
}
