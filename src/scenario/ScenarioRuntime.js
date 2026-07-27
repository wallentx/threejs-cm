import * as THREE from 'three';

// Runtime adapter: plain scenario records in, live tactical units out.
import { Unit } from '../game/Unit.js';
import { findUnitsOutsideDeploymentZones } from './DeploymentRules.js';
import {
  captureInfantryAmmunitionTransferState,
  createInfantryAmmunitionTransferState
} from '../simulation/infantry/InfantryAmmunitionTransfer.js';

function assertScenarioDefinition(scenario) {
  if (!scenario?.id) throw new Error('Scenario requires an id');
  if (!Array.isArray(scenario.units) || scenario.units.length === 0) {
    throw new Error(`Scenario ${scenario.id} requires at least one unit`);
  }
  const unitIds = new Set();
  for (const definition of scenario.units) {
    if (!definition.id) throw new Error(`Scenario ${scenario.id} contains a unit without an id`);
    if (unitIds.has(definition.id)) {
      throw new Error(`Scenario ${scenario.id} contains duplicate unit id ${definition.id}`);
    }
    if (!Array.isArray(definition.position) || definition.position.length !== 3) {
      throw new Error(`Scenario unit ${definition.id} requires position [x, y, z]`);
    }
    unitIds.add(definition.id);
  }
}

function requireCatalogRecord(catalog, id, label, unitId) {
  const record = catalog?.[id];
  if (!record) {
    throw new Error(`Scenario unit ${unitId} references unknown ${label} ${id}`);
  }
  return record;
}

function assertFamilyMatch(record, expectedFaction, label, id, unitId) {
  const recordFaction = record.faction ?? record.factionId;
  if (recordFaction && recordFaction !== expectedFaction) {
    throw new Error(
      `Scenario unit ${unitId} ${label} ${id} belongs to ${recordFaction}, not ${expectedFaction}`
    );
  }
}

function copySoldierEquipment(soldierEquipment = {}) {
  return Object.fromEntries(Object.entries(soldierEquipment).map(([soldierId, equipment]) => {
    if (!Array.isArray(equipment)) {
      throw new Error(`Scenario soldier ${soldierId} equipment must be an array`);
    }
    return [soldierId, [...equipment]];
  }));
}

function assertSoldierReferences(definition, roster, soldierEquipment, communications) {
  const rosterIds = new Set(roster.map(member => String(member.id)));
  for (const soldierId of Object.keys(soldierEquipment ?? {})) {
    if (!rosterIds.has(String(soldierId))) {
      throw new Error(
        `Scenario unit ${definition.id} equipment references unknown soldier ${soldierId}`
      );
    }
  }
  for (const soldierId of communications?.radioOperatorSoldierIds ?? []) {
    if (!rosterIds.has(String(soldierId))) {
      throw new Error(
        `Scenario unit ${definition.id} radio references unknown soldier ${soldierId}`
      );
    }
  }
}

function resolveInfantryRoster(definition, family) {
  if (!definition.formationId) {
    throw new Error(`Scenario infantry unit ${definition.id} requires formationId`);
  }
  const formation = requireCatalogRecord(
    family.formations,
    definition.formationId,
    'formation',
    definition.id
  );
  assertFamilyMatch(formation, definition.faction, 'formation', definition.formationId, definition.id);
  if (!Array.isArray(formation.members) || formation.members.length === 0) {
    throw new Error(`Scenario formation ${definition.formationId} requires ordered members`);
  }

  const roster = formation.members.map((member, index) => {
    const weapon = requireCatalogRecord(
      family.catalogs?.weapons,
      member.weaponId,
      'weapon',
      definition.id
    );
    const namePrefix = member.namePrefix ?? formation.namePrefix;
    return {
      id: member.id ?? index,
      name: member.name ?? `${namePrefix} ${index + 1}`,
      role: member.role,
      weaponId: member.weaponId,
      weapon: weapon.name,
      status: 'OK',
      health: 100
    };
  });
  const membersById = new Map(roster.map(member => [member.id, member]));
  for (const allocation of formation.supportAmmunitionTransfers ?? []) {
    const donor = membersById.get(allocation.donorSoldierId);
    const recipient = membersById.get(allocation.recipientSoldierId);
    const weapon = requireCatalogRecord(
      family.catalogs?.weapons,
      allocation.weaponId,
      'support ammunition weapon',
      definition.id
    );
    if (!donor || !recipient || recipient.weaponId !== allocation.weaponId) {
      throw new Error(
        `Scenario formation ${definition.formationId} has invalid support ammunition `
        + `transfer ${allocation.id}`
      );
    }
    recipient.magazineAmmo = weapon.magazineSize;
    recipient.reserveAmmo =
      weapon.carriedAmmo - weapon.magazineSize - allocation.carriedRounds;
    donor.supportAmmunitionTransfer =
      captureInfantryAmmunitionTransferState(
        createInfantryAmmunitionTransferState(allocation)
      );
  }
  return roster;
}

function resolveFamilyUnitDefinition(definition, family) {
  const faction = requireCatalogRecord(
    family.factions,
    definition.faction,
    'faction',
    definition.id
  );
  const resolved = {
    ...definition,
    position: [...definition.position],
    soldierEquipment: copySoldierEquipment(definition.soldierEquipment),
    communications: definition.communications
      ? {
          ...definition.communications,
          radioOperatorRoles: definition.communications.radioOperatorRoles
            ? [...definition.communications.radioOperatorRoles]
            : undefined,
          radioOperatorSoldierIds: definition.communications.radioOperatorSoldierIds
            ? [...definition.communications.radioOperatorSoldierIds]
            : undefined
        }
      : undefined
  };

  if (definition.type === 'infantry_squad') {
    resolved.roster = resolveInfantryRoster(definition, family);
    assertSoldierReferences(
      definition,
      resolved.roster,
      resolved.soldierEquipment,
      resolved.communications
    );
  } else if (definition.type === 'tank' || definition.type === 'vehicle') {
    if (!definition.vehicleId) {
      throw new Error(`Scenario vehicle unit ${definition.id} requires vehicleId`);
    }
    const vehicle = requireCatalogRecord(
      family.catalogs?.vehicles,
      definition.vehicleId,
      'vehicle',
      definition.id
    );
    if (Array.isArray(faction.vehicleIds)) {
      if (!faction.vehicleIds.includes(definition.vehicleId)) {
        throw new Error(
          `Scenario unit ${definition.id} vehicle ${definition.vehicleId} does not belong to ${definition.faction}`
        );
      }
    } else {
      assertFamilyMatch(vehicle, definition.faction, 'vehicle', definition.vehicleId, definition.id);
    }
  }
  return resolved;
}

/**
 * Resolves a plain scenario descriptor against a game-family registry before
 * Three.js vectors or live Units exist.  The return value deliberately keeps
 * mutable per-battle state (notably infantry rosters) separate from frozen
 * family/scenario source data.
 */
export function resolveScenarioUnitDefinitions(scenario, familyRegistry) {
  assertScenarioDefinition(scenario);
  if (!familyRegistry) {
    if (scenario.gameFamilyId) {
      throw new Error(
        `Scenario ${scenario.id} requires a family registry for ${scenario.gameFamilyId}`
      );
    }
    return scenario.units.map(definition => ({
      ...definition,
      position: [...definition.position],
      soldierEquipment: copySoldierEquipment(definition.soldierEquipment)
    }));
  }
  if (!scenario.gameFamilyId) throw new Error(`Scenario ${scenario.id} requires gameFamilyId`);
  const family = familyRegistry.require(scenario.gameFamilyId);
  if (!family) throw new Error(`Scenario ${scenario.id} references unknown game family ${scenario.gameFamilyId}`);
  return scenario.units.map(definition => resolveFamilyUnitDefinition(definition, family));
}

function validateVisualFactories(scenario, familyRegistry, visualFactories) {
  if (!visualFactories) return null;
  if (typeof visualFactories !== 'object' || Array.isArray(visualFactories)) {
    throw new TypeError('visualFactories must be a record');
  }
  if (visualFactories.familyId !== scenario.gameFamilyId) {
    throw new Error(
      `Scenario ${scenario.id} requires visual factories for ${scenario.gameFamilyId}, `
      + `received ${visualFactories.familyId ?? 'missing'}`
    );
  }
  for (const registryName of [
    'factionPresentation',
    'infantryMeshes',
    'structureMeshes',
    'vehicleMeshes'
  ]) {
    const registry = visualFactories[registryName];
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
      throw new TypeError(
        `Visual factories for ${visualFactories.familyId} require ${registryName}`
      );
    }
  }
  const family = familyRegistry?.require?.(scenario.gameFamilyId);
  if (!family) {
    throw new Error(
      `Scenario ${scenario.id} requires a family registry for visual factories`
    );
  }
  for (const [factionId, faction] of Object.entries(family.factions)) {
    const registeredPresentation = family.presentation?.[faction.presentationId];
    if (!registeredPresentation) {
      throw new Error(
        `Game family ${family.id} faction ${factionId} requires presentation ${faction.presentationId}`
      );
    }
    if (visualFactories.factionPresentation[factionId] !== registeredPresentation) {
      throw new Error(
        `Visual factories for ${visualFactories.familyId} do not match registered `
        + `presentation for faction ${factionId}`
      );
    }
  }
  for (const definition of scenario.units) {
    const presentation = visualFactories.factionPresentation[definition.faction];
    if (definition.type === 'infantry_squad') {
      const modelId = presentation?.infantryModelId;
      if (typeof modelId !== 'string' || modelId.length === 0) {
        throw new Error(
          `Scenario unit ${definition.id} faction ${definition.faction} requires infantryModelId`
        );
      }
      if (typeof visualFactories.infantryMeshes[modelId] !== 'function') {
        throw new Error(
          `Visual factories for ${visualFactories.familyId} require infantry model ${modelId}`
        );
      }
    } else if (definition.type === 'tank' || definition.type === 'vehicle') {
      const vehicle = family.catalogs?.vehicles?.[definition.vehicleId];
      const modelId = vehicle?.modelId;
      if (typeof modelId !== 'string' || modelId.length === 0) {
        throw new Error(
          `Scenario unit ${definition.id} vehicle ${definition.vehicleId} requires modelId`
        );
      }
      if (typeof visualFactories.vehicleMeshes[modelId] !== 'function') {
        throw new Error(
          `Visual factories for ${visualFactories.familyId} require vehicle model ${modelId}`
        );
      }
    }
    if (
      definition.structureId
      && typeof visualFactories.structureMeshes[definition.structureId] !== 'function'
    ) {
      throw new Error(
        `Visual factories for ${visualFactories.familyId} require structure model `
        + definition.structureId
      );
    }
  }
  return visualFactories;
}

function validateCatalogPorts(scenario, familyRegistry, catalogPorts) {
  if (!catalogPorts) return null;
  if (typeof catalogPorts !== 'object' || Array.isArray(catalogPorts)) {
    throw new TypeError('catalogPorts must be a record');
  }
  if (catalogPorts.familyId !== scenario.gameFamilyId) {
    throw new Error(
      `Scenario ${scenario.id} requires catalog ports for ${scenario.gameFamilyId}, `
      + `received ${catalogPorts.familyId ?? 'missing'}`
    );
  }
  const family = familyRegistry?.require?.(scenario.gameFamilyId);
  if (!family) {
    throw new Error(
      `Scenario ${scenario.id} requires a family registry for catalog ports`
    );
  }
  for (const [name, requiredFunctions] of Object.entries({
    weapons: ['get', 'idFromName'],
    vehicles: ['get', 'defaultIdForFaction']
  })) {
    const port = catalogPorts[name];
    if (!port || typeof port !== 'object') {
      throw new TypeError(`Catalog ports for ${catalogPorts.familyId} require ${name}`);
    }
    if (port.records !== family.catalogs[name]) {
      throw new Error(
        `Catalog ports for ${catalogPorts.familyId} do not match registered ${name}`
      );
    }
    for (const functionName of requiredFunctions) {
      if (typeof port[functionName] !== 'function') {
        throw new TypeError(
          `Catalog port ${name}.${functionName} must be a function`
        );
      }
    }
    for (const [recordId, record] of Object.entries(port.records)) {
      if (port.get(recordId) !== record) {
        throw new Error(
          `Catalog port ${name}.get must return registered record ${recordId}`
        );
      }
    }
  }
  for (const [factionId, faction] of Object.entries(family.factions)) {
    if (!Array.isArray(faction.vehicleIds) || faction.vehicleIds.length === 0) continue;
    const vehicleId = catalogPorts.vehicles.defaultIdForFaction(factionId);
    if (!faction.vehicleIds.includes(vehicleId)) {
      throw new Error(
        `Catalog port vehicles.defaultIdForFaction returned invalid ${factionId} vehicle ${vehicleId}`
      );
    }
    if (catalogPorts.vehicles.get(vehicleId) !== family.catalogs.vehicles[vehicleId]) {
      throw new Error(
        `Catalog port vehicles.defaultIdForFaction must resolve registered vehicle ${vehicleId}`
      );
    }
  }
  return catalogPorts;
}

export function instantiateScenarioUnits(
  scenario,
  UnitType = Unit,
  familyRegistry = null,
  {
    visualFactories = null,
    catalogPorts = null
  } = {}
) {
  const definitions = resolveScenarioUnitDefinitions(scenario, familyRegistry);
  const resolvedCatalogPorts = validateCatalogPorts(
    scenario,
    familyRegistry,
    catalogPorts
  );
  const resolvedVisualFactories = validateVisualFactories(
    scenario,
    familyRegistry,
    visualFactories
  );
  return definitions.map(definition => new UnitType({
    ...definition,
    ...(resolvedCatalogPorts ? { catalogPorts: resolvedCatalogPorts } : {}),
    ...(resolvedVisualFactories ? { visualFactories: resolvedVisualFactories } : {}),
    position: new THREE.Vector3(...definition.position)
  }));
}

function assertScenarioMap(scenario, mapDescriptor) {
  if (typeof scenario.mapId !== 'string' || scenario.mapId.length === 0) {
    throw new Error(`Scenario ${scenario.id} requires mapId`);
  }
  if (!mapDescriptor?.id) {
    throw new Error(`Scenario ${scenario.id} requires map descriptor ${scenario.mapId}`);
  }
  if (scenario.mapId !== mapDescriptor.id) {
    throw new Error(
      `Scenario ${scenario.id} requires map ${scenario.mapId}, received ${mapDescriptor.id}`
    );
  }
  if (!mapDescriptor.deploymentZones || typeof mapDescriptor.deploymentZones !== 'object') {
    throw new Error(`Map ${mapDescriptor.id} requires deploymentZones`);
  }
}

export function loadScenario(scenario, {
  terrain,
  scene,
  mapDescriptor,
  agentDebug = false,
  UnitType = Unit,
  familyRegistry = null,
  visualFactories = null,
  catalogPorts = null
}) {
  if (!terrain || !scene) throw new Error('Scenario runtime requires terrain and scene');
  assertScenarioMap(scenario, mapDescriptor);
  const units = instantiateScenarioUnits(scenario, UnitType, familyRegistry, {
    visualFactories,
    catalogPorts
  });
  const invalidDeployments = findUnitsOutsideDeploymentZones(
    units,
    mapDescriptor.deploymentZones
  );
  if (invalidDeployments.length > 0) {
    throw new Error(
      `Units outside deployment zones: ${invalidDeployments.map(unit => unit.id).join(', ')}`
    );
  }

  for (const unit of units) {
    unit.position.y = terrain.getHeightAt(unit.position.x, unit.position.z);
    if (unit.mesh) {
      unit.mesh.position.copy(unit.position);
      scene.add(unit.mesh);
    }
    unit.setAgentDebug(agentDebug);
  }

  const unitsById = new Map(units.map(unit => [unit.id, unit]));
  const initialSelection = unitsById.get(scenario.initialSelectionUnitId) ?? null;
  const cameraTarget = unitsById.get(scenario.cameraTargetUnitId) ?? initialSelection;
  return {
    units,
    unitsById,
    initialSelection,
    cameraTarget,
    mapDescriptor
  };
}
