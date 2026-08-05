import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  getVehicleMountCadenceRPM,
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
import {
  createVehicleLocalAimPoint,
  resolveVehicleLocalAimPoint,
  selectVehicleTargetSoldier
} from '../src/simulation/combat/VehicleTargeting.js';

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
    mountIds: [],
    mountAmmoTypes: {},
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

test('Char B1 bis hull 75 mm owns separate HE and APHE target modes', () => {
  const char = getVehicle('CHAR_B1_BIS');
  const infantry = { id: 'infantry', type: 'infantry_squad' };
  const he = selectVehicleTargetWeapons({
    mode: VEHICLE_TARGET_MODES.HULL_HE,
    target: infantry,
    vehicleSpec: char
  });
  const aphe = selectVehicleTargetWeapons({
    mode: VEHICLE_TARGET_MODES.HULL_APHE,
    target: targetWithVehicle('PANZER_III_D'),
    vehicleSpec: char
  });
  assert.deepEqual(he.mountIds, ['hull_main']);
  assert.deepEqual(he.mountAmmoTypes, { hull_main: 'he' });
  assert.equal(he.fireMainGun, false);
  assert.deepEqual(aphe.mountIds, ['hull_main']);
  assert.deepEqual(aphe.mountAmmoTypes, { hull_main: 'aphe' });
});

test('Char B1 bis hull ammunition preserves documented shell and sight data', () => {
  const char = getVehicle('CHAR_B1_BIS');
  const mount = char.weaponMounts.find(candidate => candidate.id === 'hull_main');
  const he = getWeapon('ABS_SA35_75_HE');
  const aphe = getWeapon('ABS_SA35_75_APHE');

  assert.deepEqual(mount.ammunition, { he: 67, aphe: 7 });
  assert.deepEqual(
    [he.projectileMassKg, he.explosiveFillKg, he.muzzleVelocity, he.maxRange],
    [5.55, 0.74, 500, 1600]
  );
  assert.deepEqual(
    [aphe.projectileMassKg, aphe.explosiveFillKg, aphe.muzzleVelocity, aphe.maxRange],
    [6.4, 0.09, 470, 1560]
  );
  assert.deepEqual(aphe.penetrationReference, {
    thicknessMm: 40,
    rangeMeters: 400,
    incidenceDegrees: 30
  });
  assert.equal(mount.optics.sightId, 'L.710');
  assert.equal(mount.optics.sightCount, 2);
  assert.equal(mount.optics.horizontalFovDegrees, 11.5);
  assert.deepEqual(mount.layingMechanism, {
    horizontal: 'whole_hull_traverse',
    system: 'Naeder hydrostatic steering system',
    elevationDegrees: { min: -15, max: 25 },
    dataQuality: 'fixed horizontal mounting, Naeder hull laying, and elevation limits are secondary-source historical data; runtime traverse rate is a labeled gameplay approximation'
  });
});

test('Char B1 bis hull HE cadence drops after six ready-fused rounds', () => {
  const mount = getVehicle('CHAR_B1_BIS').weaponMounts
    .find(candidate => candidate.id === 'hull_main');
  const weapon = getWeapon('ABS_SA35_75_HE');
  assert.equal(getVehicleMountCadenceRPM({
    mount,
    state: { loadedType: 'he', roundsFiredByType: { he: 5 } },
    weapon
  }), 6);
  assert.equal(getVehicleMountCadenceRPM({
    mount,
    state: { loadedType: 'he', roundsFiredByType: { he: 6 } },
    weapon
  }), 3);
  assert.equal(getVehicleMountCadenceRPM({
    mount,
    state: { loadedType: 'aphe', roundsFiredByType: { aphe: 6 } },
    weapon: getWeapon('ABS_SA35_75_APHE')
  }), 6);
});

test('Char B1 bis hull 75 mm fires from its own muzzle and typed ammunition state', () => {
  const attacker = new Unit({
    id: 'char-hull-gun',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'char-hull-target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 45)
  });
  attacker.targetMode = VEHICLE_TARGET_MODES.HULL_HE;
  const shots = [];
  for (let step = 0; step < 240 && shots.length === 0; step++) {
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
  assert.equal(shots.length, 1);
  assert.equal(shots[0].mountId, 'hull_main');
  assert.equal(shots[0].weapon.id, 'ABS_SA35_75_HE');
  assert.ok(shots[0].muzzlePosition?.isVector3);
  assert.equal(attacker.vehicleWeapon.roundsFired, 0);
  assert.equal(attacker.vehicleMounts.hull_main.roundsFired, 1);
  assert.equal(attacker.vehicleMounts.hull_main.ammunition.he, 66);
  assert.equal(attacker.vehicleMounts.hull_main.ammunition.aphe, 7);
});

test('Char B1 bis APHE order reloads and consumes one of seven hull rounds', () => {
  const attacker = new Unit({
    id: 'char-hull-aphe',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'char-hull-aphe-target',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, 45)
  });
  attacker.targetMode = VEHICLE_TARGET_MODES.HULL_APHE;
  const shots = [];
  for (let step = 0; step < 420 && shots.length === 0; step++) {
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
  assert.equal(shots.length, 1);
  assert.equal(shots[0].weapon.id, 'ABS_SA35_75_APHE');
  assert.equal(attacker.vehicleMounts.hull_main.ammunition.he, 67);
  assert.equal(attacker.vehicleMounts.hull_main.ammunition.aphe, 6);
});

test('ordered AP fire uses the retained aim point through a brief precision-contact drop', () => {
  const attacker = new Unit({
    id: 'retained-aim-attacker',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'retained-aim-target',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'SOMUA_S35',
    position: new THREE.Vector3(10, 0, 45)
  });
  attacker.targetMode = VEHICLE_TARGET_MODES.AP;
  attacker.targetUnit = target;
  attacker.targetPos = target.position.clone();
  attacker.vehicleWeapon.loadedType = 'ap';
  attacker.vehicleWeapon.feedAmmo = 1;
  attacker.applySuppression(100);
  assert.equal(attacker.suppression, 65);
  assert.equal(attacker.morale, 'Pinned');

  const shots = [];
  for (let step = 0; step < 360 && shots.length === 0; step++) {
    attacker.updateVehicleSystems(1 / 30);
    attacker.updateVehicleCombat(1 / 30, {
      target: null,
      shooterMoving: false,
      targetMoving: false,
      combat: {
        fireWeapon(_attacker, resolvedTarget, position, options) {
          shots.push({
            resolvedTarget,
            position: position.toArray(),
            options
          });
          return true;
        }
      }
    });
  }

  assert.equal(shots.length, 1);
  assert.equal(shots[0].resolvedTarget, null);
  assert.deepEqual(shots[0].position, target.position.toArray());
  assert.equal(shots[0].options.mountId, 'main');
  assert.equal(attacker.rotation, 0, 'turreted AP fire must not rotate the hull');
});

test('Char B1 bis Naeder laying stops movement and traverses the hull before firing', () => {
  const attacker = new Unit({
    id: 'char-naeder-aim',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'char-naeder-target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(45, 0, 0)
  });
  attacker.targetUnit = target;
  attacker.targetPos = target.position.clone();
  attacker.targetMode = VEHICLE_TARGET_MODES.HULL_HE;
  attacker.addWaypoint(new THREE.Vector3(0, 0, 20), 'MOVE');
  const shots = [];
  const terrain = {
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };

  for (let step = 0; step < 1000 && shots.length === 0; step++) {
    attacker.update(1 / 30, terrain);
    attacker.updateVehicleCombat(1 / 30, {
      target,
      shooterMoving: false,
      combat: {
        fireWeapon(_attacker, _target, _position, options) {
          shots.push(options);
          return true;
        }
      }
    });
  }

  assert.equal(attacker.position.z, 0);
  assert.ok(attacker.rotation > 1.4);
  assert.equal(shots.length, 1);
  assert.ok(Math.abs(attacker.rotation - Math.PI / 2) < 0.12);
  assert.equal(shots[0].mountId, 'hull_main');
});

test('automatic anti-infantry fire emits turret HE and independent machine-gun fire', () => {
  const attacker = new Unit({
    id: 'auto-combined-arms',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'auto-combined-target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 40)
  });
  attacker.targetMode = VEHICLE_TARGET_MODES.AUTO;
  const shots = [];
  for (let step = 0; step < 900; step++) {
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
    if (
      shots.some(shot => shot.mountId === 'main' && shot.weapon.id === 'KWK36_HE')
      && shots.some(shot => ['coax', 'hull_mg'].includes(shot.mountId))
    ) break;
  }
  assert.ok(shots.some(shot =>
    shot.mountId === 'main' && shot.weapon.id === 'KWK36_HE'
  ));
  assert.ok(shots.some(shot => ['coax', 'hull_mg'].includes(shot.mountId)));
  assert.ok(new Set(
    shots.filter(shot => shot.targetSoldier).map(shot => shot.targetSoldier.id)
  ).size > 1);
});

test('Unit wiring gives each vehicle weapon a stable living soldier and honors MG-only mode', () => {
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
  const emittedCombat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    vfxProvider: TEST_VFX_PROVIDER
  });
  for (let step = 0; step < 120 && shots.length === 0; step++) {
    attacker.updateVehicleSystems(1 / 30);
    attacker.updateVehicleCombat(1 / 30, {
      target,
      combat: {
        fireWeapon(realAttacker, realTarget, position, options) {
          shots.push(options);
          return emittedCombat.fireWeapon(
            realAttacker,
            realTarget,
            position,
            options
          );
        }
      }
    });
  }

  assert.ok(shots.length > 0);
  assert.ok(shots.every(shot => ['coax', 'hull_mg'].includes(shot.mountId)));
  assert.ok(shots.every(shot => shot.targetSoldier?.isAlive));
  assert.notEqual(
    attacker.vehicleMounts.coax.targetSoldierId,
    attacker.vehicleMounts.hull_mg.targetSoldierId
  );
  assert.equal(attacker.vehicleWeapon.roundsFired, 0);
  assert.ok(attacker.recentFireActivitySeconds > 0);

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

test('vehicle weapon channels retain a live pixeltruppen target then shift after casualty', () => {
  const living = [0, 1, 2, 3].map(id => ({ id, isAlive: true }));
  const first = selectVehicleTargetSoldier({
    livingSoldiers: living,
    channelId: 'coax',
    roundsFired: 12
  });
  assert.equal(selectVehicleTargetSoldier({
    livingSoldiers: living,
    preferredSoldierId: first.id,
    channelId: 'coax',
    roundsFired: 99
  }), first);
  const survivors = living.filter(soldier => soldier.id !== first.id);
  const shifted = selectVehicleTargetSoldier({
    livingSoldiers: survivors,
    preferredSoldierId: first.id,
    channelId: 'coax',
    roundsFired: 12
  });
  assert.ok(shifted);
  assert.notEqual(shifted.id, first.id);
});

test('clicked vehicle aim location stays model-local as the target moves and turns', () => {
  const target = {
    position: new THREE.Vector3(10, 2, 20),
    rotation: Math.PI / 4
  };
  const clicked = new THREE.Vector3(10.8, 3.7, 20.4);
  const intent = createVehicleLocalAimPoint(target, clicked);
  assert.deepEqual(
    resolveVehicleLocalAimPoint(target, intent).map(value => Number(value.toFixed(8))),
    clicked.toArray()
  );

  target.position.set(14, 2, 24);
  target.rotation += Math.PI / 2;
  const moved = resolveVehicleLocalAimPoint(target, intent);
  assert.notDeepEqual(moved, clicked.toArray());
  assert.equal(Number((moved[1] - target.position.y).toFixed(8)), 1.7);
});

test('vehicle fire passes the selected armor surface point through rollback state', () => {
  const attacker = new Unit({
    id: 'surface-aim-attacker',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'surface-aim-target',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, 40)
  });
  const clicked = new THREE.Vector3(0.7, 2.05, 39.4);
  attacker.targetUnit = target;
  attacker.targetPos = clicked.clone();
  attacker.targetAimIntent = createVehicleLocalAimPoint(target, clicked);
  attacker.targetMode = VEHICLE_TARGET_MODES.AP;
  const shots = [];
  for (let step = 0; step < 180 && shots.length === 0; step++) {
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
  assert.equal(shots.length, 1);
  assert.deepEqual(shots[0].aimPoint, clicked.toArray());

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
  assert.deepEqual(restored.targetAimIntent, attacker.targetAimIntent);
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
