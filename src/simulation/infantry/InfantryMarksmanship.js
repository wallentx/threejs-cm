const MODEL_VERSION = 'individual-infantry-marksmanship-v1';

export const INFANTRY_MARKSMANSHIP_GAMEPLAY_APPROXIMATION =
  'gameplay approximation; individual skill and optic capability factors require historical allocation and field-performance calibration';

export const INFANTRY_MARKSMANSHIP_FACTOR_KEYS = Object.freeze([
  'observationAcquisitionTimeMultiplier',
  'observationRangeMultiplier',
  'aimWorkTimeMultiplier',
  'rangeEstimationErrorMultiplier',
  'dispersionMultiplier',
  'concealmentSignatureMultiplier',
  'shotAimRetentionMultiplier'
]);

const FACTOR_KEY_SET = new Set(INFANTRY_MARKSMANSHIP_FACTOR_KEYS);
const PROFILE_KEYS = new Set([
  'soldierId',
  'opticId',
  'skillFactors',
  'skillDataQuality'
]);
const OPTIC_KEYS = new Set(['id', 'factors', 'dataQuality']);
const INDEX_KEYS = new Set(['profiles', 'opticCapabilities']);

const NEUTRAL_FACTOR_VALUES = Object.freeze(
  Object.fromEntries(
    INFANTRY_MARKSMANSHIP_FACTOR_KEYS.map(key => [key, 1])
  )
);

const NEUTRAL_FACTOR_DATA_QUALITY = Object.freeze(
  Object.fromEntries(
    INFANTRY_MARKSMANSHIP_FACTOR_KEYS.map(key => [
      key,
      'gameplay approximation; neutral compatibility factor preserves existing behavior'
    ])
  )
);

export const NEUTRAL_INFANTRY_MARKSMANSHIP_FACTORS = Object.freeze({
  modelVersion: MODEL_VERSION,
  configured: false,
  opticId: null,
  ...NEUTRAL_FACTOR_VALUES,
  factorDataQuality: NEUTRAL_FACTOR_DATA_QUALITY,
  skillDataQuality:
    'gameplay approximation; no individual skill adjustment configured',
  opticDataQuality:
    'gameplay approximation; no optic capability configured'
});

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertKnownKeys(record, allowed, label) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new TypeError(`${label} contains unsupported field ${key}`);
    }
  }
}

function stableId(value, label) {
  if (typeof value !== 'string'
      || value.trim().length === 0
      || value.includes('\u0000')) {
    throw new TypeError(`${label} must be a non-empty stable string ID`);
  }
  return value;
}

function approximationLabel(value, label) {
  if (typeof value !== 'string'
      || !/gameplay approximation/i.test(value)) {
    throw new TypeError(
      `${label} must explicitly label its numerical factors as gameplay approximations`
    );
  }
  return value;
}

function compareStableIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createFactorSet(input, dataQuality, label) {
  if (input == null) return NEUTRAL_FACTOR_VALUES;
  assertRecord(input, label);
  for (const key of Object.keys(input)) {
    if (!FACTOR_KEY_SET.has(key)) {
      throw new TypeError(`${label} contains unsupported factor ${key}`);
    }
  }
  approximationLabel(dataQuality, `${label} dataQuality`);

  const factors = {};
  for (const key of INFANTRY_MARKSMANSHIP_FACTOR_KEYS) {
    const value = input[key] ?? 1;
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(`${label}.${key} must be finite and greater than zero`);
    }
    factors[key] = value;
  }
  return Object.freeze(factors);
}

function combineFactors(skillFactors, opticFactors) {
  const combined = {};
  for (const key of INFANTRY_MARKSMANSHIP_FACTOR_KEYS) {
    const value = skillFactors[key] * opticFactors[key];
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`combined marksmanship factor ${key} is not representable`);
    }
    combined[key] = value;
  }
  return combined;
}

function frozenLookup(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * Creates one capability record supplied by a family/content layer.
 *
 * The simulation core owns no historical optic IDs or performance values.
 * Callers must inject those records and explicitly label every numerical
 * capability as a gameplay approximation.
 */
export function createInfantryOpticCapability(record) {
  assertRecord(record, 'infantry optic capability');
  assertKnownKeys(record, OPTIC_KEYS, 'infantry optic capability');
  const id = stableId(record.id, 'infantry optic capability id');
  const dataQuality = approximationLabel(
    record.dataQuality,
    `infantry optic capability ${id} dataQuality`
  );
  return Object.freeze({
    id,
    factors: createFactorSet(
      record.factors,
      dataQuality,
      `infantry optic capability ${id} factors`
    ),
    dataQuality
  });
}

/**
 * Creates immutable individual configuration. A profile is a vector of
 * independent abilities, never a role-based "sniper bonus".
 */
export function createInfantryMarksmanshipProfile(record) {
  assertRecord(record, 'infantry marksmanship profile');
  assertKnownKeys(record, PROFILE_KEYS, 'infantry marksmanship profile');
  const soldierId = stableId(
    record.soldierId,
    'infantry marksmanship profile soldierId'
  );
  const opticId = record.opticId == null
    ? null
    : stableId(record.opticId, `infantry marksmanship profile ${soldierId} opticId`);
  const usesExplicitSkillFactors = record.skillFactors != null;
  const skillDataQuality = usesExplicitSkillFactors
    ? approximationLabel(
        record.skillDataQuality,
        `infantry marksmanship profile ${soldierId} skillDataQuality`
      )
    : 'gameplay approximation; no individual skill adjustment configured';

  return Object.freeze({
    modelVersion: MODEL_VERSION,
    soldierId,
    opticId,
    skillFactors: createFactorSet(
      record.skillFactors,
      skillDataQuality,
      `infantry marksmanship profile ${soldierId} skillFactors`
    ),
    skillDataQuality
  });
}

/**
 * Builds a deeply frozen, stable-ID-keyed index. Profiles may be supplied in
 * any order. An optic reference that is not present in the injected capability
 * set fails closed during construction; an unconfigured soldier resolves to
 * the neutral compatibility factors.
 */
export function createInfantryMarksmanshipIndex(input = {}) {
  assertRecord(input, 'infantry marksmanship index');
  assertKnownKeys(input, INDEX_KEYS, 'infantry marksmanship index');
  const {
    profiles = [],
    opticCapabilities = []
  } = input;
  if (!Array.isArray(profiles)) {
    throw new TypeError('infantry marksmanship profiles must be an array');
  }
  if (!Array.isArray(opticCapabilities)) {
    throw new TypeError('infantry optic capabilities must be an array');
  }

  const capabilities = opticCapabilities
    .map(createInfantryOpticCapability)
    .sort((left, right) => compareStableIds(left.id, right.id));
  const opticCapabilitiesById = Object.create(null);
  for (const capability of capabilities) {
    if (Object.hasOwn(opticCapabilitiesById, capability.id)) {
      throw new Error(`duplicate infantry optic capability ${capability.id}`);
    }
    opticCapabilitiesById[capability.id] = capability;
  }

  const normalizedProfiles = profiles
    .map(createInfantryMarksmanshipProfile)
    .sort((left, right) => compareStableIds(left.soldierId, right.soldierId));
  const profilesBySoldierId = Object.create(null);
  const factorsBySoldierId = Object.create(null);
  for (const profile of normalizedProfiles) {
    if (Object.hasOwn(profilesBySoldierId, profile.soldierId)) {
      throw new Error(`duplicate infantry marksmanship profile ${profile.soldierId}`);
    }
    const optic = profile.opticId != null
      && Object.hasOwn(opticCapabilitiesById, profile.opticId)
      ? opticCapabilitiesById[profile.opticId]
      : null;
    if (profile.opticId != null && !optic) {
      throw new Error(
        `infantry marksmanship profile ${profile.soldierId} references unknown optic ${profile.opticId}`
      );
    }
    const combined = combineFactors(
      profile.skillFactors,
      optic?.factors ?? NEUTRAL_FACTOR_VALUES
    );
    const factorDataQuality = Object.freeze(
      Object.fromEntries(
        INFANTRY_MARKSMANSHIP_FACTOR_KEYS.map(key => [
          key,
          INFANTRY_MARKSMANSHIP_GAMEPLAY_APPROXIMATION
        ])
      )
    );
    profilesBySoldierId[profile.soldierId] = profile;
    factorsBySoldierId[profile.soldierId] = Object.freeze({
      modelVersion: MODEL_VERSION,
      configured: true,
      opticId: profile.opticId,
      ...combined,
      factorDataQuality,
      skillDataQuality: profile.skillDataQuality,
      opticDataQuality: optic?.dataQuality
        ?? 'gameplay approximation; no optic capability configured'
    });
  }

  return Object.freeze({
    modelVersion: MODEL_VERSION,
    soldierIds: Object.freeze(
      normalizedProfiles.map(profile => profile.soldierId)
    ),
    opticIds: Object.freeze(capabilities.map(capability => capability.id)),
    profilesBySoldierId: frozenLookup(
      Object.entries(profilesBySoldierId)
    ),
    opticCapabilitiesById: frozenLookup(
      Object.entries(opticCapabilitiesById)
    ),
    factorsBySoldierId: frozenLookup(
      Object.entries(factorsBySoldierId)
    )
  });
}

function assertIndex(index) {
  assertRecord(index, 'infantry marksmanship index');
  if (index.modelVersion !== MODEL_VERSION
      || !index.profilesBySoldierId
      || typeof index.profilesBySoldierId !== 'object'
      || !index.factorsBySoldierId
      || typeof index.factorsBySoldierId !== 'object') {
    throw new TypeError('infantry marksmanship index has an invalid model contract');
  }
}

export function getInfantryMarksmanshipProfile(index, soldierId) {
  assertIndex(index);
  const id = stableId(soldierId, 'infantry marksmanship soldierId');
  return Object.hasOwn(index.profilesBySoldierId, id)
    ? index.profilesBySoldierId[id]
    : null;
}

export function resolveInfantryMarksmanshipFactors(index, soldierId) {
  assertIndex(index);
  const id = stableId(soldierId, 'infantry marksmanship soldierId');
  return Object.hasOwn(index.factorsBySoldierId, id)
    ? index.factorsBySoldierId[id]
    : NEUTRAL_INFANTRY_MARKSMANSHIP_FACTORS;
}

export { MODEL_VERSION as INFANTRY_MARKSMANSHIP_MODEL_VERSION };
