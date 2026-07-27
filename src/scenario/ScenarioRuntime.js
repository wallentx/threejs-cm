import * as THREE from 'three';

// Runtime adapter: plain scenario records in, live tactical units out.
import { Unit } from '../game/Unit.js';
import { findUnitsOutsideDeploymentZones } from './DeploymentRules.js';

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

  return formation.members.map((member, index) => {
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

export function instantiateScenarioUnits(scenario, UnitType = Unit, familyRegistry = null) {
  const definitions = resolveScenarioUnitDefinitions(scenario, familyRegistry);
  return definitions.map(definition => new UnitType({
    ...definition,
    position: new THREE.Vector3(...definition.position)
  }));
}

export function loadScenario(scenario, {
  terrain,
  scene,
  agentDebug = false,
  UnitType = Unit,
  familyRegistry = null
}) {
  if (!terrain || !scene) throw new Error('Scenario runtime requires terrain and scene');
  const units = instantiateScenarioUnits(scenario, UnitType, familyRegistry);
  const invalidDeployments = findUnitsOutsideDeploymentZones(
    units,
    scenario.deploymentZones
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
  return { units, unitsById, initialSelection, cameraTarget };
}
