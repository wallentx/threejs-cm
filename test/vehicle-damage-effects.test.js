import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  VehicleDamageEffects,
  getVehicleVisualDamage
} from '../src/world/VehicleDamageEffects.js';

function createVehicle() {
  const mesh = new THREE.Group();
  mesh.userData.modelMetadata = {
    dimensionsMeters: { length: 5, width: 2.4, height: 2.2 }
  };
  const barrel = new THREE.Group();
  mesh.add(barrel);
  mesh.userData.barrel = barrel;
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

  const effects = new VehicleDamageEffects();
  effects.update(1 / 30, [unit], []);
  const record = effects.records.get(unit.id);

  assert.ok(record);
  assert.equal(unit.mesh.userData.damageEffects, record.root);
  assert.equal(record.flames.count, 7);
  assert.equal(record.smoke.count, 9);
  assert.ok(record.explosionTimer > 0);
  assert.ok(unit.mesh.userData.barrel.rotation.x > 0);

  effects.dispose();
  assert.equal(unit.mesh.userData.damageEffects, undefined);
});

test('vehicle damage effects retain bounded impact scars and lower far-LOD particle count', () => {
  const unit = createVehicle();
  unit.currentLOD = 'low';
  unit.vehicleDamage.engine = 'DESTROYED';
  const effects = new VehicleDamageEffects();
  const impact = {
    id: 7,
    kind: 'vehicle',
    targetId: unit.id,
    impactPosition: [0.7, 1.2, 1.5],
    penetrated: true
  };

  effects.update(1 / 30, [unit], [impact]);
  const record = effects.records.get(unit.id);
  assert.equal(record.smoke.count, 4);
  assert.equal(record.flames.count, 0);
  assert.equal(record.scorch.count, 1);
  assert.ok(record.impactTimer > 0);

  for (let index = 0; index < 20; index++) {
    effects.processImpacts([{
      ...impact,
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
  const effects = new VehicleDamageEffects();

  effects.update(1 / 30, [unit], []);
  const record = effects.records.get(unit.id);
  assert.ok(record.explosionTimer > 0, 'new destruction should create one transition blast');

  effects.resetTransient();
  assert.equal(record.explosionTimer, 0);
  effects.update(1 / 30, [unit], []);

  assert.equal(record.explosionTimer, 0, 'restored destruction must not replay its old blast');
  assert.equal(record.blast.visible, false);
  assert.ok(record.smoke.count > 0, 'persistent restored damage should still rebuild smoke');
  assert.ok(record.flames.count > 0, 'persistent restored fire should still rebuild flames');

  effects.dispose();
});
