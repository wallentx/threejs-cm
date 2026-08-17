export const DEFAULT_SPEED_OF_SOUND_MPS = 343;
export const DEFAULT_MAX_ACTIVE_VOICES = 64;

export const AUDIO_BUS_IDS = Object.freeze([
  'weapons',
  'explosions',
  'vehicles',
  'impacts',
  'infantry',
  'environment',
  'ui'
]);

export const DEFAULT_BUS_GAINS = Object.freeze({
  weapons: 1,
  explosions: 1,
  vehicles: 0.82,
  impacts: 0.9,
  infantry: 0.9,
  environment: 0.72,
  ui: 0.8
});

export const ACOUSTIC_ENVIRONMENT_PROFILES = Object.freeze({
  openField: Object.freeze({
    id: 'openField', label: 'Open field', wet: 0.08, durationSeconds: 0.45,
    decay: 2.7, highFrequencyDamping: 0.32
  }),
  forest: Object.freeze({
    id: 'forest', label: 'Forest', wet: 0.14, durationSeconds: 0.7,
    decay: 3.8, highFrequencyDamping: 0.62
  }),
  village: Object.freeze({
    id: 'village', label: 'Village', wet: 0.2, durationSeconds: 1.1,
    decay: 2.5, highFrequencyDamping: 0.4
  }),
  urbanStreet: Object.freeze({
    id: 'urbanStreet', label: 'Urban street', wet: 0.28, durationSeconds: 1.65,
    decay: 2.1, highFrequencyDamping: 0.34
  }),
  smallRoom: Object.freeze({
    id: 'smallRoom', label: 'Small room', wet: 0.3, durationSeconds: 0.72,
    decay: 3.2, highFrequencyDamping: 0.52
  }),
  largeBuilding: Object.freeze({
    id: 'largeBuilding', label: 'Large building', wet: 0.36, durationSeconds: 1.8,
    decay: 2.45, highFrequencyDamping: 0.42
  }),
  church: Object.freeze({
    id: 'church', label: 'Church', wet: 0.46, durationSeconds: 3.4,
    decay: 1.75, highFrequencyDamping: 0.27
  })
});

export const DEFAULT_CATEGORY_ACOUSTICS = Object.freeze({
  smallArms: Object.freeze({
    bus: 'weapons', priority: 58, referenceDistance: 18, maxDistance: 2200,
    rolloff: 0.88, nearCutoffHz: 19000, farCutoffHz: 820,
    reverbSend: 0.18, aggregationDistance: 850
  }),
  cannon: Object.freeze({
    bus: 'weapons', priority: 96, referenceDistance: 42, maxDistance: 6000,
    rolloff: 0.72, nearCutoffHz: 19500, farCutoffHz: 430,
    reverbSend: 0.34, aggregationDistance: Infinity
  }),
  explosion: Object.freeze({
    bus: 'explosions', priority: 94, referenceDistance: 48, maxDistance: 6500,
    rolloff: 0.7, nearCutoffHz: 18000, farCutoffHz: 360,
    reverbSend: 0.38, aggregationDistance: Infinity
  }),
  impact: Object.freeze({
    bus: 'impacts', priority: 68, referenceDistance: 12, maxDistance: 1400,
    rolloff: 1.02, nearCutoffHz: 18000, farCutoffHz: 950,
    reverbSend: 0.14, aggregationDistance: Infinity
  }),
  buildingDamage: Object.freeze({
    bus: 'impacts', priority: 74, referenceDistance: 28, maxDistance: 2800,
    rolloff: 0.82, nearCutoffHz: 15000, farCutoffHz: 540,
    reverbSend: 0.3, aggregationDistance: Infinity
  }),
  vehicle: Object.freeze({
    bus: 'vehicles', priority: 28, referenceDistance: 20, maxDistance: 1600,
    rolloff: 1.08, nearCutoffHz: 12500, farCutoffHz: 520,
    reverbSend: 0.08, aggregationDistance: Infinity
  }),
  infantry: Object.freeze({
    bus: 'infantry', priority: 44, referenceDistance: 10, maxDistance: 700,
    rolloff: 1.12, nearCutoffHz: 16000, farCutoffHz: 1100,
    reverbSend: 0.16, aggregationDistance: Infinity
  }),
  environment: Object.freeze({
    bus: 'environment', priority: 12, referenceDistance: 35, maxDistance: 2500,
    rolloff: 0.9, nearCutoffHz: 14000, farCutoffHz: 600,
    reverbSend: 0.1, aggregationDistance: Infinity
  }),
  ui: Object.freeze({
    bus: 'ui', priority: 1000, referenceDistance: 1, maxDistance: Infinity,
    rolloff: 0, nearCutoffHz: 20000, farCutoffHz: 20000,
    reverbSend: 0, aggregationDistance: Infinity
  })
});

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function resolveEventAcoustics(event) {
  const defaults = DEFAULT_CATEGORY_ACOUSTICS[event?.category]
    ?? DEFAULT_CATEGORY_ACOUSTICS.environment;
  const distance = event?.distance ?? {};
  return Object.freeze({
    spatial: event?.spatial ?? event?.category !== 'ui',
    bus: event?.bus ?? defaults.bus,
    priority: finiteOr(event?.priority, defaults.priority),
    referenceDistance: Math.max(
      0.01,
      finiteOr(distance.referenceDistance, defaults.referenceDistance)
    ),
    maxDistance: finiteOr(distance.maxDistance, defaults.maxDistance),
    rolloff: Math.max(0, finiteOr(distance.rolloff, defaults.rolloff)),
    nearCutoffHz: Math.max(
      20,
      finiteOr(distance.nearCutoffHz, defaults.nearCutoffHz)
    ),
    farCutoffHz: Math.max(
      20,
      finiteOr(distance.farCutoffHz, defaults.farCutoffHz)
    ),
    reverbSend: clamp01(finiteOr(event?.reverbSend, defaults.reverbSend)),
    aggregationDistance: finiteOr(
      event?.aggregation?.minDistance,
      defaults.aggregationDistance
    ),
    aggregationCellSize: Math.max(
      1,
      finiteOr(event?.aggregation?.cellSize, 180)
    ),
    aggregationWindowSeconds: Math.max(
      0.01,
      finiteOr(event?.aggregation?.windowSeconds, 0.25)
    )
  });
}

export function calculateDistanceGain(distanceMeters, acoustics) {
  const distance = Math.max(0, finiteOr(distanceMeters, 0));
  if (distance > acoustics.maxDistance) return 0;
  if (distance <= acoustics.referenceDistance) return 1;
  return clamp01(
    Math.pow(acoustics.referenceDistance / distance, acoustics.rolloff)
  );
}

export function calculateDistanceCutoffHz(distanceMeters, acoustics) {
  const distance = Math.max(acoustics.referenceDistance, finiteOr(distanceMeters, 0));
  if (!Number.isFinite(acoustics.maxDistance)) return acoustics.nearCutoffHz;
  const far = Math.max(acoustics.referenceDistance + 0.01, acoustics.maxDistance);
  const progress = clamp01(
    Math.log(distance / acoustics.referenceDistance)
      / Math.log(far / acoustics.referenceDistance)
  );
  return acoustics.nearCutoffHz
    * Math.pow(acoustics.farCutoffHz / acoustics.nearCutoffHz, progress);
}

export function calculatePropagationDelaySeconds(
  distanceMeters,
  speedOfSoundMps = DEFAULT_SPEED_OF_SOUND_MPS
) {
  if (!Number.isFinite(speedOfSoundMps) || speedOfSoundMps <= 0) {
    throw new TypeError('speedOfSoundMps must be a positive finite number');
  }
  return Math.max(0, finiteOr(distanceMeters, 0)) / speedOfSoundMps;
}

export function calculateVoicePriority({
  basePriority,
  perceivedGain,
  gameplayImportance = 1,
  occluded = false,
  alreadyPlaying = false
}) {
  const audibility = Math.sqrt(clamp01(finiteOr(perceivedGain, 0)));
  const importance = Math.max(0.1, finiteOr(gameplayImportance, 1));
  const occlusionFactor = occluded ? 0.82 : 1;
  const retention = alreadyPlaying ? 1.12 : 1;
  return Math.max(0, finiteOr(basePriority, 0))
    * audibility * importance * occlusionFactor * retention;
}

export function sampleRange(range, random = Math.random, fallback = 1) {
  if (!Array.isArray(range) || range.length !== 2) return fallback;
  const low = finiteOr(range[0], fallback);
  const high = finiteOr(range[1], fallback);
  const t = clamp01(finiteOr(random(), 0.5));
  return low + (high - low) * t;
}

export function chooseVariation(event, random = Math.random) {
  return Object.freeze({
    gain: sampleRange(event?.variation?.gain, random, 1),
    playbackRate: sampleRange(event?.variation?.playbackRate, random, 1),
    filterScale: sampleRange(event?.variation?.filterScale, random, 1)
  });
}

export function createAggregationKey(position, cellSize) {
  if (!position || position.length < 3) return null;
  const size = Math.max(1, finiteOr(cellSize, 180));
  return `${Math.floor(position[0] / size)}:${Math.floor(position[2] / size)}`;
}

export function resolveOcclusionAcoustics(result) {
  if (!result || result.clear !== false) {
    return Object.freeze({ occluded: false, gain: 1, cutoffHz: 20000 });
  }
  const label = String(result.coverType ?? '').toLowerCase();
  const terrain = label.includes('terrain') || label.includes('ridge');
  const vegetation = label.includes('tree') || label.includes('foliage');
  return Object.freeze({
    occluded: true,
    gain: terrain ? 0.42 : vegetation ? 0.7 : 0.54,
    cutoffHz: terrain ? 520 : vegetation ? 1450 : 880
  });
}

export function getAcousticEnvironmentProfile(profileId) {
  return ACOUSTIC_ENVIRONMENT_PROFILES[profileId]
    ?? ACOUSTIC_ENVIRONMENT_PROFILES.openField;
}
