import { INFANTRY_SEPARATION_MAX_CANDIDATES } from '../simulation/infantry/InfantrySeparationSystem.js';

const SETUP_DATA_QUALITY =
  'battle setup policy is deterministic game configuration; force packages and AI levels are gameplay choices';
const GRID_SPACING_METERS = 11;
const DEPLOYMENT_MARGIN_METERS = 6;

export { INFANTRY_SEPARATION_MAX_CANDIDATES };

export const BATTLE_SETUP_AI_LEVELS = Object.freeze({
  recruit: Object.freeze({
    id: 'recruit',
    name: 'Recruit',
    description: 'Green enemy crews and soldiers; reduced spotting and fire control.',
    experience: 'Green',
    leadership: -1,
    dataQuality: SETUP_DATA_QUALITY
  }),
  regular: Object.freeze({
    id: 'regular',
    name: 'Regular (Current)',
    description: 'Current default combat behavior and Regular soft factors.',
    experience: 'Regular',
    leadership: 0,
    dataQuality: SETUP_DATA_QUALITY
  }),
  veteran: Object.freeze({
    id: 'veteran',
    name: 'Veteran',
    description: 'Veteran enemy spotting, aim work, and weapon dispersion.',
    experience: 'Veteran',
    leadership: 1,
    dataQuality: SETUP_DATA_QUALITY
  }),
  crack: Object.freeze({
    id: 'crack',
    name: 'Crack',
    description: 'Crack enemy spotting, aim work, and weapon dispersion.',
    experience: 'Crack',
    leadership: 2,
    dataQuality: SETUP_DATA_QUALITY
  })
});

function requireRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be a record`);
  }
  return value;
}

function requireId(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} requires a non-empty id`);
  }
  return value;
}

function requirePositiveInteger(value, path, maximum = Infinity) {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      `${path} must be an integer between 1 and ${Number.isFinite(maximum) ? maximum : 'Infinity'}`
    );
  }
  return value;
}

function optionCatalogRecord(option, family) {
  if (option.kind === 'formation') {
    return family.formations?.[option.recordId] ?? null;
  }
  if (option.kind === 'vehicle') {
    return family.catalogs?.vehicles?.[option.recordId] ?? null;
  }
  if (option.kind === 'structure') {
    return family.catalogs?.structures?.[option.recordId] ?? null;
  }
  return null;
}

export function validateBattleSetupCatalog(catalog, family) {
  requireRecord(catalog, 'battleSetup');
  requireId(catalog.id, 'battleSetup.id');
  if (catalog.gameFamilyId !== family?.id) {
    throw new Error(
      `Battle setup ${catalog.id} requires family ${catalog.gameFamilyId}, received ${family?.id ?? 'missing'}`
    );
  }
  const countries = requireRecord(catalog.countries, 'battleSetup.countries');
  for (const [factionId, country] of Object.entries(countries)) {
    if (!family.factions?.[factionId]) {
      throw new Error(`Battle setup country ${factionId} is not registered`);
    }
    if (country.id !== factionId) {
      throw new Error(`Battle setup country ${factionId} id must match its key`);
    }
    requireId(country.name, `battleSetup.countries.${factionId}.name`);
  }
  const options = requireRecord(
    catalog.unitOptions,
    'battleSetup.unitOptions'
  );
  if (Object.keys(options).length === 0) {
    throw new Error('Battle setup requires unit options');
  }
  for (const [optionId, option] of Object.entries(options)) {
    const path = `battleSetup.unitOptions.${optionId}`;
    requireRecord(option, path);
    if (option.id !== optionId) {
      throw new Error(`${path}.id must match its key`);
    }
    if (!countries[option.factionId]) {
      throw new Error(`${path} references unknown faction ${option.factionId}`);
    }
    if (!['formation', 'vehicle', 'structure'].includes(option.kind)) {
      throw new Error(`${path}.kind is unsupported`);
    }
    requireId(option.recordId, `${path}.recordId`);
    const record = optionCatalogRecord(option, family);
    if (!record) {
      throw new Error(
        `${path} references missing ${option.kind} ${option.recordId}`
      );
    }
    const recordFaction = record.factionId ?? record.faction;
    if (recordFaction && recordFaction !== option.factionId) {
      throw new Error(
        `${path} ${option.recordId} belongs to ${recordFaction}`
      );
    }
  }
  const packages = requireRecord(
    catalog.forcePackages,
    'battleSetup.forcePackages'
  );
  for (const [packageId, forcePackage] of Object.entries(packages)) {
    const path = `battleSetup.forcePackages.${packageId}`;
    requireRecord(forcePackage, path);
    if (forcePackage.id !== packageId) {
      throw new Error(`${path}.id must match its key`);
    }
    if (!countries[forcePackage.factionId]) {
      throw new Error(
        `${path} references unknown faction ${forcePackage.factionId}`
      );
    }
    if (!Array.isArray(forcePackage.entries)
        || forcePackage.entries.length === 0) {
      throw new Error(`${path}.entries must be a non-empty array`);
    }
    for (const [index, entry] of forcePackage.entries.entries()) {
      const option = options[entry.optionId];
      if (!option || option.factionId !== forcePackage.factionId) {
        throw new Error(
          `${path}.entries[${index}] references an invalid force option`
        );
      }
      requirePositiveInteger(
        entry.count,
        `${path}.entries[${index}].count`,
        catalog.maximumCountPerOption
      );
    }
  }
  for (const factionId of Object.keys(countries)) {
    const defaultPackageId = catalog.defaultPackageByFaction?.[factionId];
    if (packages[defaultPackageId]?.factionId !== factionId) {
      throw new Error(
        `Battle setup faction ${factionId} requires a valid default package`
      );
    }
  }
  requirePositiveInteger(
    catalog.maximumUnitsPerSide,
    'battleSetup.maximumUnitsPerSide'
  );
  requirePositiveInteger(
    catalog.maximumCountPerOption,
    'battleSetup.maximumCountPerOption'
  );
  return catalog;
}

function aggregateEntries(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(
      entry.optionId,
      (counts.get(entry.optionId) ?? 0) + entry.count
    );
  }
  return counts;
}

export function resolveBattleForce(catalog, factionId, selection) {
  requireRecord(selection, 'forceSelection');
  let counts;
  if (selection.mode === 'package') {
    const forcePackage = catalog.forcePackages?.[selection.packageId];
    if (!forcePackage || forcePackage.factionId !== factionId) {
      throw new Error(
        `Force selection requires a ${factionId} package`
      );
    }
    counts = aggregateEntries(forcePackage.entries);
  } else if (selection.mode === 'custom') {
    requireRecord(selection.counts, 'forceSelection.counts');
    counts = new Map();
    for (const [optionId, rawCount] of Object.entries(selection.counts)) {
      if (!Number.isInteger(rawCount) || rawCount < 0) {
        throw new Error(
          `Custom force count for ${optionId} must be a non-negative integer`
        );
      }
      if (rawCount === 0) continue;
      const option = catalog.unitOptions?.[optionId];
      if (!option || option.factionId !== factionId) {
        throw new Error(
          `Custom force option ${optionId} is unavailable to ${factionId}`
        );
      }
      if (rawCount > catalog.maximumCountPerOption) {
        throw new Error(
          `Custom force count for ${optionId} exceeds ${catalog.maximumCountPerOption}`
        );
      }
      counts.set(optionId, rawCount);
    }
  } else {
    throw new Error('Force selection mode must be package or custom');
  }

  const entries = Object.values(catalog.unitOptions)
    .filter(option => option.factionId === factionId)
    .flatMap(option => {
      const count = counts.get(option.id) ?? 0;
      return count > 0 ? [{ option, count }] : [];
    });
  const totalUnits = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (totalUnits === 0) {
    throw new Error(`${factionId} force requires at least one unit`);
  }
  if (totalUnits > catalog.maximumUnitsPerSide) {
    throw new Error(
      `${factionId} force has ${totalUnits} units; map limit is ${catalog.maximumUnitsPerSide}`
    );
  }
  return Object.freeze({
    factionId,
    totalUnits,
    entries: Object.freeze(entries.map(entry => Object.freeze({
      option: entry.option,
      count: entry.count
    })))
  });
}

function requireFormationMemberCount(family, option) {
  const formation = family?.formations?.[option.recordId];
  if (!formation || !Array.isArray(formation.members)) {
    throw new Error(
      `Battle setup option ${option.id} references invalid formation ${option.recordId}`
    );
  }
  return formation.members.length;
}

function formationContributions(family, side, factionId, force) {
  return force.entries.flatMap(entry => {
    if (entry.option.kind !== 'formation') return [];
    const individualCount = requireFormationMemberCount(family, entry.option);
    return [{
      side,
      factionId,
      optionId: entry.option.id,
      formationId: entry.option.recordId,
      optionName: entry.option.name,
      selectedCount: entry.count,
      individualCount,
      contribution: entry.count * individualCount
    }];
  });
}

function validateResolvedRosterSeparationCapacity({
  family,
  playerFactionId,
  playerForce,
  enemyFactionId,
  enemyForce
}) {
  const contributions = [
    ...formationContributions(
      family,
      'player',
      playerFactionId,
      playerForce
    ),
    ...formationContributions(
      family,
      'enemy',
      enemyFactionId,
      enemyForce
    )
  ];
  let totalInfantry = 0;
  let playerInfantry = 0;
  let enemyInfantry = 0;
  for (const contribution of contributions) {
    totalInfantry += contribution.contribution;
    if (contribution.side === 'player') {
      playerInfantry += contribution.contribution;
    } else {
      enemyInfantry += contribution.contribution;
    }
    if (totalInfantry > INFANTRY_SEPARATION_MAX_CANDIDATES) {
      throw new RangeError(
        `Battle setup ${contribution.side} ${contribution.factionId} option `
        + `${contribution.optionId} (${contribution.optionName}) contributes `
        + `${contribution.contribution} living infantry from `
        + `${contribution.selectedCount} selected formation(s) at `
        + `${contribution.individualCount} each; cumulative count `
        + `${totalInfantry} exceeds separation limit `
        + `${INFANTRY_SEPARATION_MAX_CANDIDATES}`
      );
    }
  }
  return Object.freeze({
    playerInfantry,
    enemyInfantry,
    totalInfantry,
    limit: INFANTRY_SEPARATION_MAX_CANDIDATES
  });
}

export function countForceLivingInfantry(catalog, family, factionId, selection) {
  const force = resolveBattleForce(catalog, factionId, selection);
  return formationContributions(family, 'force', factionId, force)
    .reduce((total, entry) => total + entry.contribution, 0);
}

export function validateRosterSeparationCapacity({
  catalog,
  family,
  playerFactionId,
  playerForceSelection,
  enemyFactionId,
  enemyForceSelection
}) {
  const playerForce = resolveBattleForce(
    catalog,
    playerFactionId,
    playerForceSelection
  );
  const enemyForce = resolveBattleForce(
    catalog,
    enemyFactionId,
    enemyForceSelection
  );
  return validateResolvedRosterSeparationCapacity({
    family,
    playerFactionId,
    playerForce,
    enemyFactionId,
    enemyForce
  });
}

function resolveConfiguredBattleForces({
  catalog,
  family,
  playerFactionId,
  playerForceSelection,
  enemyFactionId,
  enemyForceSelection
}) {
  validateBattleSetupCatalog(catalog, family);
  if (playerFactionId === enemyFactionId) {
    throw new Error('Player and enemy countries must be different');
  }
  if (!catalog.countries[playerFactionId]
      || !catalog.countries[enemyFactionId]) {
    throw new Error('Configured battle references an unavailable country');
  }
  const playerForce = resolveBattleForce(
    catalog,
    playerFactionId,
    playerForceSelection
  );
  const enemyForce = resolveBattleForce(
    catalog,
    enemyFactionId,
    enemyForceSelection
  );
  const capacity = validateResolvedRosterSeparationCapacity({
    family,
    playerFactionId,
    playerForce,
    enemyFactionId,
    enemyForce
  });
  return Object.freeze({ playerForce, enemyForce, capacity });
}

export function createBattleSetupValidationPort({ catalog, family }) {
  validateBattleSetupCatalog(catalog, family);
  return selection => resolveConfiguredBattleForces({
    catalog,
    family,
    playerFactionId: selection?.playerFactionId,
    playerForceSelection: selection?.playerForceSelection,
    enemyFactionId: selection?.enemyFactionId,
    enemyForceSelection: selection?.enemyForceSelection
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function centerOfZone(zone) {
  return {
    x: (zone.minX + zone.maxX) * 0.5,
    z: (zone.minZ + zone.maxZ) * 0.5
  };
}

function createDeploymentSlots(zone, count) {
  const width = zone.maxX - zone.minX - DEPLOYMENT_MARGIN_METERS * 2;
  const depth = zone.maxZ - zone.minZ - DEPLOYMENT_MARGIN_METERS * 2;
  const maxColumns = Math.max(
    1,
    Math.floor(width / GRID_SPACING_METERS) + 1
  );
  const maxRows = Math.max(
    1,
    Math.floor(depth / GRID_SPACING_METERS) + 1
  );
  if (count > maxColumns * maxRows) {
    throw new Error(
      `Deployment zone supports ${maxColumns * maxRows} setup slots, received ${count}`
    );
  }
  const rowsUsed = Math.ceil(count / maxColumns);
  const center = centerOfZone(zone);
  const slots = [];
  for (let row = 0; row < rowsUsed; row++) {
    const remaining = count - row * maxColumns;
    const columns = Math.min(maxColumns, remaining);
    for (let column = 0; column < columns; column++) {
      slots.push([
        center.x + (column - (columns - 1) * 0.5) * GRID_SPACING_METERS,
        0,
        center.z + (row - (rowsUsed - 1) * 0.5) * GRID_SPACING_METERS
      ]);
    }
  }
  return slots;
}

function equipmentForFormation(formation) {
  return Object.fromEntries(
    formation.members
      .filter(member => Array.isArray(member.equipment)
        && member.equipment.length > 0)
      .map(member => [member.id, [...member.equipment]])
  );
}

function radioOperatorsForFormation(formation) {
  return formation.members
    .filter(member => member.equipment?.includes('RADIO'))
    .map(member => member.id);
}

function createUnitDefinition({
  option,
  index,
  slot,
  rotation,
  factionId,
  commandNetId,
  experience,
  leadership
}, family) {
  const numberedName = `${option.name} ${index + 1}`;
  const idSuffix = option.recordId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const definition = {
    id: `${factionId}-${idSuffix}-${index + 1}`,
    name: numberedName,
    faction: factionId,
    position: slot,
    rotation,
    experience,
    leadership,
    communications: {
      commandNetId,
      radioInstalled: false
    }
  };
  if (option.kind === 'formation') {
    const formation = family.formations[option.recordId];
    const radioOperatorSoldierIds = radioOperatorsForFormation(formation);
    return {
      ...definition,
      type: 'infantry_squad',
      formationId: option.recordId,
      soldierEquipment: equipmentForFormation(formation),
      communications: {
        ...definition.communications,
        radioInstalled: radioOperatorSoldierIds.length > 0,
        radioOperatorSoldierIds
      }
    };
  }
  if (option.kind === 'vehicle') {
    const vehicle = family.catalogs.vehicles[option.recordId];
    return {
      ...definition,
      type: 'vehicle',
      vehicleId: option.recordId,
      communications: {
        ...definition.communications,
        radioInstalled: vehicle.communications?.radioInstalled === true
      }
    };
  }
  return {
    ...definition,
    type: 'bunker',
    structureId: option.recordId
  };
}

function expandForce({
  force,
  factionId,
  zone,
  opposingZone,
  experience,
  leadership,
  commandNetId
}, family) {
  const slots = createDeploymentSlots(zone, force.totalUnits);
  const zoneCenter = centerOfZone(zone);
  const opposingCenter = centerOfZone(opposingZone);
  const rotation = Math.atan2(
    opposingCenter.x - zoneCenter.x,
    opposingCenter.z - zoneCenter.z
  );
  let slotIndex = 0;
  const units = [];
  for (const entry of force.entries) {
    for (let index = 0; index < entry.count; index++) {
      units.push(createUnitDefinition({
        option: entry.option,
        index,
        slot: slots[slotIndex++],
        rotation,
        factionId,
        commandNetId,
        experience,
        leadership
      }, family));
    }
  }
  return units;
}

function freezeScenario(scenario) {
  const freezeUnit = unit => Object.freeze({
    ...unit,
    position: Object.freeze([...unit.position]),
    communications: Object.freeze({
      ...unit.communications,
      radioOperatorSoldierIds: Object.freeze([
        ...(unit.communications?.radioOperatorSoldierIds ?? [])
      ])
    }),
    soldierEquipment: Object.freeze(Object.fromEntries(
      Object.entries(unit.soldierEquipment ?? {}).map(([id, equipment]) => [
        id,
        Object.freeze([...equipment])
      ])
    ))
  });
  return Object.freeze({
    ...scenario,
    ai: Object.freeze({ ...scenario.ai }),
    communicationNets: Object.freeze(
      scenario.communicationNets.map(net => Object.freeze({ ...net }))
    ),
    units: Object.freeze(scenario.units.map(freezeUnit))
  });
}

export function createConfiguredBattleScenario({
  mapDescriptor,
  family,
  catalog,
  playerFactionId,
  enemyFactionId,
  playerForceSelection,
  enemyForceSelection,
  enemyAiDifficulty = 'regular'
}) {
  const { playerForce, enemyForce } = resolveConfiguredBattleForces({
    catalog,
    family,
    playerFactionId,
    playerForceSelection,
    enemyFactionId,
    enemyForceSelection
  });
  if (!mapDescriptor?.id || !mapDescriptor?.deploymentZones) {
    throw new Error('Configured battle requires a map with deployment zones');
  }
  const playerZone = mapDescriptor.deploymentZones[playerFactionId];
  const enemyZone = mapDescriptor.deploymentZones[enemyFactionId];
  if (!playerZone || !enemyZone) {
    throw new Error('Selected countries require deployment zones on this map');
  }
  const difficulty = BATTLE_SETUP_AI_LEVELS[enemyAiDifficulty];
  if (!difficulty) {
    throw new Error(`Unknown enemy AI difficulty ${enemyAiDifficulty}`);
  }
  const playerNetId = `${playerFactionId}-configured-player`;
  const enemyNetId = `${enemyFactionId}-configured-enemy`;
  const playerUnits = expandForce({
    force: playerForce,
    factionId: playerFactionId,
    zone: playerZone,
    opposingZone: enemyZone,
    experience: 'Regular',
    leadership: 0,
    commandNetId: playerNetId
  }, family);
  const enemyUnits = expandForce({
    force: enemyForce,
    factionId: enemyFactionId,
    zone: enemyZone,
    opposingZone: playerZone,
    experience: difficulty.experience,
    leadership: difficulty.leadership,
    commandNetId: enemyNetId
  }, family);
  const units = [...playerUnits, ...enemyUnits];
  const seedSource = [
    mapDescriptor.id,
    playerFactionId,
    enemyFactionId,
    enemyAiDifficulty,
    ...units.map(unit => unit.id)
  ].join(':');
  const defaultSeed = hashString(seedSource) || 1;
  const mapName = mapDescriptor.title ?? mapDescriptor.id;
  return freezeScenario({
    id: `configured-${mapDescriptor.id}-${playerFactionId}-vs-${enemyFactionId}`,
    gameFamilyId: family.id,
    title: `${mapName}: ${catalog.countries[playerFactionId].name} vs ${catalog.countries[enemyFactionId].name}`,
    defaultSeed,
    mapId: mapDescriptor.id,
    playerFactionId,
    enemyFactionId,
    enemyAiDifficulty,
    ai: {
      enemyFactionId,
      difficultyId: difficulty.id,
      experience: difficulty.experience,
      leadership: difficulty.leadership,
      dataQuality: difficulty.dataQuality
    },
    communicationNets: [
      {
        id: playerNetId,
        faction: playerFactionId,
        dataQuality: SETUP_DATA_QUALITY
      },
      {
        id: enemyNetId,
        faction: enemyFactionId,
        dataQuality: SETUP_DATA_QUALITY
      }
    ],
    initialSelectionUnitId: playerUnits[0].id,
    cameraTargetUnitId: playerUnits[0].id,
    units
  });
}
