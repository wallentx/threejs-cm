import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  VEHICLES,
  VEHICLE_MACHINE_GUN_MOUNTS
} from '../src/game/VehicleCatalog.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import {
  applyDirectComponentDamage,
  applyPenetrationComponentDamage,
  setVehicleComponentHealth
} from '../src/game/VehicleSystems.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const vehicleIds = [
  'SOMUA_S35',
  'RENAULT_R35',
  'RENAULT_D2',
  'HOTCHKISS_H39',
  'AMC_35',
  'PANHARD_178',
  'LAFFLY_S20TL',
  'CHAR_B1_BIS',
  'PANZER_III_D',
  'PANZER_II_C',
  'PANZER_35T',
  'PANZER_38T',
  'SDKFZ_231',
  'OPEL_BLITZ',
  'PANZER_IV_D'
];

function makeVehicle(vehicleId, id = vehicleId.toLowerCase()) {
  return new Unit({
    id,
    faction: vehicleId.startsWith('PANZER') || vehicleId.startsWith('SDKFZ')
      || vehicleId === 'OPEL_BLITZ' ? 'german' : 'french',
    type: 'vehicle',
    vehicleId,
    position: new THREE.Vector3()
  });
}

function killRole(unit, role) {
  const crewman = unit.roster.find(candidate => candidate.role === role);
  assert.ok(crewman, `${unit.vehicleId} must have ${role}`);
  crewman.health = 0;
  crewman.status = 'KIA';
  unit.syncLegacyVehicleDamage();
}

function sequenceRandom(values, fallback = 0) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function acquireVehicleTarget(vehicle, target) {
  vehicle.updateVehicleCombat(3, {
    target,
    combat: { fireWeapon: () => false }
  });
}

test('all 15 catalog vehicles explicitly own data-driven auxiliary weapon mount lists', () => {
  assert.deepEqual(Object.keys(VEHICLE_MACHINE_GUN_MOUNTS).sort(), [...vehicleIds].sort());
  for (const vehicleId of vehicleIds) {
    const spec = VEHICLES[vehicleId];
    assert.ok(Array.isArray(spec.weaponMounts));
    assert.equal(spec.weaponMounts.length, VEHICLE_MACHINE_GUN_MOUNTS[vehicleId].length);
    for (const mount of spec.weaponMounts) {
      const weapon = getWeapon(mount.weaponId);
      assert.ok(['coax', 'hull_mg', 'hull_main'].includes(mount.id));
      assert.ok(weapon.kind === 'machine_gun' || weapon.kind.startsWith('cannon_'));
      assert.ok(weapon.caliberMm > 0);
      assert.ok(weapon.cyclicRPM > 0);
      assert.ok(weapon.magazineSize > 0);
      assert.ok(weapon.reloadSeconds > 0);
      assert.ok(mount.carriedAmmo > 0);
      assert.ok(mount.crewRoles.length > 0);
      assert.match(mount.dataQuality, /historical|approximation/);
    }
  }
  assert.equal(VEHICLES.LAFFLY_S20TL.weaponMounts.length, 0);
  assert.equal(VEHICLES.OPEL_BLITZ.weaponMounts.length, 0);
});

test('coax and hull mounts retain their distinct crew dependencies', () => {
  const panzer = makeVehicle('PANZER_III_D');
  assert.equal(panzer.isVehicleMountOperational('coax'), true);
  assert.equal(panzer.isVehicleMountOperational('hull_mg'), true);

  killRole(panzer, 'GUNNER');
  assert.equal(panzer.isVehicleMountOperational('coax'), false);
  assert.equal(panzer.isVehicleMountOperational('hull_mg'), true);

  killRole(panzer, 'RADIO_OPERATOR');
  assert.equal(panzer.isVehicleMountOperational('hull_mg'), false);
  assert.equal(panzer.c2Radio, false);

  const somua = makeVehicle('SOMUA_S35');
  assert.equal(somua.isVehicleMountOperational('coax'), true);
  killRole(somua, 'COMMANDER_GUNNER');
  assert.equal(somua.isVehicleMountOperational('coax'), false);
  assert.equal(somua.hasOperationalGunner(), false);
});

test('vehicle machine gun consumes its own feed at catalog cadence from its named muzzle', () => {
  const panzer = makeVehicle('PANZER_III_D');
  const target = new Unit({
    id: 'mg_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 35)
  });
  panzer.vehicleWeapon.cooldown = 99;
  killRole(panzer, 'RADIO_OPERATOR');

  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.position.set(0.28, 1.55, 2.2);
  panzer.mesh.add(coaxMuzzle);
  panzer.mesh.userData.weaponMuzzles = { coax: coaxMuzzle };
  panzer.mesh.updateWorldMatrix(true, true);
  const expectedMuzzle = coaxMuzzle.getWorldPosition(new THREE.Vector3());

  const shots = [];
  const context = {
    target,
    combat: {
      fireWeapon(attacker, targetUnit, targetPos, options) {
        shots.push({ attacker, targetUnit, targetPos, options });
        return true;
      }
    }
  };
  const state = panzer.vehicleMounts.coax;
  const initialFeed = state.feedAmmo;
  acquireVehicleTarget(panzer, target);
  assert.equal(panzer.updateVehicleCombat(1 / 30, context), true);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].options.mountId, 'coax');
  assert.equal(shots[0].options.weapon.id, 'MG34_VEHICLE');
  assert.ok(shots[0].options.muzzlePosition.distanceTo(expectedMuzzle) < 1e-9);
  assert.equal(state.feedAmmo, initialFeed - 1);
  assert.equal(state.cooldown, 60 / getWeapon('MG34_VEHICLE').cyclicRPM);
  assert.equal(state.isFiring, true);

  assert.equal(panzer.updateVehicleCombat(1 / 30, context), false);
  assert.equal(shots.length, 1, 'cooldown must prevent an extra simulation shot');
  panzer.updateVehicleSystems(state.cooldown);
  assert.equal(panzer.updateVehicleCombat(1 / 30, context), true);
  assert.equal(shots.length, 2);
});

test('main gun occupies its gunner while an independently crewed hull gun may still fire', () => {
  const panzer = makeVehicle('PANZER_III_D', 'shared_gunner_vehicle');
  const target = new Unit({
    id: 'shared_gunner_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 35)
  });
  const coaxMuzzle = new THREE.Object3D();
  const hullMuzzle = new THREE.Object3D();
  coaxMuzzle.position.set(-0.25, 1.5, 2);
  hullMuzzle.position.set(0.25, 1.2, 2);
  panzer.mesh.add(coaxMuzzle, hullMuzzle);
  panzer.mesh.userData.weaponMuzzles = {
    coax: coaxMuzzle,
    hull_mg: hullMuzzle
  };
  const mountIds = [];
  acquireVehicleTarget(panzer, target);

  assert.equal(panzer.updateVehicleCombat(1 / 30, {
    target,
    combat: {
      fireWeapon(attacker, targetUnit, targetPosition, options) {
        mountIds.push(options.mountId);
        return true;
      }
    }
  }), true);

  assert.deepEqual(mountIds, ['main', 'hull_mg']);
  assert.equal(panzer.vehicleMounts.coax.roundsFired, 0);
  assert.equal(panzer.vehicleMounts.coax.fireState, 'CREW_BUSY');
  assert.equal(panzer.vehicleMounts.hull_mg.roundsFired, 1);
});

test('machine-gun cooldown preserves substep remainder across fixed simulation steps', () => {
  const panzer = makeVehicle('PANZER_II_C', 'cadence_vehicle');
  const target = new Unit({
    id: 'cadence_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 35)
  });
  panzer.vehicleWeapon.cooldown = 99;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 1.5, 2);
  panzer.mesh.add(muzzle);
  panzer.mesh.userData.weaponMuzzles = { coax: muzzle };
  let shots = 0;
  const context = {
    target,
    combat: { fireWeapon: () => { shots++; return true; } }
  };
  acquireVehicleTarget(panzer, target);

  for (let step = 0; step < 60; step++) {
    panzer.updateVehicleSystems(1 / 30);
    panzer.updateVehicleCombat(1 / 30, context);
  }
  const nominalShots = 2 * getWeapon('MG34_VEHICLE').cyclicRPM / 60;
  assert.ok(Math.abs(shots - nominalShots) <= 1, `${shots} shots must track ${nominalShots} nominal`);
});

test('machine-gun catch-up cadence is invariant across render rates and accelerated outer steps', () => {
  const runCadence = steps => {
    const panzer = makeVehicle('PANZER_II_C', `cadence_${steps.length}_${steps[0]}`);
    const target = new Unit({
      id: 'cadence_rate_target',
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3(0, 0, 35)
    });
    panzer.vehicleWeapon.cooldown = 99;
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 1.5, 2);
    panzer.mesh.add(muzzle);
    panzer.mesh.userData.weaponMuzzles = { coax: muzzle };
    let shots = 0;
    const context = {
      target,
      combat: { fireWeapon: () => { shots++; return true; } }
    };
    for (const delta of steps) {
      panzer.updateVehicleSystems(delta);
      panzer.updateVehicleCombat(delta, context);
    }
    return {
      shots,
      cooldown: panzer.vehicleMounts.coax.cooldown,
      feedAmmo: panzer.vehicleMounts.coax.feedAmmo,
      roundsFired: panzer.vehicleMounts.coax.roundsFired
    };
  };

  const duration = 1.2;
  const at10Fps = runCadence(Array.from({ length: 12 }, () => 1 / 10));
  const at30Fps = runCadence(Array.from({ length: 36 }, () => 1 / 30));
  const at60Fps = runCadence(Array.from({ length: 72 }, () => 1 / 60));
  const accelerated = runCadence([0.4, 0.4, 0.4]);

  for (const result of [at30Fps, at60Fps, accelerated]) {
    assert.equal(result.shots, at10Fps.shots);
    assert.equal(result.feedAmmo, at10Fps.feedAmmo);
    assert.equal(result.roundsFired, at10Fps.roundsFired);
    assert.ok(Math.abs(result.cooldown - at10Fps.cooldown) < 1e-9);
  }
});

test('machine-gun catch-up is bounded for pathological outer deltas', () => {
  const panzer = makeVehicle('PANZER_II_C', 'bounded_cadence_vehicle');
  const target = new Unit({
    id: 'bounded_cadence_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 35)
  });
  panzer.vehicleWeapon.cooldown = 99;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 1.5, 2);
  panzer.mesh.add(muzzle);
  panzer.mesh.userData.weaponMuzzles = { coax: muzzle };
  let shots = 0;

  panzer.updateVehicleSystems(10);
  panzer.updateVehicleCombat(10, {
    target,
    combat: { fireWeapon: () => { shots++; return true; } }
  });

  assert.equal(shots, 64);
  assert.ok(panzer.vehicleMounts.coax.cooldown > 0);
});

test('a machine-gun mount without a renderer-supplied muzzle marker cannot fire', () => {
  const panzer = makeVehicle('PANZER_II_C');
  const target = new Unit({
    id: 'missing_muzzle_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 25)
  });
  panzer.vehicleWeapon.cooldown = 99;
  delete panzer.mesh.userData.weaponMuzzles;
  delete panzer.mesh.userData.mountMuzzles;
  let shots = 0;
  panzer.updateVehicleCombat(1 / 30, {
    target,
    combat: { fireWeapon: () => { shots++; return true; } }
  });
  assert.equal(shots, 0);
  assert.equal(panzer.vehicleMounts.coax.fireState, 'NO_MUZZLE');
});

test('named vehicle mount muzzle reaches the real projectile and telemetry path', () => {
  const panzer = makeVehicle('PANZER_II_C');
  const target = new Unit({
    id: 'projectile_mg_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 40)
  });
  panzer.vehicleWeapon.cooldown = 99;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(-0.22, 1.48, 2.05);
  panzer.mesh.add(muzzle);
  panzer.mesh.userData.weaponMuzzles = { coax: muzzle };
  const scene = new THREE.Scene();
  scene.add(panzer.mesh, target.mesh);
  const combat = new CombatSystem(scene, {}, () => 0.5, {
    getUnits: () => [panzer, target],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const expected = panzer.getVehicleMountMuzzleWorldPosition('coax');
  acquireVehicleTarget(panzer, target);

  assert.equal(panzer.updateVehicleCombat(1 / 30, { target, combat }), true);
  assert.equal(combat.projectiles.length, 1);
  assert.equal(combat.projectiles[0].mountId, 'coax');
  assert.equal(combat.projectiles[0].weapon.id, 'MG34_VEHICLE');
  assert.ok(combat.projectiles[0].position.distanceTo(expected) < 1e-9);
  combat.recordImpact(combat.projectiles[0], {
    kind: 'terrain',
    point: combat.projectiles[0].position.clone(),
    unit: null
  });
  assert.equal(combat.telemetry.impacts[0].mountId, 'coax');
  combat.reset();
});

test('penetration component damage is deterministic and disabled engine prevents movement', () => {
  const damage = unit => unit.applyArmorHit({
    penetrated: true,
    zone: 'hull_side',
    residualRatio: 1,
    weapon: getWeapon('SA35_AP'),
    random: sequenceRandom([0, 0, 0.34, 0.9])
  });
  const first = makeVehicle('PANZER_III_D', 'damage_a');
  const second = makeVehicle('PANZER_III_D', 'damage_b');
  damage(first);
  damage(second);

  assert.equal(first.vehicleComponents.engine.status, 'DISABLED');
  assert.equal(first.vehicleComponents.engine.operational, false);
  assert.equal(first.vehicleDamage.engine, 'DESTROYED');
  assert.equal(first.getVehicleMovementFactor(), 0);
  assert.deepEqual(first.getVehicleDamageReport().components, second.getVehicleDamageReport().components);
  assert.deepEqual(first.vehicleDamageState.events, second.vehicleDamageState.events);
});

test('authored track-zone penetrations damage tracks instead of arbitrary hull-side modules', () => {
  const somua = makeVehicle('SOMUA_S35', 'track_zone_damage');
  const result = somua.applyArmorHit({
    penetrated: true,
    zone: 'track_left',
    damageZone: 'hull_side',
    componentZone: 'track_left',
    residualRatio: 1,
    weapon: getWeapon('KWK36_AP'),
    random: sequenceRandom([0, 0, 0])
  });

  assert.deepEqual(result.components.map(component => component.id), ['tracks']);
  assert.equal(somua.vehicleComponents.tracks.status, 'DAMAGED');
  assert.equal(somua.vehicleComponents.engine.status, 'OK');
  assert.equal(somua.vehicleComponents.fuel.status, 'OK');
});

test('model-local penetration paths damage only intersected SOMUA crew and modules', () => {
  const somua = makeVehicle('SOMUA_S35', 'internal_path_damage');
  const driver = somua.roster.find(crewman => crewman.role === 'DRIVER');
  const radioOperator = somua.roster.find(crewman => crewman.role === 'RADIO_OPERATOR');
  const result = somua.applyArmorHit({
    penetrated: true,
    zone: 'hull_front',
    residualRatio: 1,
    weapon: getWeapon('KWK36_AP'),
    internalPathHits: [
      {
        id: 'crew-driver',
        kind: 'crew',
        componentId: null,
        crewRoles: ['DRIVER'],
        entryPoint: [0, 1, 1],
        exitPoint: [0, 1, 0.5],
        entryDistanceMeters: 0.5,
        exitDistanceMeters: 1,
        pathLengthMeters: 0.5,
        layoutVersion: 'model-local-obb-path-v1',
        dataQuality: 'gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        crewRoles: [],
        entryPoint: [0, 1, -1],
        exitPoint: [0, 1, -2],
        entryDistanceMeters: 2,
        exitDistanceMeters: 3,
        pathLengthMeters: 1,
        layoutVersion: 'model-local-obb-path-v1',
        dataQuality: 'gameplay approximation'
      }
    ],
    random: sequenceRandom([0, 0])
  });

  assert.equal(driver.status, 'WOUNDED');
  assert.equal(driver.health, 35);
  assert.equal(radioOperator.status, 'OK');
  assert.equal(result.casualty, driver);
  assert.deepEqual(result.casualties, [driver]);
  assert.deepEqual(result.components.map(component => component.id), ['engine']);
  assert.equal(somua.vehicleComponents.engine.health, 68);
  for (const untouched of ['fuel', 'ammunition', 'radio', 'transmission', 'tracks']) {
    assert.equal(somua.vehicleComponents[untouched].health, 100, untouched);
  }
  assert.ok(somua.vehicleDamageState.events.some(event =>
    event.type === 'crew_hit'
      && event.internalVolumeId === 'crew-driver'
      && event.cause === 'model_local_penetration_path'));
  assert.ok(somua.vehicleDamageState.events.some(event =>
    event.type === 'component_damage'
      && event.internalVolumeId === 'module-engine'
      && event.cause === 'model_local_penetration_path'));
});

test('damaged mobility and traverse components degrade their authoritative mechanisms', () => {
  const panzer = makeVehicle('PANZER_III_D');
  panzer.mesh.userData.weaponMuzzles = {};
  panzer.applyArmorHit({
    penetrated: true,
    zone: 'hull_side',
    residualRatio: 1,
    weapon: getWeapon('SA35_AP'),
    random: sequenceRandom([0, 0, 0.34, 0])
  });
  assert.equal(panzer.vehicleComponents.engine.status, 'DAMAGED');
  assert.ok(panzer.getVehicleMovementFactor() < 1);
  assert.ok(panzer.getVehicleMovementFactor() > 0);

  const turret = makeVehicle('PANZER_III_D', 'traverse_damage');
  turret.applyArmorHit({
    penetrated: true,
    zone: 'turret_front',
    residualRatio: 1,
    weapon: getWeapon('SA35_AP'),
    random: sequenceRandom([0, 0, 0.4, 0])
  });
  assert.equal(turret.vehicleComponents.turret_traverse.status, 'DAMAGED');
  const target = new Unit({
    id: 'traverse_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(30, 0, 0)
  });
  turret.vehicleWeapon.cooldown = 99;
  turret.updateVehicleCombat(1, {
    target,
    combat: { fireWeapon: () => false }
  });
  assert.ok(Math.abs(turret.vehicleWeapon.turretYaw - 0.105) < 1e-9);
});

test('fuel fire spreads, vents live ammunition, and deterministically cooks off', () => {
  const panzer = makeVehicle('PANZER_III_D');
  applyDirectComponentDamage({
    components: panzer.vehicleComponents,
    damageState: panzer.vehicleDamageState,
    componentId: 'fuel',
    damageAmount: 100,
    random: sequenceRandom([0, 0.25, 0.5])
  });
  assert.equal(panzer.vehicleDamageState.fire.phase, 'FUEL_FIRE');
  assert.equal(panzer.getVehicleMovementFactor(), 0);

  panzer.updateVehicleSystems(3.25);
  assert.equal(panzer.vehicleDamageState.fire.phase, 'SPREADING_FIRE');
  assert.equal(panzer.vehicleComponents.engine.status, 'DISABLED');
  assert.equal(panzer.vehicleComponents.transmission.status, 'DAMAGED');

  const spreadingSnapshot = panzer.captureState();
  const partitioned = makeVehicle('PANZER_III_D', panzer.id);
  partitioned.restoreState(spreadingSnapshot, new Map([[partitioned.id, partitioned]]));
  panzer.updateVehicleSystems(6.5);
  for (let step = 0; step < 65; step++) partitioned.updateVehicleSystems(0.1);
  assert.equal(panzer.vehicleDamageState.fire.phase, 'AMMUNITION_VENTING');
  assert.equal(partitioned.vehicleDamageState.fire.phase, 'AMMUNITION_VENTING');
  assert.deepEqual(partitioned.vehicleComponents, panzer.vehicleComponents);

  panzer.updateVehicleSystems(2.2);
  partitioned.updateVehicleSystems(2.2);
  const report = panzer.getVehicleDamageReport();
  assert.equal(report.burning, true);
  assert.equal(report.destroyed, true);
  assert.equal(report.secondaryExplosion, true);
  assert.equal(report.fire.phase, 'DETONATED');
  assert.equal(panzer.vehicleDamage.hull, 'DESTROYED');
  assert.ok(report.events.some(event => event.type === 'secondary_explosion'));
  assert.ok(report.events.some(event => event.type === 'ammunition_venting'));
  assert.equal(report.version, report.eventVersion);
  assert.ok(report.eventVersion > 0);
  assert.equal(panzer.getLivingCrew().length, 0);
  assert.ok(panzer.roster.every(crewman => crewman.status === 'KIA'));
  assert.deepEqual(panzer.vehicleWeapon.ammunition, { ap: 0, he: 0 });
  assert.equal(panzer.vehicleWeapon.feedAmmo, 0);
  assert.equal(panzer.vehicleWeapon.loadedType, null);
  assert.equal(panzer.vehicleMounts.coax.feedAmmo, 0);
  assert.equal(panzer.vehicleMounts.coax.reserveAmmo, 0);
  assert.equal(panzer.vehicleMounts.hull_mg.feedAmmo, 0);
  assert.equal(panzer.vehicleMounts.hull_mg.reserveAmmo, 0);
  for (const component of Object.values(panzer.vehicleComponents)) {
    if (!component.installed) continue;
    assert.equal(component.health, 0, component.id);
    assert.equal(component.status, 'DESTROYED', component.id);
    assert.equal(component.operational, false, component.id);
  }
  assert.ok(report.events.some(event =>
    event.type === 'component_damage'
      && event.id === 'main_gun'
      && event.cause === 'ammunition_cookoff'));
  assert.ok(report.events.some(event =>
    event.type === 'component_damage'
      && event.id === 'optics'
      && event.cause === 'ammunition_cookoff'));
  assert.deepEqual(partitioned.vehicleComponents, panzer.vehicleComponents);
  assert.deepEqual(
    partitioned.captureState().vehicleDamageState,
    panzer.captureState().vehicleDamageState
  );
  assert.deepEqual(partitioned.roster, panzer.roster);

  const halfPostBlastDuration = panzer.vehicleDamageState.fire.postBlastDurationSeconds / 2;
  panzer.updateVehicleSystems(halfPostBlastDuration);
  for (let step = 0; step < halfPostBlastDuration / 0.25; step++) {
    partitioned.updateVehicleSystems(0.25);
  }
  assert.equal(panzer.vehicleDamageState.fire.phase, 'DETONATED');
  assert.equal(panzer.vehicleDamageState.burning, true);
  panzer.updateVehicleSystems(halfPostBlastDuration);
  for (let step = 0; step < halfPostBlastDuration / 0.25; step++) {
    partitioned.updateVehicleSystems(0.25);
  }
  assert.equal(panzer.vehicleDamageState.fire.phase, 'BURNED_OUT');
  assert.equal(panzer.vehicleDamageState.burning, false);
  assert.ok(panzer.vehicleDamageState.events.some(event =>
    event.type === 'post_blast_fire_ended'));
  assert.deepEqual(
    partitioned.captureState().vehicleDamageState,
    panzer.captureState().vehicleDamageState
  );
});

test('fuel fire burns out a vehicle when no cannon ammunition remains', () => {
  const transport = makeVehicle('OPEL_BLITZ', 'fuel_burnout_transport');
  applyDirectComponentDamage({
    components: transport.vehicleComponents,
    damageState: transport.vehicleDamageState,
    componentId: 'fuel',
    damageAmount: 100,
    random: sequenceRandom([0, 0, 0])
  });

  transport.updateVehicleSystems(3.25 + 5.5);
  assert.equal(transport.vehicleDamageState.fire.phase, 'BURNED_OUT');
  assert.equal(transport.vehicleDamageState.destroyed, true);
  assert.equal(transport.vehicleComponents.engine.status, 'DESTROYED');
  assert.equal(transport.vehicleComponents.transmission.status, 'DESTROYED');
  assert.ok(transport.vehicleDamageState.events.some(event =>
    event.type === 'vehicle_burned_out'));
});

test('unarmed transports have no ammunition component and cannot ammunition-explode', () => {
  for (const vehicleId of ['LAFFLY_S20TL', 'OPEL_BLITZ']) {
    const transport = makeVehicle(vehicleId, `unarmed_ammo_${vehicleId}`);
    assert.equal(transport.vehicleComponents.ammunition.installed, false);
    assert.equal(setVehicleComponentHealth(transport.vehicleComponents, 'ammunition', 0), null);

    applyPenetrationComponentDamage({
      components: transport.vehicleComponents,
      damageState: transport.vehicleDamageState,
      zone: 'hull_side',
      residualRatio: 1.6,
      random: () => 0
    });
    assert.equal(transport.vehicleDamageState.secondaryExplosion, false);
    assert.equal(
      transport.vehicleDamageState.events
        .some(event => event.type === 'secondary_explosion' && event.source === 'ammunition'),
      false
    );
  }
});

test('disabled ammunition stowage blocks future reloads but not an already chambered round', () => {
  const panzer = makeVehicle('PANZER_III_D', 'disabled_ammunition_vehicle');
  const target = makeVehicle('SOMUA_S35', 'disabled_ammunition_target');
  target.position.set(0, 0, 40);
  target.mesh.position.copy(target.position);
  panzer.vehicleWeapon.cooldown = 0;
  assert.equal(panzer.vehicleComponents.ammunition.installed, true);
  setVehicleComponentHealth(panzer.vehicleComponents, 'ammunition', 20);

  let mainShots = 0;
  acquireVehicleTarget(panzer, target);
  const fired = panzer.updateVehicleCombat(1 / 30, {
    target,
    combat: {
      fireWeapon(attacker, targetUnit, targetPos, options) {
        if (options.mountId === 'main') mainShots++;
        return true;
      }
    }
  });
  assert.equal(fired, true);
  assert.equal(mainShots, 1, 'already chambered main-gun round remains usable');
  assert.equal(panzer.vehicleWeapon.loadedType, null);
  assert.equal(panzer.vehicleWeapon.reloadTimer, 0);
  assert.equal(panzer.beginVehicleReload('ap'), false);

  const coax = panzer.vehicleMounts.coax;
  coax.feedAmmo = 0;
  assert.ok(coax.reserveAmmo > 0);
  assert.equal(panzer.beginVehicleMountReload('coax'), false);
  panzer.updateVehicleSystems(0.1);
  assert.equal(panzer.vehicleWeapon.fireState, 'AMMO_STOWAGE_DISABLED');
  assert.equal(coax.fireState, 'AMMO_STOWAGE_DISABLED');
});

test('disabled hull component does not make a crewed vehicle vanish from combat', () => {
  const panzer = makeVehicle('PANZER_III_D', 'disabled_hull_vehicle');
  setVehicleComponentHealth(panzer.vehicleComponents, 'hull', 20);
  panzer.syncLegacyVehicleDamage();

  assert.equal(panzer.vehicleDamage.hull, 'DESTROYED');
  assert.equal(panzer.vehicleDamageState.destroyed, false);
  assert.equal(panzer.getLivingCrew().length, panzer.roster.length);
  assert.equal(panzer.isCombatEffective(), true);
  assert.equal(panzer.canVehicleFire(), true);
});

test('damaged ammunition stowage slows main and mounted-weapon handling deterministically', () => {
  const healthy = makeVehicle('PANZER_III_D', 'healthy_ammunition_handling');
  const damaged = makeVehicle('PANZER_III_D', 'damaged_ammunition_handling');
  for (const vehicle of [healthy, damaged]) {
    vehicle.vehicleWeapon.loadedType = null;
    vehicle.vehicleWeapon.feedAmmo = 0;
    vehicle.vehicleMounts.coax.feedAmmo = 0;
    assert.equal(vehicle.beginVehicleReload('ap'), true);
    assert.equal(vehicle.beginVehicleMountReload('coax'), true);
  }
  setVehicleComponentHealth(damaged.vehicleComponents, 'ammunition', 50);

  const healthyMainBefore = healthy.vehicleWeapon.reloadTimer;
  const damagedMainBefore = damaged.vehicleWeapon.reloadTimer;
  const healthyMountBefore = healthy.vehicleMounts.coax.reloadTimer;
  const damagedMountBefore = damaged.vehicleMounts.coax.reloadTimer;
  healthy.updateVehicleSystems(1);
  damaged.updateVehicleSystems(1);

  assert.equal(healthyMainBefore - healthy.vehicleWeapon.reloadTimer, 1);
  assert.equal(healthyMountBefore - healthy.vehicleMounts.coax.reloadTimer, 1);
  assert.ok(Math.abs(damagedMainBefore - damaged.vehicleWeapon.reloadTimer - 0.55) < 1e-9);
  assert.ok(Math.abs(damagedMountBefore - damaged.vehicleMounts.coax.reloadTimer - 0.55) < 1e-9);
});

test('vehicle components, mount fire state, targets, and events survive capture and restore', () => {
  const source = makeVehicle('PANZER_III_D', 'rollback_vehicle');
  source.vehicleMounts.coax.feedAmmo = 17;
  source.vehicleMounts.coax.reserveAmmo = 203;
  source.vehicleMounts.coax.cooldown = -0.04;
  source.vehicleMounts.coax.targetUnitId = 'rollback_target';
  source.vehicleMounts.coax.targetPos = [3, 2, 1];
  source.vehicleMounts.coax.fireState = 'FIRING';
  source.vehicleMounts.coax.isFiring = true;
  source.applyArmorHit({
    penetrated: true,
    zone: 'hull_side',
    residualRatio: 1,
    weapon: getWeapon('SA35_AP'),
    random: sequenceRandom([0, 0, 0.34, 0])
  });
  const captured = source.captureState();

  const restored = makeVehicle('PANZER_III_D', 'rollback_vehicle');
  restored.restoreState(captured, new Map([[restored.id, restored]]));
  assert.deepEqual(restored.getVehicleDamageReport(), source.getVehicleDamageReport());
  assert.deepEqual(restored.captureState().vehicleMounts, captured.vehicleMounts);
  assert.notEqual(restored.vehicleComponents, source.vehicleComponents);
  assert.notEqual(restored.vehicleDamageState.events, source.vehicleDamageState.events);
});

test('legacy five-string rollback state migrates into authoritative components', () => {
  const source = makeVehicle('PANZER_III_D', 'legacy_rollback_vehicle');
  const legacyState = source.captureState();
  delete legacyState.vehicleComponents;
  delete legacyState.vehicleDamageState;
  delete legacyState.vehicleMounts;
  legacyState.vehicleDamage = {
    hull: 'OK',
    turret: 'DAMAGED',
    gun: 'DESTROYED',
    engine: 'DAMAGED',
    tracks: 'DESTROYED'
  };

  source.restoreState(legacyState, new Map([[source.id, source]]));
  assert.equal(source.vehicleComponents.turret_traverse.status, 'DAMAGED');
  assert.equal(source.vehicleComponents.main_gun.status, 'DESTROYED');
  assert.equal(source.vehicleComponents.breech.status, 'DESTROYED');
  assert.equal(source.vehicleComponents.engine.status, 'DAMAGED');
  assert.equal(source.vehicleComponents.tracks.status, 'DESTROYED');
  assert.equal(source.hasOperationalGunner(), false);
  assert.equal(source.getVehicleMovementFactor(), 0);
});
