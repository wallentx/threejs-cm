const OSCILLATOR_WAVEFORMS = new Set([
  'sine',
  'square',
  'sawtooth',
  'triangle'
]);
const NOISE_COLORS = new Set(['white', 'pink', 'brown']);
const FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass']);

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
}

function requireNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
}

function validateRange(value, label, { positive = false } = {}) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${label} must contain two numbers`);
  }
  value.forEach((entry, index) => {
    if (positive) requirePositiveNumber(entry, `${label}[${index}]`);
    else requireNonNegativeNumber(entry, `${label}[${index}]`);
  });
  if (value[0] > value[1]) {
    throw new TypeError(`${label} must be ordered low to high`);
  }
}

function validateLayer(eventId, layer, index) {
  const label = `battlefield audio event ${eventId} layer ${index}`;
  if (!layer || typeof layer !== 'object') {
    throw new TypeError(`${label} must be a record`);
  }
  requirePositiveNumber(layer.durationSeconds, `${label} durationSeconds`);
  requirePositiveNumber(layer.gain, `${label} gain`);
  if (layer.role != null && (typeof layer.role !== 'string' || layer.role.length === 0)) {
    throw new TypeError(`${label} role must be a non-empty string`);
  }
  if (layer.attackSeconds != null) {
    requireNonNegativeNumber(layer.attackSeconds, `${label} attackSeconds`);
    if (layer.attackSeconds >= layer.durationSeconds) {
      throw new TypeError(`${label} attackSeconds must be shorter than durationSeconds`);
    }
  }
  if (layer.delaySeconds != null) {
    requireNonNegativeNumber(layer.delaySeconds, `${label} delaySeconds`);
  }
  if (layer.maxDistance != null) {
    requirePositiveNumber(layer.maxDistance, `${label} maxDistance`);
  }

  if (layer.type === 'noise') {
    requirePositiveNumber(layer.cutoffStartHz, `${label} cutoffStartHz`);
    requirePositiveNumber(layer.cutoffEndHz, `${label} cutoffEndHz`);
    if (layer.noiseColor != null && !NOISE_COLORS.has(layer.noiseColor)) {
      throw new TypeError(`${label} has unsupported noiseColor ${layer.noiseColor}`);
    }
    if (layer.filterType != null && !FILTER_TYPES.has(layer.filterType)) {
      throw new TypeError(`${label} has unsupported filterType ${layer.filterType}`);
    }
    if (layer.filterQ != null) {
      requirePositiveNumber(layer.filterQ, `${label} filterQ`);
    }
    if (layer.drive != null) {
      requireNonNegativeNumber(layer.drive, `${label} drive`);
      if (layer.drive > 8) throw new TypeError(`${label} drive must not exceed 8`);
    }
    if (layer.seed != null && !Number.isSafeInteger(layer.seed)) {
      throw new TypeError(`${label} seed must be a safe integer`);
    }
    if (layer.seedPool != null) {
      if (!Array.isArray(layer.seedPool) || layer.seedPool.length === 0) {
        throw new TypeError(`${label} seedPool must be a non-empty array`);
      }
      for (const seed of layer.seedPool) {
        if (!Number.isSafeInteger(seed)) {
          throw new TypeError(`${label} seedPool entries must be safe integers`);
        }
      }
    }
    return;
  }

  if (layer.type === 'oscillator') {
    if (!OSCILLATOR_WAVEFORMS.has(layer.waveform)) {
      throw new TypeError(`${label} has unsupported waveform ${layer.waveform}`);
    }
    requirePositiveNumber(layer.startHz, `${label} startHz`);
    requirePositiveNumber(layer.endHz, `${label} endHz`);
    return;
  }

  if (layer.type === 'buffer') {
    if (!Array.isArray(layer.buffers) || layer.buffers.length === 0) {
      throw new TypeError(`${label} buffers must be a non-empty decoded sample pool`);
    }
    return;
  }

  throw new TypeError(`${label} has unsupported type ${layer.type ?? 'missing'}`);
}

export function validateBattlefieldAudioResourceSet(resources) {
  if (!resources || resources.kind !== 'battlefield-audio-resources') {
    throw new TypeError('battlefield audio provider must create battlefield-audio-resources');
  }
  requirePositiveNumber(resources.masterGain, 'battlefield audio masterGain');
  if (!resources.voiceLimits || typeof resources.voiceLimits !== 'object') {
    throw new TypeError('battlefield audio resources require voice limits');
  }
  if (!resources.events || typeof resources.events !== 'object') {
    throw new TypeError('battlefield audio resources require event records');
  }
  const eventEntries = Object.entries(resources.events);
  if (eventEntries.length === 0) {
    throw new TypeError('battlefield audio resources require at least one event');
  }

  for (const [eventId, event] of eventEntries) {
    if (!event || typeof event.category !== 'string' || event.category.length === 0) {
      throw new TypeError(`battlefield audio event ${eventId} requires a category`);
    }
    const limit = resources.voiceLimits[event.category];
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError(
        `battlefield audio event ${eventId} requires a positive voice limit for ${event.category}`
      );
    }
    if (!Array.isArray(event.layers) || event.layers.length === 0) {
      throw new TypeError(`battlefield audio event ${eventId} requires audio layers`);
    }
    if (event.spatial != null && typeof event.spatial !== 'boolean') {
      throw new TypeError(`battlefield audio event ${eventId} spatial must be boolean`);
    }
    if (event.priority != null) {
      requirePositiveNumber(event.priority, `battlefield audio event ${eventId} priority`);
    }
    if (event.reverbSend != null) {
      requireNonNegativeNumber(
        event.reverbSend,
        `battlefield audio event ${eventId} reverbSend`
      );
      if (event.reverbSend > 1) {
        throw new TypeError(`battlefield audio event ${eventId} reverbSend must not exceed 1`);
      }
    }
    if (event.variation != null) {
      for (const key of ['gain', 'playbackRate', 'filterScale']) {
        if (event.variation[key] != null) {
          validateRange(
            event.variation[key],
            `battlefield audio event ${eventId} variation.${key}`,
            { positive: true }
          );
        }
      }
    }
    event.layers.forEach((layer, index) => validateLayer(eventId, layer, index));
  }

  for (const method of [
    'resolveWeaponEvent',
    'resolveExplosionEvent',
    'resolveImpactEvent',
    'resolveUiEvent',
    'resolveBuildingDamageEvent',
    'dispose'
  ]) {
    if (typeof resources[method] !== 'function') {
      throw new TypeError(`battlefield audio resources require ${method}`);
    }
  }
  return resources;
}

export function validateBattlefieldAudioProvider(provider) {
  if (
    !provider
    || provider.kind !== 'battlefield-audio-provider'
    || typeof provider.id !== 'string'
    || provider.id.length === 0
    || typeof provider.createResources !== 'function'
  ) {
    throw new TypeError('SoundEngine requires a battlefield audio provider');
  }
  return provider;
}
