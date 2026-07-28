import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  selectVehicleTargetWeapons,
  VEHICLE_TARGET_MODES,
  VEHICLE_WEAPON_SELECTION_MODEL_VERSION
} from '../src/simulation/combat/VehicleWeaponSelection.js';
import {
  FRANCE_1940_VEHICLES,
  getVehicle
} from '../src/content/france1940/vehicles.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import {
  getVehicleArmorAimPoint,
  intersectVehicleArmor
} from '../src/simulation/vehicles/VehicleArmorCollision.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

function targetWithVehicle(vehicleId) {
  return {
    id: `target-${vehicleId}`,
    type: 'vehicle',
    vehicleSpec: getVehicle(vehicleId)
  };
}

test('automatic vehicle fire selects AP for armor, HE for soft vehicles, and never coaxes armor', () => {
  const panzer = getVehicle('PANZER_III_D');
  const armored = selectVehicleTargetWeapons({
    vehicleSpec: panzer,
    target: targetWithVehicle('RENAULT_R35')
  });
  assert.deepEqual(armored, {
    modelVersion: VEHICLE_WEAPON_SELECTION_MODEL_VERSION,
    mode: VEHICLE_TARGET_MODES.AUTO,
    targetClass: 'armored-vehicle',
    fireMainGun: true,
    fireMachineGuns: false,
    mainAmmoType: 'ap'
  });

  const soft = selectVehicleTargetWeapons({
    vehicleSpec: panzer,
    target: targetWithVehicle('LAFFLY_S20TL')
  });
  assert.equal(soft.targetClass, 'soft-vehicle');
  assert.equal(soft.mainAmmoType, 'he');
  assert.equal(soft.fireMachineGuns, false);

  const infantry = selectVehicleTargetWeapons({
    vehicleSpec: panzer,
    target: { id: 'squad', type: 'infantry_squad' }
  });
  assert.equal(infantry.mainAmmoType, 'he');
  assert.equal(infantry.fireMainGun, true);
  assert.equal(infantry.fireMachineGuns, true);

  const area = selectVehicleTargetWeapons({ vehicleSpec: panzer });
  assert.equal(area.mainAmmoType, 'he');
  assert.equal(area.fireMachineGuns, false);
});

test('explicit AP, HE, and MG modes restrict the selected weapon system', () => {
  const vehicleSpec = getVehicle('PANZER_III_D');
  const armoredTarget = targetWithVehicle('RENAULT_R35');
  const ap = selectVehicleTargetWeapons({
    mode: VEHICLE_TARGET_MODES.AP,
    target: armoredTarget,
    vehicleSpec
  });
  const he = selectVehicleTargetWeapons({
    mode: VEHICLE_TARGET_MODES.HE,
    target: armoredTarget,
    vehicleSpec
  });
  const machineGuns = selectVehicleTargetWeapons({
    mode: VEHICLE_TARGET_MODES.MACHINE_GUNS,
    target: armoredTarget,
    vehicleSpec
  });
  assert.deepEqual(
    [ap.fireMainGun, ap.fireMachineGuns, ap.mainAmmoType],
    [true, false, 'ap']
  );
  assert.deepEqual(
    [he.fireMainGun, he.fireMachineGuns, he.mainAmmoType],
    [true, false, 'he']
  );
  assert.deepEqual(
    [
      machineGuns.fireMainGun,
      machineGuns.fireMachineGuns,
      machineGuns.mainAmmoType
    ],
    [false, true, null]
  );
});

test('Unit wiring aims vehicle weapons at a stable living soldier and honors MG-only mode', () => {
  const attacker = new Unit({
    id: 'selection-attacker',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'selection-target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 35)
  });
  attacker.targetMode = VEHICLE_TARGET_MODES.MACHINE_GUNS;
  const shots = [];
  for (let step = 0; step < 120 && shots.length === 0; step++) {
    attacker.updateVehicleSystems(1 / 30);
    attacker.updateVehicleCombat(1 / 30, {
      target,
      combat: {
        fireWeapon(_attacker, _target, _position, options) {
          shots.push(options);
          return true;
        }
      }
    });
  }

  assert.ok(shots.length > 0);
  assert.ok(shots.every(shot => ['coax', 'hull_mg'].includes(shot.mountId)));
  assert.ok(shots.every(shot => shot.targetSoldier?.id === 0));
  assert.equal(attacker.vehicleWeapon.roundsFired, 0);

  const snapshot = attacker.captureState();
  const restored = new Unit({
    id: attacker.id,
    faction: attacker.faction,
    type: 'vehicle',
    vehicleId: attacker.vehicleId
  });
  restored.restoreState(snapshot, new Map([
    [restored.id, restored],
    [target.id, target]
  ]));
  assert.equal(
    restored.targetMode,
    VEHICLE_TARGET_MODES.MACHINE_GUNS
  );
});

test('close-range fire aims through the target armor volume instead of above a small tank', () => {
  const attacker = new Unit({
    id: 'center-mass-attacker',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'center-mass-r35',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'RENAULT_R35',
    position: new THREE.Vector3(0, 0, 15)
  });
  const scene = new THREE.Scene();
  const combat = new CombatSystem(scene, {}, () => 0.999999, {
    getUnits: () => [attacker, target],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const muzzle = new THREE.Vector3(0, 1.5, 0);
  assert.equal(combat.fireWeapon(attacker, target, target.position, {
    weapon: getWeapon('KWK36_AP'),
    muzzlePosition: muzzle,
    dispersionScale: 0
  }), true);
  const projectile = combat.projectiles[0];
  const end = muzzle.clone().addScaledVector(
    projectile.velocity.clone().normalize(),
    30
  );

  assert.ok(intersectVehicleArmor(muzzle, end, target));
  combat.dispose();
});

test('every catalog vehicle center-mass aim point crosses its authored armor geometry', () => {
  for (const vehicleId of Object.keys(FRANCE_1940_VEHICLES)) {
    const target = new Unit({
      id: `aim-${vehicleId}`,
      faction: vehicleId.startsWith('PANZER')
        || vehicleId === 'SDKFZ_231'
        || vehicleId === 'OPEL_BLITZ'
        ? 'german'
        : 'french',
      type: 'vehicle',
      vehicleId,
      position: new THREE.Vector3()
    });
    const aim = getVehicleArmorAimPoint(target);
    assert.ok(aim, vehicleId);
    const start = new THREE.Vector3(aim.point[0], aim.point[1], 20);
    assert.ok(
      intersectVehicleArmor(start, new THREE.Vector3(...aim.point), target),
      `${vehicleId} aim point must cross an authored plate`
    );
  }
});
