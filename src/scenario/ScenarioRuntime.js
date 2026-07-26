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

export function instantiateScenarioUnits(scenario, UnitType = Unit) {
  assertScenarioDefinition(scenario);
  return scenario.units.map(definition => new UnitType({
    ...definition,
    position: new THREE.Vector3(...definition.position)
  }));
}

export function loadScenario(scenario, {
  terrain,
  scene,
  agentDebug = false,
  UnitType = Unit
}) {
  if (!terrain || !scene) throw new Error('Scenario runtime requires terrain and scene');
  const units = instantiateScenarioUnits(scenario, UnitType);
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
