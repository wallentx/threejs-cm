import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { BallisticsSystem } from '../src/game/BallisticsSystem.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { WEAPONS } from '../src/game/WeaponCatalog.js';
import {
  getUnbuttonedCommanderWorldPosition,
  intersectExposedVehicleCrew
} from '../src/simulation/vehicles/VehicleCrewExposure.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const sound = {
  playGunshot() {},
  playCannon() {},
  playExplosion() {}
};

function projectileAcrossCommander(target, center) {
  const start = new THREE.Vector3(center.x, center.y, center.z + 2);
  const end = new THREE.Vector3(center.x, center.y, center.z - 2);
  return {
    id: 1,
    attacker: {
      id: 'rifleman',
      faction: 'french',
      position: start.clone()
    },
    shooterId: 'rifleman-1',
    targetUnit: target,
    targetSoldierId: null,
    weapon: WEAPONS.MAS36,
    ammoId: WEAPONS.MAS36.id,
    muzzlePosition: start.clone(),
    previousPosition: start,
    position: end,
    velocity: new THREE.Vector3(0, 0, -WEAPONS.MAS36.muzzleVelocity),
    distanceTravelled: start.distanceTo(end),
    lifetime: 0.01,
    trajectoryPoints: [start.toArray(), end.toArray()],
    penetrationCount: 0
  };
}

test('buttoned crew are enclosed and unbuttoned commander owns a swept hit volume', () => {
  const tank = new Unit({
    id: 'exposure-target',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(5, 0, 7)
  });
  assert.equal(getUnbuttonedCommanderWorldPosition(tank), null);
  assert.equal(tank.mesh.userData.commanderFigure.visible, false);
  assert.equal(tank.mesh.userData.commanderHatches.length, 2);
  for (const hatch of tank.mesh.userData.commanderHatches) {
    assert.equal(
      hatch.rotation[hatch.userData.rotationAxis],
      hatch.userData.closedAngleRadians
    );
  }

  assert.equal(tank.toggleVehicleCommanderPosture(), 'UNBUTTONED');
  const center = getUnbuttonedCommanderWorldPosition(tank);
  assert.ok(center.y > tank.position.y + tank.vehicleSpec.dimensionsMeters.height);
  assert.equal(tank.mesh.userData.commanderFigure.visible, true);
  assert.ok(
    tank.mesh.userData.commanderFigure.position.y
      < center.y - tank.position.y
  );
  assert.equal(
    tank.mesh.userData.commanderFigure.userData.headgearId,
    'GERMAN_PANZER_PROTECTIVE_BERET_1940'
  );
  assert.ok(
    tank.mesh.userData.commanderFigure
      .getObjectByName('GermanPanzerProtectiveBeret1940')
  );
  for (const hatch of tank.mesh.userData.commanderHatches) {
    assert.equal(
      hatch.rotation[hatch.userData.rotationAxis],
      hatch.userData.openAngleRadians
    );
  }

  const directHit = intersectExposedVehicleCrew(
    new THREE.Vector3(center.x, center.y, center.z + 2),
    new THREE.Vector3(center.x, center.y, center.z - 2),
    tank
  );
  assert.equal(directHit.crewman.role, 'COMMANDER');
  assert.equal(directHit.hitVolumeId, 'exposed-commander');

  const miss = intersectExposedVehicleCrew(
    new THREE.Vector3(center.x + 2, center.y, center.z + 2),
    new THREE.Vector3(center.x + 2, center.y, center.z - 2),
    tank
  );
  assert.equal(miss, null);
});

test('small-arms swept ballistics hit and wound the exposed commander', () => {
  const tank = new Unit({
    id: 'small-arms-exposure-target',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  tank.toggleVehicleCommanderPosture();
  const commander = tank.getUnbuttonedCommander();
  const center = getUnbuttonedCommanderWorldPosition(tank);
  const projectile = projectileAcrossCommander(tank, center);
  const ballistics = new BallisticsSystem({
    terrain: { getHeightAt: () => 0 },
    getUnits: () => [tank]
  });
  const impact = ballistics.detectImpact(projectile);
  assert.equal(impact.kind, 'exposed_vehicle_crew');
  assert.equal(impact.agent.id, commander.id);

  const scene = new THREE.Scene();
  const combat = new CombatSystem(scene, sound, () => 0.5, {
    terrain: { getHeightAt: () => 0 },
    getUnits: () => [tank],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const previousHealth = commander.health;
  assert.equal(combat.resolveImpact(projectile, impact), false);
  assert.ok(commander.health < previousHealth);
  assert.ok(['WOUNDED', 'KIA'].includes(commander.status));
  assert.equal(tank.vehicleCrewPosture, 'BUTTONED');
  assert.equal(tank.mesh.userData.commanderFigure.visible, false);
  assert.equal(combat.telemetry.infantryHits, 1);
  assert.equal(
    combat.telemetry.impacts[0].crewResult.casualty.id,
    commander.id
  );
  assert.equal(
    combat.telemetry.impacts[0].crewResult.damage.cause,
    'unbuttoned_commander_hit'
  );
  combat.dispose();
});

test('commander posture and articulated hatch capture, restore, and close after casualty', () => {
  const tank = new Unit({
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const commander = tank.roster.find(
    person => person.role === 'COMMANDER'
  );
  assert.ok(commander);
  assert.equal(tank.toggleVehicleCommanderPosture(), 'UNBUTTONED');
  const state = tank.captureState();
  tank.toggleVehicleCommanderPosture();
  assert.equal(tank.vehicleCrewPosture, 'BUTTONED');

  tank.restoreState(state);
  assert.equal(tank.vehicleCrewPosture, 'UNBUTTONED');
  assert.equal(tank.mesh.userData.commanderFigure.visible, true);
  for (const hatch of tank.mesh.userData.commanderHatches) {
    assert.equal(
      hatch.rotation[hatch.userData.rotationAxis],
      hatch.userData.openAngleRadians
    );
  }

  const restoredCommander = tank.getUnbuttonedCommander();
  tank.applyExposedVehicleCrewDamage(restoredCommander.id, 200);
  assert.equal(restoredCommander.status, 'KIA');
  assert.equal(tank.vehicleCrewPosture, 'BUTTONED');
  assert.equal(tank.mesh.userData.commanderFigure.visible, false);
  assert.equal(tank.canUnbuttonCommander(), false);
  for (const hatch of tank.mesh.userData.commanderHatches) {
    assert.equal(
      hatch.rotation[hatch.userData.rotationAxis],
      hatch.userData.closedAngleRadians
    );
  }
});

test('French-service SOMUA S35 keeps its original hatchless cupola buttoned', () => {
  const tank = new Unit({
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'SOMUA_S35',
    position: new THREE.Vector3()
  });
  assert.equal(tank.vehicleSpec.observationEquipment.unbuttonedCommander, null);
  assert.equal(tank.canUnbuttonCommander(), false);
  assert.equal(tank.toggleVehicleCommanderPosture(), null);
  assert.equal(tank.vehicleCrewPosture, 'BUTTONED');
  assert.equal(tank.mesh.userData.commanderFigure, undefined);
  assert.deepEqual(tank.mesh.userData.commanderHatches, []);
});

test('Panzer III exposed commander and hatch follow turret rotation together', () => {
  const tank = new Unit({
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(2, 0, 3)
  });
  tank.toggleVehicleCommanderPosture();
  const before = getUnbuttonedCommanderWorldPosition(tank);
  tank.vehicleWeapon.turretYaw = Math.PI / 2;
  tank.mesh.userData.turret.rotation.y = tank.vehicleWeapon.turretYaw;
  tank.syncVehicleCommanderPresentation();
  const after = getUnbuttonedCommanderWorldPosition(tank);

  assert.notEqual(after.x, before.x);
  assert.notEqual(after.z, before.z);
  assert.equal(
    tank.mesh.userData.commanderFigure.rotation.y,
    Math.PI / 2
  );
  assert.equal(
    tank.mesh.userData.commanderHatches[0].parent.rotation.y,
    Math.PI / 2
  );
});
