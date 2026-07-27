const OSCILLATOR_WAVEFORMS = new Set([
  'sine',
  'square',
  'sawtooth',
  'triangle'
]);

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
}

function validateLayer(eventId, layer, index) {
  const label = `battlefield audio event ${eventId} layer ${index}`;
  if (!layer || typeof layer !== 'object') {
    throw new TypeError(`${label} must be a record`);
  }
  requirePositiveNumber(layer.durationSeconds, `${label} durationSeconds`);
  requirePositiveNumber(layer.gain, `${label} gain`);

  if (layer.type === 'noise') {
    requirePositiveNumber(layer.cutoffStartHz, `${label} cutoffStartHz`);
    requirePositiveNumber(layer.cutoffEndHz, `${label} cutoffEndHz`);
    if (layer.seed != null && !Number.isSafeInteger(layer.seed)) {
      throw new TypeError(`${label} seed must be a safe integer`);
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
    event.layers.forEach((layer, index) => validateLayer(eventId, layer, index));
  }

  for (const method of [
    'resolveWeaponEvent',
    'resolveExplosionEvent',
    'resolveUiEvent',
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
