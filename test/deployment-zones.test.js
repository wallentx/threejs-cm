import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  isUnitInsideDeploymentZone,
  isPositionInsideDeploymentZone
} from '../src/scenario/DeploymentRules.js';
import { CommandSystem } from '../src/game/CommandSystem.js';
import { TerrainBuilder } from '../src/world/TerrainBuilder.js';
import { STONNE_1940_SCENARIO } from '../src/scenarios/france1940/stonne1940.js';

function deploymentUnit(faction, x, z, width = 4, length = 6) {
  return {
    faction,
    type: 'vehicle',
    position: new THREE.Vector3(x, 0, z),
    mesh: {
      userData: {
        modelMetadata: {
          dimensionsMeters: { width, length, height: 2 }
        }
      }
    }
  };
}

test('deployment zones contain complete unit footprints, not only center points', () => {
  const zones = STONNE_1940_SCENARIO.deploymentZones;
  const french = zones.french;
  const german = zones.german;
  assert.equal(isUnitInsideDeploymentZone(deploymentUnit('french', 0, 80), zones), true);
  assert.equal(isUnitInsideDeploymentZone(deploymentUnit('german', 0, -80), zones), true);
  assert.equal(
    isUnitInsideDeploymentZone(
      deploymentUnit('french', french.maxX - 2, french.minZ + 3),
      zones
    ),
    true
  );
  assert.equal(
    isUnitInsideDeploymentZone(
      deploymentUnit('german', german.minX + 1.9, -80),
      zones
    ),
    false
  );
  assert.equal(
    isUnitInsideDeploymentZone(
      deploymentUnit('french', 0, french.minZ + 2.9),
      zones
    ),
    false
  );
});

test('deployment footprint accounts for rotation', () => {
  const zones = STONNE_1940_SCENARIO.deploymentZones;
  const unit = deploymentUnit('french', 0, 0, 8, 4);
  unit.rotation = Math.PI / 2;
  assert.equal(
    isPositionInsideDeploymentZone(unit, new THREE.Vector3(0, 94, 97), zones),
    false,
    'rotated length must not cross the north setup boundary'
  );
});

test('setup movement relocates the full squad immediately and rejects an escaping footprint', () => {
  const scene = new THREE.Scene();
  const terrain = { getHeightAt: (x, z) => x * 0.1 + z * 0.01 };
  const agent = {
    position: new THREE.Vector3(1, 0, 80),
    velocity: new THREE.Vector3(4, 0, 2),
    commandWaypoint: 3,
    syncRecord() { this.synced = true; }
  };
  const unit = {
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 80),
    rotation: 0,
    waypoints: [{ position: new THREE.Vector3(10, 0, 82) }],
    currentWaypointIndex: 0,
    mesh: { position: new THREE.Vector3(), rotation: { y: 0 }, updateMatrixWorld() {} },
    soldierAI: { agents: [agent], syncMeshes() { this.synced = true; } },
    clearWaypoints() { this.waypoints = []; this.currentWaypointIndex = 0; }
  };
  let rejected = 0;
  const commands = new CommandSystem(scene, {
    deploymentZones: STONNE_1940_SCENARIO.deploymentZones,
    terrain,
    isSetupPhase: () => true,
    onInvalidDeployment: () => { rejected++; }
  });
  commands.setActiveUnit(unit);
  commands.setCommandMode('MOVE_QUICK');

  assert.equal(commands.handleMapClick(new THREE.Vector3(10, 0, 84)), true);
  assert.equal(unit.position.x, 10);
  assert.equal(unit.position.z, 84);
  assert.ok(Math.abs(unit.position.y - 1.84) < 1e-9);
  assert.equal(unit.waypoints.length, 0);
  assert.equal(agent.position.x, 11);
  assert.equal(agent.position.z, 84);
  assert.ok(Math.abs(agent.position.y - 1.94) < 1e-9);
  assert.deepEqual(agent.velocity.toArray(), [0, 0, 0]);
  assert.equal(agent.commandWaypoint, -1);
  assert.equal(agent.synced, true);
  assert.equal(unit.soldierAI.synced, true);

  assert.equal(commands.handleMapClick(new THREE.Vector3(0, 0, 99)), false);
  assert.equal(rejected, 1);
  assert.equal(unit.position.z, 84, 'invalid placement must not move the unit');
});

test('infantry MOVE click delegates an occupied building footprint to floor selection', () => {
  const scene = new THREE.Scene();
  const point = new THREE.Vector3(4, 0, 7);
  const unit = {
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(),
    waypoints: [],
    targetPos: null,
    addWaypoint() {
      throw new Error('building click must not become an ordinary waypoint');
    }
  };
  let request = null;
  const commands = new CommandSystem(scene, {
    isSetupPhase: () => false,
    buildingInteraction: {
      findBuildingAt(candidate) {
        assert.equal(candidate, point);
        return 'house-a';
      }
    }
  });
  commands.onBuildingMoveClick = (selected, destination, buildingId, orderType) => {
    request = { selected, destination, buildingId, orderType };
    return true;
  };
  commands.setActiveUnit(unit);
  commands.setCommandMode('MOVE_QUICK');

  assert.equal(commands.handleMapClick(point), true);
  assert.deepEqual(request, {
    selected: unit,
    destination: point,
    buildingId: 'house-a',
    orderType: 'QUICK'
  });
});

test('setup-zone mesh follows sampled terrain and never accepts raycasts', () => {
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene, {
    deploymentZones: STONNE_1940_SCENARIO.deploymentZones
  });
  terrain.buildSetupZones();
  const zone = terrain.deploymentZones.french;
  const positions = zone.geometry.attributes.position;
  const offset = zone.userData.surfaceOffset;
  for (let index = 0; index < positions.count; index += 13) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    assert.ok(Math.abs(positions.getY(index) - terrain.getHeightAt(x, z) - offset) < 1e-5);
  }
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 30, 80), new THREE.Vector3(0, -1, 0));
  assert.equal(raycaster.intersectObject(zone).length, 0);
  terrain.removeSetupZones();
  assert.equal(scene.getObjectByName('french_deployment_zone'), undefined);
});
