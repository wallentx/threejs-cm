const SCHEMA_VERSION = 1;
const DEFAULT_EVENT_LIMIT = 64;
const DEFAULT_INTENT_HISTORY_LIMIT = 128;
const MAX_EVENT_LIMIT = 1024;
const MAX_INTENT_HISTORY_LIMIT = 4096;
const MAX_SECTIONS = 256;
const MAX_ADJACENCIES = 2048;
const MAX_ADVANCE_TICKS = 600;
const MAX_OCCUPANTS = 128;
const MAX_UNITS = 1_000_000;
const UNSAFE_RECORD_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const EVENT_TYPES = new Set([
  'damage_heat_applied',
  'extinguish_applied',
  'section_ignited',
  'section_extinguished',
  'section_burned_out'
]);

/**
 * Hazard timings, intensities, and thresholds deliberately use abstract units.
 * They are first-order gameplay approximations, not fire-engineering claims.
 */
export const BUILDING_HAZARD_APPROXIMATION = 'gameplay_approximation';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainRecord(value, path) {
  if (!isPlainRecord(value)) throw new TypeError(`${path} must be a plain record`);
}

function requireExactKeys(record, expected, path) {
  const expectedKeys = new Set(expected);
  for (const key of Object.keys(record)) {
    if (!expectedKeys.has(key)) throw new Error(`${path}.${key} is not supported`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(record, key)) throw new Error(`${path}.${key} is required`);
  }
}

function stableId(value, path, { recordKey = false } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  if (recordKey && UNSAFE_RECORD_IDS.has(value)) {
    throw new Error(`${path} is not safe as a record key`);
  }
  return value;
}

function compareId(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function safeInteger(value, path, {
  minimum = 0,
  maximum = MAX_UNITS
} = {}) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(
      `${path} must be a safe integer within [${minimum}, ${maximum}]`
    );
  }
  return value;
}

function finitePositive(value, path) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be finite and positive`);
  }
  return value;
}

function normalizePolicy(policy, path) {
  requirePlainRecord(policy, path);
  const keys = [
    'tickDurationSeconds',
    'maxHeatUnits',
    'maxFireIntensityUnits',
    'maxSmokeUnits',
    'initialFireIntensityUnits',
    'fireGrowthUnitsPerTick',
    'burningHeatUnitsPerTick',
    'fuelBurnUnitsPerTick',
    'smokeGenerationUnitsPerTick',
    'passiveHeatCoolingUnitsPerTick',
    'smokeDissipationUnitsPerTick',
    'occupantFireThresholdUnits',
    'occupantSmokeThresholdUnits',
    'occupantFireDamageUnitsPerTick',
    'occupantSmokeExposureUnitsPerTick'
  ];
  requireExactKeys(policy, keys, path);

  const normalized = {
    tickDurationSeconds: finitePositive(
      policy.tickDurationSeconds,
      `${path}.tickDurationSeconds`
    ),
    maxHeatUnits: safeInteger(
      policy.maxHeatUnits,
      `${path}.maxHeatUnits`,
      { minimum: 1 }
    ),
    maxFireIntensityUnits: safeInteger(
      policy.maxFireIntensityUnits,
      `${path}.maxFireIntensityUnits`,
      { minimum: 1 }
    ),
    maxSmokeUnits: safeInteger(
      policy.maxSmokeUnits,
      `${path}.maxSmokeUnits`,
      { minimum: 1 }
    ),
    initialFireIntensityUnits: safeInteger(
      policy.initialFireIntensityUnits,
      `${path}.initialFireIntensityUnits`,
      { minimum: 1 }
    ),
    fireGrowthUnitsPerTick: safeInteger(
      policy.fireGrowthUnitsPerTick,
      `${path}.fireGrowthUnitsPerTick`
    ),
    burningHeatUnitsPerTick: safeInteger(
      policy.burningHeatUnitsPerTick,
      `${path}.burningHeatUnitsPerTick`
    ),
    fuelBurnUnitsPerTick: safeInteger(
      policy.fuelBurnUnitsPerTick,
      `${path}.fuelBurnUnitsPerTick`,
      { minimum: 1 }
    ),
    smokeGenerationUnitsPerTick: safeInteger(
      policy.smokeGenerationUnitsPerTick,
      `${path}.smokeGenerationUnitsPerTick`
    ),
    passiveHeatCoolingUnitsPerTick: safeInteger(
      policy.passiveHeatCoolingUnitsPerTick,
      `${path}.passiveHeatCoolingUnitsPerTick`
    ),
    smokeDissipationUnitsPerTick: safeInteger(
      policy.smokeDissipationUnitsPerTick,
      `${path}.smokeDissipationUnitsPerTick`
    ),
    occupantFireThresholdUnits: safeInteger(
      policy.occupantFireThresholdUnits,
      `${path}.occupantFireThresholdUnits`,
      { minimum: 1 }
    ),
    occupantSmokeThresholdUnits: safeInteger(
      policy.occupantSmokeThresholdUnits,
      `${path}.occupantSmokeThresholdUnits`,
      { minimum: 1 }
    ),
    occupantFireDamageUnitsPerTick: safeInteger(
      policy.occupantFireDamageUnitsPerTick,
      `${path}.occupantFireDamageUnitsPerTick`
    ),
    occupantSmokeExposureUnitsPerTick: safeInteger(
      policy.occupantSmokeExposureUnitsPerTick,
      `${path}.occupantSmokeExposureUnitsPerTick`
    )
  };

  if (normalized.initialFireIntensityUnits > normalized.maxFireIntensityUnits) {
    throw new Error(
      `${path}.initialFireIntensityUnits cannot exceed maxFireIntensityUnits`
    );
  }
  if (normalized.occupantFireThresholdUnits > normalized.maxFireIntensityUnits) {
    throw new Error(
      `${path}.occupantFireThresholdUnits cannot exceed maxFireIntensityUnits`
    );
  }
  if (normalized.occupantSmokeThresholdUnits > normalized.maxSmokeUnits) {
    throw new Error(
      `${path}.occupantSmokeThresholdUnits cannot exceed maxSmokeUnits`
    );
  }
  return normalized;
}

/**
 * Validate and freeze one renderer-neutral hazard definition.
 *
 * Every combustible flag and directed spread edge is authored explicitly.
 * The system never derives either value from a mesh, material name, room, or
 * structural section kind.
 */
export function normalizeBuildingHazardDefinition(definition) {
  requirePlainRecord(definition, 'Building hazard definition');
  requireExactKeys(
    definition,
    ['id', 'approximation', 'policy', 'sections', 'adjacency'],
    'Building hazard definition'
  );
  const id = stableId(definition.id, 'Building hazard definition.id');
  if (definition.approximation !== BUILDING_HAZARD_APPROXIMATION) {
    throw new Error(
      `Building hazard definition.approximation must be ${BUILDING_HAZARD_APPROXIMATION}`
    );
  }
  if (
    !Array.isArray(definition.sections)
    || definition.sections.length === 0
    || definition.sections.length > MAX_SECTIONS
  ) {
    throw new Error(
      `Building hazard definition.sections must contain 1-${MAX_SECTIONS} records`
    );
  }
  if (
    !Array.isArray(definition.adjacency)
    || definition.adjacency.length > MAX_ADJACENCIES
  ) {
    throw new Error(
      `Building hazard definition.adjacency must contain at most ${MAX_ADJACENCIES} records`
    );
  }

  const policy = normalizePolicy(
    definition.policy,
    'Building hazard definition.policy'
  );
  const sectionIds = new Set();
  const sections = definition.sections.map((section, index) => {
    const path = `Building hazard definition.sections[${index}]`;
    requirePlainRecord(section, path);
    requireExactKeys(
      section,
      ['id', 'combustible', 'fuelUnits', 'ignitionHeatUnits'],
      path
    );
    const sectionId = stableId(section.id, `${path}.id`, { recordKey: true });
    if (sectionIds.has(sectionId)) {
      throw new Error(`Building hazard definition has duplicate section id ${sectionId}`);
    }
    if (typeof section.combustible !== 'boolean') {
      throw new Error(`${path}.combustible must be boolean`);
    }
    const fuelUnits = safeInteger(section.fuelUnits, `${path}.fuelUnits`);
    const ignitionHeatUnits = safeInteger(
      section.ignitionHeatUnits,
      `${path}.ignitionHeatUnits`,
      { minimum: 1, maximum: policy.maxHeatUnits }
    );
    if (section.combustible && fuelUnits === 0) {
      throw new Error(`${path}.fuelUnits must be positive for a combustible section`);
    }
    if (!section.combustible && fuelUnits !== 0) {
      throw new Error(`${path}.fuelUnits must be zero for a non-combustible section`);
    }
    sectionIds.add(sectionId);
    return {
      id: sectionId,
      combustible: section.combustible,
      fuelUnits,
      ignitionHeatUnits
    };
  });
  sections.sort((a, b) => compareId(a.id, b.id));

  const adjacencyIds = new Set();
  const directedPairs = new Set();
  const adjacency = definition.adjacency.map((edge, index) => {
    const path = `Building hazard definition.adjacency[${index}]`;
    requirePlainRecord(edge, path);
    requireExactKeys(
      edge,
      ['id', 'fromSectionId', 'toSectionId', 'heatTransferUnitsPerTick'],
      path
    );
    const edgeId = stableId(edge.id, `${path}.id`);
    const fromSectionId = stableId(
      edge.fromSectionId,
      `${path}.fromSectionId`
    );
    const toSectionId = stableId(edge.toSectionId, `${path}.toSectionId`);
    if (adjacencyIds.has(edgeId)) {
      throw new Error(`Building hazard definition has duplicate adjacency id ${edgeId}`);
    }
    if (!sectionIds.has(fromSectionId) || !sectionIds.has(toSectionId)) {
      throw new Error(`${path} references an unknown section`);
    }
    if (fromSectionId === toSectionId) {
      throw new Error(`${path} cannot connect a section to itself`);
    }
    const pair = `${fromSectionId}\u0000${toSectionId}`;
    if (directedPairs.has(pair)) {
      throw new Error(
        `${path} duplicates directed adjacency ${fromSectionId} -> ${toSectionId}`
      );
    }
    adjacencyIds.add(edgeId);
    directedPairs.add(pair);
    return {
      id: edgeId,
      fromSectionId,
      toSectionId,
      heatTransferUnitsPerTick: safeInteger(
        edge.heatTransferUnitsPerTick,
        `${path}.heatTransferUnitsPerTick`,
        { minimum: 1 }
      )
    };
  });
  adjacency.sort((a, b) => (
    compareId(a.fromSectionId, b.fromSectionId)
    || compareId(a.toSectionId, b.toSectionId)
    || compareId(a.id, b.id)
  ));

  return deepFreeze({
    id,
    approximation: BUILDING_HAZARD_APPROXIMATION,
    policy,
    sections,
    adjacency
  });
}

function createBuildingHazardState(definition) {
  const sections = {};
  for (const section of definition.sections) {
    sections[section.id] = {
      heatUnits: 0,
      fireIntensityUnits: 0,
      smokeUnits: 0,
      fuelUnits: section.fuelUnits,
      burning: false,
      burnedOut: false
    };
  }
  return {
    id: definition.id,
    tick: 0,
    sections,
    processedIntentIds: [],
    eventVersion: 0,
    events: []
  };
}

function normalizeIntentBase(intent, kind) {
  requirePlainRecord(intent, `${kind} intent`);
  stableId(intent.intentId, `${kind} intent.intentId`);
  stableId(intent.buildingId, `${kind} intent.buildingId`);
  stableId(intent.sectionId, `${kind} intent.sectionId`);
  if (typeof intent.accepted !== 'boolean') {
    throw new Error(`${kind} intent.accepted must be boolean`);
  }
  stableId(intent.cause, `${kind} intent.cause`);
}

function normalizeOccupants(occupants, definition) {
  if (!Array.isArray(occupants) || occupants.length > MAX_OCCUPANTS) {
    throw new Error(`occupants must be an array with at most ${MAX_OCCUPANTS} records`);
  }
  const sectionIds = new Set(definition.sections.map(section => section.id));
  const occupantIds = new Set();
  const normalized = occupants.map((occupant, index) => {
    const path = `occupants[${index}]`;
    requirePlainRecord(occupant, path);
    requireExactKeys(occupant, ['occupantId', 'sectionId'], path);
    const occupantId = stableId(occupant.occupantId, `${path}.occupantId`);
    const sectionId = stableId(occupant.sectionId, `${path}.sectionId`);
    if (occupantIds.has(occupantId)) {
      throw new Error(`occupants has duplicate occupantId ${occupantId}`);
    }
    if (!sectionIds.has(sectionId)) {
      throw new Error(`${path}.sectionId references unknown section ${sectionId}`);
    }
    occupantIds.add(occupantId);
    return { occupantId, sectionId };
  });
  normalized.sort((a, b) => (
    compareId(a.occupantId, b.occupantId)
    || compareId(a.sectionId, b.sectionId)
  ));
  return normalized;
}

export class BuildingHazardSystem {
  constructor({
    eventLimit = DEFAULT_EVENT_LIMIT,
    intentHistoryLimit = DEFAULT_INTENT_HISTORY_LIMIT
  } = {}) {
    this.eventLimit = safeInteger(
      eventLimit,
      'eventLimit',
      { minimum: 1, maximum: MAX_EVENT_LIMIT }
    );
    this.intentHistoryLimit = safeInteger(
      intentHistoryLimit,
      'intentHistoryLimit',
      { minimum: 1, maximum: MAX_INTENT_HISTORY_LIMIT }
    );
    this.definitions = new Map();
    this.buildings = new Map();
  }

  addBuilding(definition) {
    const normalized = normalizeBuildingHazardDefinition(definition);
    if (this.buildings.has(normalized.id)) {
      throw new Error(`Building hazard state ${normalized.id} already exists`);
    }
    this.definitions.set(normalized.id, normalized);
    this.buildings.set(normalized.id, createBuildingHazardState(normalized));
    return this.getBuildingSnapshot(normalized.id);
  }

  removeBuilding(id) {
    const buildingId = String(id);
    this.definitions.delete(buildingId);
    return this.buildings.delete(buildingId);
  }

  getBuildingIds() {
    return [...this.buildings.keys()].sort(compareId);
  }

  getDefinition(id) {
    return this.#definition(String(id));
  }

  getBuildingSnapshot(id) {
    const buildingId = String(id);
    const definition = this.#definition(buildingId);
    return {
      ...clone(this.#state(buildingId)),
      approximation: definition.approximation,
      tickDurationSeconds: definition.policy.tickDurationSeconds
    };
  }

  getEvents(id, afterVersion = 0) {
    if (!Number.isSafeInteger(afterVersion) || afterVersion < 0) {
      throw new Error('afterVersion must be a non-negative safe integer');
    }
    const state = this.#state(String(id));
    const oldestAvailableVersion = state.events[0]?.version
      ?? state.eventVersion + 1;
    return {
      buildingId: state.id,
      eventVersion: state.eventVersion,
      oldestAvailableVersion,
      truncated: afterVersion < oldestAvailableVersion - 1,
      events: state.events
        .filter(event => event.version > afterVersion)
        .map(clone)
    };
  }

  applyDamageIntent(intent) {
    normalizeIntentBase(intent, 'Damage');
    requireExactKeys(
      intent,
      ['intentId', 'buildingId', 'sectionId', 'accepted', 'cause', 'heatUnits'],
      'Damage intent'
    );
    safeInteger(intent.heatUnits, 'Damage intent.heatUnits');
    if (intent.accepted && intent.heatUnits === 0) {
      throw new Error('Damage intent.heatUnits must be positive when accepted');
    }
    const state = this.#state(intent.buildingId);
    const definition = this.#definition(intent.buildingId);
    const section = this.#sectionDefinition(definition, intent.sectionId);
    if (!intent.accepted) {
      return {
        processed: false,
        reason: 'damage_not_accepted',
        events: []
      };
    }
    if (state.processedIntentIds.includes(intent.intentId)) {
      return {
        processed: false,
        reason: 'duplicate_intent',
        events: []
      };
    }

    this.#rememberIntent(state, intent.intentId);
    const runtime = state.sections[section.id];
    const beforeHeat = runtime.heatUnits;
    runtime.heatUnits = Math.min(
      definition.policy.maxHeatUnits,
      runtime.heatUnits + intent.heatUnits
    );
    const emitted = [];
    const appliedHeatUnits = runtime.heatUnits - beforeHeat;
    if (appliedHeatUnits > 0) {
      this.#event(state, definition, {
        type: 'damage_heat_applied',
        sectionId: section.id,
        intentId: intent.intentId,
        cause: intent.cause,
        appliedHeatUnits
      }, emitted);
    }
    const ignited = this.#tryIgnite(
      state,
      definition,
      section,
      {
        cause: 'accepted_damage',
        sourceIntentId: intent.intentId,
        damageCause: intent.cause
      },
      emitted
    );
    return {
      processed: true,
      reason: null,
      buildingId: state.id,
      sectionId: section.id,
      appliedHeatUnits,
      ignited,
      events: emitted.map(clone)
    };
  }

  applyExtinguishIntent(intent) {
    normalizeIntentBase(intent, 'Extinguish');
    requireExactKeys(
      intent,
      [
        'intentId',
        'buildingId',
        'sectionId',
        'accepted',
        'cause',
        'coolingUnits',
        'fireSuppressionUnits',
        'smokeRemovalUnits'
      ],
      'Extinguish intent'
    );
    const coolingUnits = safeInteger(
      intent.coolingUnits,
      'Extinguish intent.coolingUnits'
    );
    const fireSuppressionUnits = safeInteger(
      intent.fireSuppressionUnits,
      'Extinguish intent.fireSuppressionUnits'
    );
    const smokeRemovalUnits = safeInteger(
      intent.smokeRemovalUnits,
      'Extinguish intent.smokeRemovalUnits'
    );
    if (
      intent.accepted
      && coolingUnits + fireSuppressionUnits + smokeRemovalUnits === 0
    ) {
      throw new Error('Accepted extinguish intent must apply at least one unit');
    }
    const state = this.#state(intent.buildingId);
    const definition = this.#definition(intent.buildingId);
    const section = this.#sectionDefinition(definition, intent.sectionId);
    if (!intent.accepted) {
      return {
        processed: false,
        reason: 'extinguish_not_accepted',
        events: []
      };
    }
    if (state.processedIntentIds.includes(intent.intentId)) {
      return {
        processed: false,
        reason: 'duplicate_intent',
        events: []
      };
    }

    this.#rememberIntent(state, intent.intentId);
    const runtime = state.sections[section.id];
    const wasBurning = runtime.burning;
    const appliedCoolingUnits = Math.min(runtime.heatUnits, coolingUnits);
    const appliedFireSuppressionUnits = Math.min(
      runtime.fireIntensityUnits,
      fireSuppressionUnits
    );
    const appliedSmokeRemovalUnits = Math.min(
      runtime.smokeUnits,
      smokeRemovalUnits
    );
    runtime.heatUnits -= appliedCoolingUnits;
    runtime.fireIntensityUnits -= appliedFireSuppressionUnits;
    runtime.smokeUnits -= appliedSmokeRemovalUnits;
    if (runtime.burning && runtime.fireIntensityUnits === 0) {
      runtime.burning = false;
    }

    const emitted = [];
    this.#event(state, definition, {
      type: 'extinguish_applied',
      sectionId: section.id,
      intentId: intent.intentId,
      cause: intent.cause,
      appliedCoolingUnits,
      appliedFireSuppressionUnits,
      appliedSmokeRemovalUnits
    }, emitted);
    if (wasBurning && !runtime.burning) {
      this.#event(state, definition, {
        type: 'section_extinguished',
        sectionId: section.id,
        intentId: intent.intentId,
        cause: intent.cause
      }, emitted);
    }
    return {
      processed: true,
      reason: null,
      buildingId: state.id,
      sectionId: section.id,
      extinguished: wasBurning && !runtime.burning,
      appliedCoolingUnits,
      appliedFireSuppressionUnits,
      appliedSmokeRemovalUnits,
      events: emitted.map(clone)
    };
  }

  /**
   * Advance authoritative hazard time by canonical integer ticks.
   *
   * Callers should advance one tick per matching fixed simulation step, or
   * batch any integer number of those same ticks. No wall-clock conversion or
   * fractional accumulator exists inside this owner.
   */
  advanceTicks(id, tickCount, { occupants = [] } = {}) {
    safeInteger(
      tickCount,
      'tickCount',
      { maximum: MAX_ADVANCE_TICKS }
    );
    const buildingId = String(id);
    const state = this.#state(buildingId);
    const definition = this.#definition(buildingId);
    const normalizedOccupants = normalizeOccupants(occupants, definition);
    const emitted = [];
    const occupantHazardIntents = [];
    const fromTick = state.tick;

    for (let index = 0; index < tickCount; index++) {
      state.tick += 1;
      this.#advanceOneTick(state, definition, emitted);
      this.#appendOccupantHazardIntents(
        state,
        definition,
        normalizedOccupants,
        occupantHazardIntents
      );
    }

    return {
      buildingId,
      fromTick,
      toTick: state.tick,
      ticksAdvanced: tickCount,
      events: emitted.map(clone),
      occupantHazardIntents
    };
  }

  captureState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      buildings: this.getBuildingIds().map(id => clone(this.#state(id)))
    };
  }

  restoreState(saved) {
    requirePlainRecord(saved, 'Building hazard saved state');
    requireExactKeys(
      saved,
      ['schemaVersion', 'buildings'],
      'Building hazard saved state'
    );
    if (saved.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(
        `Unsupported building hazard schemaVersion ${saved.schemaVersion}`
      );
    }
    if (!Array.isArray(saved.buildings)) {
      throw new Error('Building hazard saved state.buildings must be an array');
    }

    const expectedIds = this.getBuildingIds();
    const restored = new Map();
    for (let index = 0; index < saved.buildings.length; index++) {
      const record = this.#validateSavedBuilding(
        saved.buildings[index],
        `Building hazard saved state.buildings[${index}]`
      );
      if (restored.has(record.id)) {
        throw new Error(`Building hazard saved state has duplicate building ${record.id}`);
      }
      restored.set(record.id, record);
    }
    const restoredIds = [...restored.keys()].sort(compareId);
    if (
      restoredIds.length !== expectedIds.length
      || restoredIds.some((id, index) => id !== expectedIds[index])
    ) {
      throw new Error(
        'Building hazard saved state must contain exactly the registered buildings'
      );
    }
    this.buildings = restored;
  }

  #advanceOneTick(state, definition, emitted) {
    const transfers = new Map(
      definition.sections.map(section => [section.id, 0])
    );
    const spreadSources = new Map(
      definition.sections.map(section => [section.id, []])
    );

    for (const edge of definition.adjacency) {
      const source = state.sections[edge.fromSectionId];
      if (!source.burning || source.fireIntensityUnits === 0) continue;
      const transferred = Math.min(
        edge.heatTransferUnitsPerTick,
        source.fireIntensityUnits
      );
      if (transferred === 0) continue;
      transfers.set(
        edge.toSectionId,
        transfers.get(edge.toSectionId) + transferred
      );
      spreadSources.get(edge.toSectionId).push(edge.fromSectionId);
    }

    for (const section of definition.sections) {
      const runtime = state.sections[section.id];
      if (runtime.burning) {
        const consumed = Math.min(
          runtime.fuelUnits,
          definition.policy.fuelBurnUnitsPerTick
        );
        runtime.fuelUnits -= consumed;
        runtime.heatUnits = Math.min(
          definition.policy.maxHeatUnits,
          runtime.heatUnits + definition.policy.burningHeatUnitsPerTick
        );
        runtime.smokeUnits = Math.min(
          definition.policy.maxSmokeUnits,
          Math.max(
            0,
            runtime.smokeUnits
              + definition.policy.smokeGenerationUnitsPerTick
              - definition.policy.smokeDissipationUnitsPerTick
          )
        );
        runtime.fireIntensityUnits = Math.min(
          definition.policy.maxFireIntensityUnits,
          runtime.fireIntensityUnits
            + definition.policy.fireGrowthUnitsPerTick
        );
        if (runtime.fuelUnits === 0) {
          runtime.burning = false;
          runtime.burnedOut = true;
          runtime.fireIntensityUnits = 0;
          this.#event(state, definition, {
            type: 'section_burned_out',
            sectionId: section.id,
            cause: 'fuel_exhausted'
          }, emitted);
        }
      } else {
        runtime.heatUnits = Math.max(
          0,
          runtime.heatUnits
            - definition.policy.passiveHeatCoolingUnitsPerTick
        );
        runtime.smokeUnits = Math.max(
          0,
          runtime.smokeUnits
            - definition.policy.smokeDissipationUnitsPerTick
        );
      }
    }

    for (const section of definition.sections) {
      const runtime = state.sections[section.id];
      runtime.heatUnits = Math.min(
        definition.policy.maxHeatUnits,
        runtime.heatUnits + transfers.get(section.id)
      );
    }

    for (const section of definition.sections) {
      const sources = [...new Set(spreadSources.get(section.id))]
        .sort(compareId);
      this.#tryIgnite(
        state,
        definition,
        section,
        {
          cause: sources.length > 0 ? 'adjacent_fire_spread' : 'retained_heat',
          sourceSectionIds: sources
        },
        emitted
      );
    }
  }

  #appendOccupantHazardIntents(
    state,
    definition,
    occupants,
    output
  ) {
    const policy = definition.policy;
    for (const occupant of occupants) {
      const section = state.sections[occupant.sectionId];
      const fireSteps = Math.floor(
        section.fireIntensityUnits / policy.occupantFireThresholdUnits
      );
      const smokeSteps = Math.floor(
        section.smokeUnits / policy.occupantSmokeThresholdUnits
      );
      const fireDamageUnits = fireSteps
        * policy.occupantFireDamageUnitsPerTick;
      const smokeExposureUnits = smokeSteps
        * policy.occupantSmokeExposureUnitsPerTick;
      if (fireDamageUnits === 0 && smokeExposureUnits === 0) continue;
      output.push({
        type: 'building_occupant_hazard',
        intentId: `${state.id}:hazard:${state.tick}:${occupant.occupantId}`,
        buildingId: state.id,
        sectionId: occupant.sectionId,
        occupantId: occupant.occupantId,
        tick: state.tick,
        fireDamageUnits,
        smokeExposureUnits,
        approximation: definition.approximation
      });
    }
  }

  #tryIgnite(state, definition, section, details, emitted) {
    const runtime = state.sections[section.id];
    if (
      runtime.burning
      || runtime.burnedOut
      || !section.combustible
      || runtime.fuelUnits === 0
      || runtime.heatUnits < section.ignitionHeatUnits
    ) {
      return false;
    }
    runtime.burning = true;
    runtime.fireIntensityUnits = definition.policy.initialFireIntensityUnits;
    this.#event(state, definition, {
      type: 'section_ignited',
      sectionId: section.id,
      ...details
    }, emitted);
    return true;
  }

  #event(state, definition, event, emitted) {
    state.eventVersion += 1;
    const record = {
      ...event,
      buildingId: state.id,
      tick: state.tick,
      version: state.eventVersion,
      approximation: definition.approximation
    };
    state.events.push(record);
    if (state.events.length > this.eventLimit) state.events.shift();
    emitted.push(record);
  }

  #rememberIntent(state, intentId) {
    state.processedIntentIds.push(intentId);
    if (state.processedIntentIds.length > this.intentHistoryLimit) {
      state.processedIntentIds.shift();
    }
  }

  #validateSavedBuilding(saved, path) {
    requirePlainRecord(saved, path);
    requireExactKeys(
      saved,
      [
        'id',
        'tick',
        'sections',
        'processedIntentIds',
        'eventVersion',
        'events'
      ],
      path
    );
    const id = stableId(saved.id, `${path}.id`);
    const definition = this.#definition(id);
    const tick = safeInteger(
      saved.tick,
      `${path}.tick`,
      { maximum: Number.MAX_SAFE_INTEGER }
    );
    const eventVersion = safeInteger(
      saved.eventVersion,
      `${path}.eventVersion`,
      { maximum: Number.MAX_SAFE_INTEGER }
    );
    requirePlainRecord(saved.sections, `${path}.sections`);
    const expectedSectionIds = definition.sections.map(section => section.id);
    const savedSectionIds = Object.keys(saved.sections).sort(compareId);
    if (
      savedSectionIds.length !== expectedSectionIds.length
      || savedSectionIds.some((idValue, index) => (
        idValue !== expectedSectionIds[index]
      ))
    ) {
      throw new Error(`${path}.sections must exactly match the registered definition`);
    }

    const sections = {};
    for (const section of definition.sections) {
      const runtimePath = `${path}.sections.${section.id}`;
      const runtime = saved.sections[section.id];
      requirePlainRecord(runtime, runtimePath);
      requireExactKeys(
        runtime,
        [
          'heatUnits',
          'fireIntensityUnits',
          'smokeUnits',
          'fuelUnits',
          'burning',
          'burnedOut'
        ],
        runtimePath
      );
      const normalized = {
        heatUnits: safeInteger(
          runtime.heatUnits,
          `${runtimePath}.heatUnits`,
          { maximum: definition.policy.maxHeatUnits }
        ),
        fireIntensityUnits: safeInteger(
          runtime.fireIntensityUnits,
          `${runtimePath}.fireIntensityUnits`,
          { maximum: definition.policy.maxFireIntensityUnits }
        ),
        smokeUnits: safeInteger(
          runtime.smokeUnits,
          `${runtimePath}.smokeUnits`,
          { maximum: definition.policy.maxSmokeUnits }
        ),
        fuelUnits: safeInteger(
          runtime.fuelUnits,
          `${runtimePath}.fuelUnits`,
          { maximum: section.fuelUnits }
        ),
        burning: runtime.burning,
        burnedOut: runtime.burnedOut
      };
      if (
        typeof normalized.burning !== 'boolean'
        || typeof normalized.burnedOut !== 'boolean'
      ) {
        throw new Error(`${runtimePath} burning flags must be boolean`);
      }
      if (
        normalized.burning
        && (
          !section.combustible
          || normalized.burnedOut
          || normalized.fuelUnits === 0
          || normalized.fireIntensityUnits === 0
        )
      ) {
        throw new Error(`${runtimePath} has an invalid burning state`);
      }
      if (!normalized.burning && normalized.fireIntensityUnits !== 0) {
        throw new Error(`${runtimePath} has fire intensity while not burning`);
      }
      if (
        normalized.burnedOut
        && (!section.combustible || normalized.fuelUnits !== 0)
      ) {
        throw new Error(`${runtimePath} has an invalid burned-out state`);
      }
      if (
        section.combustible
        && normalized.fuelUnits === 0
        && !normalized.burnedOut
      ) {
        throw new Error(`${runtimePath} exhausted fuel without burned-out state`);
      }
      sections[section.id] = normalized;
    }

    if (
      !Array.isArray(saved.processedIntentIds)
      || saved.processedIntentIds.length > this.intentHistoryLimit
    ) {
      throw new Error(
        `${path}.processedIntentIds must contain at most ${this.intentHistoryLimit} IDs`
      );
    }
    const intentIds = new Set();
    const processedIntentIds = saved.processedIntentIds.map(
      (intentId, index) => {
        const normalized = stableId(
          intentId,
          `${path}.processedIntentIds[${index}]`
        );
        if (intentIds.has(normalized)) {
          throw new Error(`${path}.processedIntentIds contains duplicate ${normalized}`);
        }
        intentIds.add(normalized);
        return normalized;
      }
    );

    if (!Array.isArray(saved.events) || saved.events.length > this.eventLimit) {
      throw new Error(`${path}.events exceeds the configured event limit`);
    }
    let priorVersion = 0;
    const events = saved.events.map((event, index) => {
      const eventPath = `${path}.events[${index}]`;
      requirePlainRecord(event, eventPath);
      if (!EVENT_TYPES.has(event.type)) {
        throw new Error(`${eventPath}.type is invalid`);
      }
      if (event.buildingId !== id) {
        throw new Error(`${eventPath}.buildingId does not match ${id}`);
      }
      this.#sectionDefinition(definition, event.sectionId);
      if (event.approximation !== definition.approximation) {
        throw new Error(`${eventPath}.approximation is invalid`);
      }
      const version = safeInteger(
        event.version,
        `${eventPath}.version`,
        { minimum: 1, maximum: eventVersion }
      );
      if (version <= priorVersion) {
        throw new Error(`${eventPath}.version must increase strictly`);
      }
      priorVersion = version;
      safeInteger(
        event.tick,
        `${eventPath}.tick`,
        { maximum: tick }
      );
      return clone(event);
    });
    if (events.length > 0 && events.at(-1).version !== eventVersion) {
      throw new Error(`${path}.eventVersion must match the newest retained event`);
    }
    if (events.length === 0 && eventVersion !== 0) {
      throw new Error(`${path}.eventVersion cannot be non-zero without events`);
    }

    return {
      id,
      tick,
      sections,
      processedIntentIds,
      eventVersion,
      events
    };
  }

  #sectionDefinition(definition, sectionId) {
    const normalized = String(sectionId);
    const section = definition.sections.find(record => record.id === normalized);
    if (!section) {
      throw new Error(`Unknown hazard section ${normalized} in building ${definition.id}`);
    }
    return section;
  }

  #state(id) {
    const state = this.buildings.get(String(id));
    if (!state) throw new Error(`Unknown building hazard state ${id}`);
    return state;
  }

  #definition(id) {
    const definition = this.definitions.get(String(id));
    if (!definition) throw new Error(`Unknown building hazard definition ${id}`);
    return definition;
  }
}
