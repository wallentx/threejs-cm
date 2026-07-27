import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { traceVehicleInternalPath } from '../src/simulation/vehicles/VehicleInternalCollision.js';

function unit(spec = VEHICLES.SOMUA_S35, {
  position = [0, 0, 0],
  rotation = 0,
  turretYaw = 0
} = {}) {
  return {
    position: new THREE.Vector3(...position),
    rotation,
    vehicleWeapon: { turretYaw },
    vehicleSpec: spec
  };
}

test('SOMUA owns immutable provenance-labeled internal crew and module volumes', () => {
  const layout = VEHICLES.SOMUA_S35.internalLayout;
  assert.equal(layout.version, 'model-local-obb-path-v1');
  assert.ok(Object.isFrozen(layout));
  assert.ok(Object.isFrozen(layout.volumes));
  assert.match(layout.dataQuality, /gameplay approximations/);
  assert.ok(layout.referenceUrl);

  const ids = new Set();
  const componentIds = new Set();
  const crewRoles = new Set();
  for (const volume of layout.volumes) {
    assert.ok(Object.isFrozen(volume));
    assert.ok(!ids.has(volume.id), `${volume.id} must be unique`);
    ids.add(volume.id);
    assert.ok(volume.halfExtents.every(extent => extent > 0));
    assert.match(volume.dataQuality, /historical|inferred|approximation/);
    if (volume.componentId) componentIds.add(volume.componentId);
    for (const role of volume.crewRoles ?? []) crewRoles.add(role);
  }

  assert.deepEqual(
    [...crewRoles].sort(),
    ['COMMANDER_GUNNER', 'DRIVER', 'RADIO_OPERATOR']
  );
  assert.deepEqual(
    [...componentIds].sort(),
    ['ammunition', 'breech', 'engine', 'fuel', 'optics', 'radio', 'transmission', 'turret_traverse']
  );
  for (const other of Object.values(VEHICLES).filter(spec => spec !== VEHICLES.SOMUA_S35)) {
    assert.equal(other.internalLayout, null);
  }
});

test('SOMUA front penetration returns ordered localized crew and powerpack hits', () => {
  const hits = traceVehicleInternalPath({
    unit: unit(),
    impactPoint: [0, 1.16, 2.55],
    direction: [0, 0, -1]
  });

  assert.deepEqual(
    hits.map(hit => hit.id),
    [
      'crew-driver',
      'crew-radio-operator',
      'module-engine',
      'module-transmission'
    ]
  );
  for (let index = 1; index < hits.length; index++) {
    assert.ok(hits[index].entryDistanceMeters >= hits[index - 1].entryDistanceMeters);
  }
  assert.ok(hits.every(hit => hit.pathLengthMeters > 0));
});

test('internal path follows hull and turret yaw using plain renderer-neutral data', () => {
  const spec = {
    internalLayout: {
      version: 'test-layout-v1',
      maxPathMeters: 5,
      entryOffsetMeters: 0,
      dataQuality: 'test',
      volumes: [
        {
          id: 'hull-volume',
          kind: 'component',
          componentId: 'engine',
          center: [0, 1, 1],
          halfExtents: [0.2, 0.2, 0.4]
        },
        {
          id: 'turret-volume',
          kind: 'component',
          componentId: 'breech',
          center: [0, 2, 0],
          offset: [0, 0, 1],
          halfExtents: [0.2, 0.2, 0.4],
          followsTurret: true
        }
      ]
    }
  };
  const rotated = unit(spec, {
    position: [10, 0, -4],
    rotation: Math.PI / 2,
    turretYaw: Math.PI / 2
  });

  const hullHits = traceVehicleInternalPath({
    unit: rotated,
    impactPoint: [12, 1, -4],
    direction: [-1, 0, 0]
  });
  assert.deepEqual(hullHits.map(hit => hit.id), ['hull-volume']);

  const turretHits = traceVehicleInternalPath({
    unit: rotated,
    impactPoint: [10, 2, -6],
    direction: [0, 0, 1]
  });
  assert.deepEqual(turretHits.map(hit => hit.id), ['turret-volume']);
});
