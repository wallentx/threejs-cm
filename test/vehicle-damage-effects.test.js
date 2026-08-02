import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  VehicleDamageEffects,
  getVehicleVisualDamage
} from '../src/world/VehicleDamageEffects.js';
import {
  createVehiclePhysicsState
} from '../src/simulation/vehicles/VehiclePhysics.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

function createVehicle() {
  const mesh = new THREE.Group();
  mesh.userData.modelMetadata = {
    dimensionsMeters: { length: 5, width: 2.4, height: 2.2 }
  };
  const barrel = new THREE.Group();
  mesh.add(barrel);
  mesh.userData.barrel = barrel;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f1df,
    roughness: 0.72,
    metalness: 0.18
  });
  bodyMaterial.userData.materialSlot = 'paint';
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), bodyMaterial);
  body.name = 'TestVehiclePaintedBody';
  mesh.add(body);
  mesh.userData.testBody = body;
  return {
    id: 'test_vehicle',
    vehicleSpec: { id: 'TEST' },
    vehicleDamage: {
      hull: 'OK',
      turret: 'OK',
      gun: 'OK',
      engine: 'OK',
      tracks: 'OK'
    },
    currentLOD: 'high',
    mesh
  };
}

test('vehicle damage effects translate authoritative component state into persistent fire', () => {
  const unit = createVehicle();
  unit.vehicleComponents = {
    hull: { health: 35, status: 'DAMAGED' },
    engine: { health: 0, status: 'BURNING' },
    main_gun: { health: 0, status: 'DISABLED' },
    breech: { health: 0, status: 'DESTROYED' },
    hull_mg: { health: 0, status: 'DISABLED' }
  };
  unit.vehicleDamageState = {
    burning: true,
    destroyed: false,
    secondaryExplosion: true,
    fire: {
      phase: 'AMMUNITION_VENTING',
      elapsedSeconds: 1.2,
      phaseElapsedSeconds: 0.53,
      ventDurationSeconds: 1,
      postBlastDurationSeconds: 30
    },
    eventVersion: 3
  };

  const view = getVehicleVisualDamage(unit);
  assert.equal(view.burning, true);
  assert.equal(view.damaged, true);
  assert.equal(view.components.engine.health, 0);
  assert.equal(view.components.mainGun.state, 'DISABLED');
  assert.equal(view.components.gunBreech.state, 'DESTROYED');
  assert.equal(view.components.hullMachineGun.state, 'DISABLED');
  assert.equal(view.secondaryExplosion, true);

  const effects = new VehicleDamageEffects({ vfxProvider: TEST_VFX_PROVIDER });
  effects.update(1 / 30, [unit], []);
  const record = effects.records.get(unit.id);

  assert.ok(record);
  assert.equal(unit.mesh.userData.damageEffects, record.root);
  assert.equal(record.flames.userData.isSpriteCluster, true);
  assert.equal(record.flames.children[0].material.isSpriteNodeMaterial, true);
  assert.equal(record.flames.userData.layerCount, 7);
  const shortJetHeight = Math.max(
    ...record.flames.children.filter(child => child.visible).map(child => child.scale.y)
  );
  assert.ok(record.explosionTimer > 0);
  assert.equal(record.explosionKind, 'COOKOFF');
  record.explosionTimer = 0;
  record.impactTimer = 0;

  unit.vehicleDamageState.fire.phaseElapsedSeconds = 0.75;
  effects.update(1 / 30, [unit], []);
  assert.equal(record.flames.userData.layerCount, 9);
  const buildingSparkCount = record.sparks.count;
  assert.ok(buildingSparkCount > 0);
  const buildingJetHeight = Math.max(
    ...record.flames.children.filter(child => child.visible).map(child => child.scale.y)
  );

  unit.vehicleDamageState.fire.phaseElapsedSeconds = 0.995;
  effects.update(1 / 30, [unit], []);
  assert.equal(record.flames.userData.layerCount, 12);
  assert.ok(record.sparks.count > buildingSparkCount);
  const sparkMatrix = new THREE.Matrix4();
  const sparkPositions = [];
  for (let index = 0; index < record.sparks.count; index++) {
    record.sparks.getMatrixAt(index, sparkMatrix);
    sparkPositions.push(new THREE.Vector3().setFromMatrixPosition(sparkMatrix));
  }
  assert.ok(sparkPositions.every(position =>
    position.y > unit.mesh.userData.modelMetadata.dimensionsMeters.height * 0.5));
  assert.ok(sparkPositions.some(position => position.x < 0));
  assert.ok(sparkPositions.some(position => position.x > 0));
  const pressureJetHeight = Math.max(
    ...record.flames.children.filter(child => child.visible).map(child => child.scale.y)
  );
  assert.ok(buildingJetHeight > shortJetHeight);
  assert.ok(pressureJetHeight > buildingJetHeight);
  assert.ok(pressureJetHeight > shortJetHeight * 3);
  assert.equal(record.flames.visible, true);
  assert.equal(record.smoke.userData.isSpriteCluster, true);
  assert.equal(record.smoke.children[0].material.isSpriteNodeMaterial, true);
  assert.equal(record.smoke.userData.layerCount, 8);
  assert.equal(record.smoke.visible, true);
  assert.ok(record.smoke.children.some(sprite => sprite.material.opacity < 0.2));
  assert.ok(record.smoke.children.some(sprite => sprite.material.opacity > 0.4));
  record.lastSecondaryExplosion = false;
  effects.update(0, [unit], []);
  assert.ok(record.explosionTimer > 0);
  assert.equal(record.explosionKind, 'COOKOFF');
  assert.ok(unit.mesh.userData.barrel.rotation.x > 0);
  const flamePositions = record.flames.children
    .filter(child => child.visible)
    .map(child => child.position.toArray());
  assert.ok(new Set(flamePositions.map(position => position.join(','))).size > 7);

  for (let step = 0; step < 8; step++) effects.update(0.1, [unit], []);
  assert.ok(
    record.blast.scale.x > unit.mesh.userData.modelMetadata.dimensionsMeters.width * 2.5,
    'ammunition cookoff should create a vehicle-scale fireball'
  );

  effects.dispose();
  assert.equal(unit.mesh.userData.damageEffects, undefined);
});

test('post-cookoff fire rolls down while the wreck oxidizes gradually', () => {
  const unit = createVehicle();
  const originalBodyMaterial = unit.mesh.userData.testBody.material;
  unit.vehicleComponents = {
    hull: { health: 0, status: 'DESTROYED' },
    engine: { health: 0, status: 'DESTROYED' },
    fuel: { health: 0, status: 'DESTROYED' },
    ammunition: { health: 0, status: 'DESTROYED' }
  };
  unit.vehicleDamageState = {
    burning: true,
    destroyed: true,
    secondaryExplosion: true,
    fire: {
      phase: 'DETONATED',
      elapsedSeconds: 5,
      phaseElapsedSeconds: 2.4,
      ventDurationSeconds: 2,
      postBlastDurationSeconds: 30
    },
    eventVersion: 7
  };
  const effects = new VehicleDamageEffects({ vfxProvider: TEST_VFX_PROVIDER });

  effects.update(1 / 30, [unit], []);
  const record = effects.records.get(unit.id);
  assert.equal(record.flames.userData.layerCount, 7);
  assert.ok(record.flames.children.some(sprite =>
    sprite.visible && sprite.material.opacity > 0.2));
  record.explosionTimer = 0;
  record.impactTimer = 0;
  effects.update(1 / 30, [unit], []);
  assert.equal(record.sparks.count, 6);

  unit.vehicleDamageState.fire.phaseElapsedSeconds = 12;
  effects.update(1 / 30, [unit], []);
  assert.equal(record.flames.userData.layerCount, 6);
  assert.notEqual(unit.mesh.userData.testBody.material, originalBodyMaterial);
  const midBurnColor = unit.mesh.userData.testBody.material.color.getHex();
  assert.notEqual(midBurnColor, originalBodyMaterial.color.getHex());

  unit.vehicleDamageState.fire.phaseElapsedSeconds = 26.4;
  effects.update(1 / 30, [unit], []);
  assert.equal(record.flames.userData.layerCount, 1);
  const lastLayerBeforeShrink = record.flames.children[0].scale.y;

  unit.vehicleDamageState.fire.phaseElapsedSeconds = 29.6;
  effects.update(1 / 30, [unit], []);
  assert.equal(record.flames.userData.layerCount, 1);
  assert.ok(record.flames.children[0].scale.y < lastLayerBeforeShrink * 0.2);

  unit.vehicleDamageState.fire.phaseElapsedSeconds = 30;
  effects.update(1 / 30, [unit], []);
  const finalBurnColor = unit.mesh.userData.testBody.material.color.getHex();
  assert.notEqual(finalBurnColor, midBurnColor);
  assert.ok(unit.mesh.userData.testBody.material.roughness > 0.95);
  assert.ok(unit.mesh.userData.testBody.material.metalness < 0.1);

  effects.dispose();
  assert.equal(unit.mesh.userData.testBody.material, originalBodyMaterial);
});

test('vehicle damage effects retain bounded impact scars and lower far-LOD particle count', () => {
  const unit = createVehicle();
  unit.currentLOD = 'low';
  unit.vehicleDamage.engine = 'DESTROYED';
  const effects = new VehicleDamageEffects({ vfxProvider: TEST_VFX_PROVIDER });
  const impact = {
    impactId: 1,
    id: 7,
    kind: 'vehicle',
    targetId: unit.id,
    impactPosition: [0.7, 1.2, 1.5],
    penetrated: true
  };

  effects.update(1 / 30, [unit], [impact]);
  const record = effects.records.get(unit.id);
  assert.equal(record.smoke.userData.layerCount, 4);
  assert.equal(record.smoke.visible, true);
  assert.equal(record.flames.userData.layerCount, 0);
  assert.equal(record.flames.visible, false);
  assert.equal(record.scorch.count, 1);
  assert.ok(record.impactTimer > 0);

  effects.processImpacts([{
    ...impact,
    impactId: 2,
    impactPosition: [0.8, 1.2, 1.4]
  }]);
  assert.equal(record.scorch.count, 2, 'one projectile may author multiple ricochet impacts');

  for (let index = 0; index < 20; index++) {
    effects.processImpacts([{
      ...impact,
      impactId: 100 + index,
      id: 100 + index,
      impactPosition: [index * 0.01, 1, 1.5]
    }]);
  }
  assert.equal(record.scorch.count, 8);

  effects.dispose();
});

test('restore baselines persistent damage without replaying an old destruction blast', () => {
  const unit = createVehicle();
  unit.vehicleComponents = {
    hull: { health: 0, status: 'DESTROYED' },
    engine: { health: 0, status: 'BURNING' },
    main_gun: { health: 0, status: 'DESTROYED' },
    breech: { health: 0, status: 'DESTROYED' }
  };
  unit.vehicleDamageState = {
    burning: true,
    destroyed: true,
    secondaryExplosion: true,
    eventVersion: 4
  };
  const effects = new VehicleDamageEffects({ vfxProvider: TEST_VFX_PROVIDER });

  effects.update(1 / 30, [unit], []);
  const record = effects.records.get(unit.id);
  assert.ok(record.explosionTimer > 0, 'new destruction should create one transition blast');

  effects.resetTransient();
  assert.equal(record.explosionTimer, 0);
  effects.update(1 / 30, [unit], []);

  assert.equal(record.explosionTimer, 0, 'restored destruction must not replay its old blast');
  assert.equal(record.blast.visible, false);
  assert.ok(
    record.smoke.userData.layerCount > 0,
    'persistent restored damage should still rebuild smoke'
  );
  assert.ok(
    record.flames.userData.layerCount > 0,
    'persistent restored fire should still rebuild flames'
  );

  effects.dispose();
});

test('vehicle damage presentation follows authoritative detached-turret physics', () => {
  const unit = createVehicle();
  const turret = new THREE.Group();
  turret.position.set(0.15, 1.45, -0.2);
  unit.mesh.add(turret);
  unit.mesh.userData.turret = turret;
  unit.vehicleWeapon = { turretYaw: 0.25 };
  unit.vehiclePhysics = createVehiclePhysicsState({
    turret: {
      status: 'AIRBORNE',
      offset: [0.8, 1.2, 0.5],
      velocity: [1, 2, 0.5],
      rotation: [0.2, 0.3, -0.4],
      angularVelocity: [1, 1, 1],
      baseYaw: 0.15,
      ageSeconds: 0.5,
      bounceCount: 0,
      separationEventVersion: 4
    }
  });
  const restPosition = turret.position.clone();
  const restQuaternion = turret.quaternion.clone();
  const effects = new VehicleDamageEffects({ vfxProvider: TEST_VFX_PROVIDER });

  effects.update(1 / 30, [unit], []);
  assert.equal(getVehicleVisualDamage(unit).turretSeparated, true);
  assert.deepEqual(turret.position.toArray(), [
    restPosition.x + 0.8,
    restPosition.y + 1.2,
    restPosition.z + 0.5
  ]);
  assert.notDeepEqual(turret.quaternion.toArray(), restQuaternion.toArray());

  unit.vehiclePhysics.turret.status = 'ATTACHED';
  effects.update(1 / 30, [unit], []);
  assert.deepEqual(turret.position.toArray(), restPosition.toArray());
  assert.ok(Math.abs(turret.rotation.y - unit.vehicleWeapon.turretYaw) < 1e-12);

  effects.dispose();
});
