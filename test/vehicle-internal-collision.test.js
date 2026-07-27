import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import {
  queryVehicleInternalBlastCandidates,
  traceVehicleInternalPath
} from '../src/simulation/vehicles/VehicleInternalCollision.js';

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

test('authored internal layouts are immutable, provenance-labeled, and vehicle-owned', () => {
  const authored = [
    VEHICLES.SOMUA_S35,
    VEHICLES.RENAULT_R35,
    VEHICLES.RENAULT_D2,
    VEHICLES.HOTCHKISS_H39,
    VEHICLES.AMC_35,
    VEHICLES.PANHARD_178,
    VEHICLES.LAFFLY_S20TL,
    VEHICLES.OPEL_BLITZ,
    VEHICLES.PANZER_II_C,
    VEHICLES.PANZER_35T,
    VEHICLES.PANZER_38T,
    VEHICLES.SDKFZ_231,
    VEHICLES.PANZER_III_D,
    VEHICLES.CHAR_B1_BIS,
    VEHICLES.PANZER_IV_D
  ];
  for (const spec of authored) {
    const layout = spec.internalLayout;
    assert.equal(layout.version, 'model-local-obb-path-v1');
    assert.ok(Object.isFrozen(layout));
    assert.ok(Object.isFrozen(layout.volumes));
    assert.match(layout.dataQuality, /gameplay approximations/);
    assert.ok(layout.referenceUrl);
    const ids = new Set();
    for (const volume of layout.volumes) {
      assert.ok(Object.isFrozen(volume));
      assert.ok(!ids.has(volume.id), `${spec.id}:${volume.id} must be unique`);
      ids.add(volume.id);
      assert.ok(volume.halfExtents.every(extent => extent > 0));
      assert.match(volume.dataQuality, /historical|inferred|approximation|model-backed/);
    }
    assert.deepEqual(
      [...new Set(layout.volumes.flatMap(volume => volume.crewRoles ?? []))].sort(),
      spec.crew.map(crewman => crewman.role).sort()
    );
  }

  const panzerComponents = new Set(
    VEHICLES.PANZER_III_D.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(panzerComponents.has('hull_mg'));
  assert.ok(panzerComponents.has('radio'));
  for (const frenchLight of [VEHICLES.RENAULT_R35, VEHICLES.HOTCHKISS_H39]) {
    const components = new Set(
      frenchLight.internalLayout.volumes.map(volume => volume.componentId).filter(Boolean)
    );
    assert.equal(components.has('radio'), false);
    assert.equal(components.has('hull_mg'), false);
    assert.ok(components.has('coax'));
  }
  const amcComponents = new Set(
    VEHICLES.AMC_35.internalLayout.volumes.map(volume => volume.componentId).filter(Boolean)
  );
  assert.equal(amcComponents.has('radio'), false);
  assert.equal(amcComponents.has('hull_mg'), false);
  assert.ok(amcComponents.has('coax'));

  const d2Components = new Set(
    VEHICLES.RENAULT_D2.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(d2Components.has('radio'));
  assert.ok(d2Components.has('coax'));
  assert.equal(d2Components.has('hull_mg'), false);

  const panhardComponents = new Set(
    VEHICLES.PANHARD_178.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(panhardComponents.has('radio'));
  assert.ok(panhardComponents.has('coax'));
  assert.equal(panhardComponents.has('hull_mg'), false);

  for (const transport of [VEHICLES.LAFFLY_S20TL, VEHICLES.OPEL_BLITZ]) {
    const components = new Set(
      transport.internalLayout.volumes.map(volume => volume.componentId).filter(Boolean)
    );
    assert.deepEqual(
      [...components].sort(),
      ['engine', 'fuel', 'transmission']
    );
  }
  const panzerIIComponents = new Set(
    VEHICLES.PANZER_II_C.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(panzerIIComponents.has('radio'));
  assert.ok(panzerIIComponents.has('coax'));
  assert.equal(panzerIIComponents.has('hull_mg'), false);

  const panzer35tComponents = new Set(
    VEHICLES.PANZER_35T.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(panzer35tComponents.has('radio'));
  assert.ok(panzer35tComponents.has('coax'));
  assert.ok(panzer35tComponents.has('hull_mg'));

  const panzer38tComponents = new Set(
    VEHICLES.PANZER_38T.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(panzer38tComponents.has('radio'));
  assert.ok(panzer38tComponents.has('coax'));
  assert.ok(panzer38tComponents.has('hull_mg'));

  const sdkfzComponents = new Set(
    VEHICLES.SDKFZ_231.internalLayout.volumes
      .map(volume => volume.componentId)
      .filter(Boolean)
  );
  assert.ok(sdkfzComponents.has('radio'));
  assert.ok(sdkfzComponents.has('coax'));
  assert.equal(sdkfzComponents.has('hull_mg'), false);

  for (const fullTank of [VEHICLES.CHAR_B1_BIS, VEHICLES.PANZER_IV_D]) {
    const components = new Set(
      fullTank.internalLayout.volumes
        .map(volume => volume.componentId)
        .filter(Boolean)
    );
    for (const componentId of [
      'ammunition',
      'breech',
      'coax',
      'engine',
      'fuel',
      'hull_mg',
      'optics',
      'radio',
      'transmission',
      'turret_traverse'
    ]) {
      assert.ok(components.has(componentId), `${fullTank.id}:${componentId}`);
    }
  }

  assert.equal(authored.length, Object.keys(VEHICLES).length);
  for (const other of Object.values(VEHICLES).filter(spec => !authored.includes(spec))) {
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

test('Panzer III paths distinguish front transmission, rear engine, side racks, and turret', () => {
  const panzer = unit(VEHICLES.PANZER_III_D);
  const lowFront = traceVehicleInternalPath({
    unit: panzer,
    impactPoint: [0, 0.9, 2.65],
    direction: [0, 0, -1]
  });
  assert.deepEqual(
    lowFront.map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );

  const side = traceVehicleInternalPath({
    unit: panzer,
    impactPoint: [1.4, 1.25, 0.08],
    direction: [-1, 0, 0]
  });
  assert.deepEqual(
    side.map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );

  const turret = traceVehicleInternalPath({
    unit: panzer,
    impactPoint: [0, 1.95, 1.0],
    direction: [0, 0, -1]
  });
  assert.deepEqual(
    turret.map(hit => hit.id),
    ['module-breech', 'crew-commander']
  );
});

test('R35 paths follow left driver visor, front drive, side racks, rear engine, and turret', () => {
  const renault = unit(VEHICLES.RENAULT_R35);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: renault,
      impactPoint: [0, 0.72, 1.84],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: renault,
      impactPoint: [0.25, 1.12, 1.75],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: renault,
      impactPoint: [0.9, 1.08, 0.02],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: renault,
      impactPoint: [0, 1.72, 0.8],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander-gunner']
  );
});

test('H39 paths follow right driver hood, front drive, side racks, rear engine, and turret', () => {
  const hotchkiss = unit(VEHICLES.HOTCHKISS_H39);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: hotchkiss,
      impactPoint: [0, 0.69, 2.1],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: hotchkiss,
      impactPoint: [-0.28, 1.12, 2.05],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: hotchkiss,
      impactPoint: [0.92, 1.10, 0.05],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: hotchkiss,
      impactPoint: [0, 1.74, 1.05],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander-gunner']
  );
});

test('AMC 35 paths follow right driver bay, front drive, side racks, rear engine, and APX 2 crew', () => {
  const amc = unit(VEHICLES.AMC_35);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: amc,
      impactPoint: [0, 0.75, 2.5],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: amc,
      impactPoint: [-0.42, 1.25, 2.5],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: amc,
      impactPoint: [1.2, 1.18, 0.02],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: amc,
      impactPoint: [0, 1.98, 1.1],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-gunner-loader', 'crew-commander']
  );
});

test('Panhard 178 paths follow both left-side drivers, drivetrain, side racks, and APX 3 crew', () => {
  const panhard = unit(VEHICLES.PANHARD_178);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panhard,
      impactPoint: [0, 0.76, 2.7],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panhard,
      impactPoint: [0.29, 1.22, 2.7],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-forward-driver', 'module-engine', 'crew-rear-driver-radio']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panhard,
      impactPoint: [0.30, 1.16, -2.6],
      direction: [0, 0, 1]
    }).map(hit => hit.id),
    ['crew-rear-driver-radio', 'module-engine', 'crew-forward-driver']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panhard,
      impactPoint: [1.05, 1.17, 0.22],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panhard,
      impactPoint: [0, 2.02, 1.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-gunner', 'crew-commander']
  );
});

test('Laffly S20TL paths follow authored cab seats, bonnet powertrain, and chassis fuel tank', () => {
  const laffly = unit(VEHICLES.LAFFLY_S20TL);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: laffly,
      impactPoint: [0, 1.05, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'module-transmission']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: laffly,
      impactPoint: [0.42, 1.37, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'crew-driver']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: laffly,
      impactPoint: [-0.42, 1.37, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'crew-vehicle-commander']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: laffly,
      impactPoint: [1.1, 0.72, -0.34],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-fuel']
  );
});

test('Opel Blitz paths follow inferred cab seats and registered bonnet and chassis stations', () => {
  const opel = unit(VEHICLES.OPEL_BLITZ);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: opel,
      impactPoint: [0, 0.98, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'module-transmission']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: opel,
      impactPoint: [0.42, 1.38, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'crew-driver']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: opel,
      impactPoint: [-0.42, 1.38, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'crew-vehicle-commander']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: opel,
      impactPoint: [1.2, 0.72, -0.18],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-fuel']
  );
});

test('Panzer II C paths follow front drive, left driver, side racks, rear engine, and offset turret', () => {
  const panzerII = unit(VEHICLES.PANZER_II_C);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerII,
      impactPoint: [0, 0.75, 2.7],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerII,
      impactPoint: [0.38, 1.16, 2.7],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerII,
      impactPoint: [1.2, 1.12, 0.02],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerII,
      impactPoint: [0.17, 1.73, 1.3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander-gunner', 'crew-loader-radio']
  );
});

test('Panzer 35(t) paths follow rear drive, separate bow crew, side racks, and two-man turret', () => {
  const panzer35t = unit(VEHICLES.PANZER_35T);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer35t,
      impactPoint: [0, 0.78, -2.7],
      direction: [0, 0, 1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer35t,
      impactPoint: [-0.34, 1.20, 2.7],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer35t,
      impactPoint: [0.38, 1.20, 2.7],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-radio-operator', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer35t,
      impactPoint: [1, 1.16, 0.12],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer35t,
      impactPoint: [0, 1.90, 1.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander-gunner', 'crew-loader']
  );
});

test('Panzer 38(t) paths follow front drive, separate bow crew, side racks, rear engine, and turret crew', () => {
  const panzer38t = unit(VEHICLES.PANZER_38T);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer38t,
      impactPoint: [0, 0.75, 2.6],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer38t,
      impactPoint: [0.39, 1.23, 2.6],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer38t,
      impactPoint: [-0.40, 1.24, 2.6],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-radio-operator', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer38t,
      impactPoint: [1.1, 1.16, 0.13],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer38t,
      impactPoint: [0.07, 1.88, 1.3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander-gunner']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzer38t,
      impactPoint: [-0.10, 1.88, 1.3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-loader']
  );
});

test('Sd.Kfz. 231 paths follow front powerpack, dual drivers, side racks, and rear turret crew', () => {
  const sdkfz = unit(VEHICLES.SDKFZ_231);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: sdkfz,
      impactPoint: [0, 0.80, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'module-transmission']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: sdkfz,
      impactPoint: [0.31, 1.28, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'crew-forward-driver', 'crew-rear-driver-radio']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: sdkfz,
      impactPoint: [0, 1.18, -3],
      direction: [0, 0, 1]
    }).map(hit => hit.id),
    ['crew-rear-driver-radio', 'crew-forward-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: sdkfz,
      impactPoint: [1, 1.27, -0.70],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: sdkfz,
      impactPoint: [0, 2.03, 0.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-gunner', 'crew-commander']
  );
});

test('Char B1 bis paths follow rear drive, asymmetric hull stations, side racks, and one-man turret', () => {
  const charB1 = unit(VEHICLES.CHAR_B1_BIS);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: charB1,
      impactPoint: [0, 0.83, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-engine', 'module-transmission']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: charB1,
      impactPoint: [0.43, 1.48, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver-hull-gunner', 'crew-radio-operator', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: charB1,
      impactPoint: [-0.31, 1.30, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-hull-loader', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: charB1,
      impactPoint: [-0.76, 1.36, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-hull-mg', 'module-ammunition-right', 'module-fuel-right', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: charB1,
      impactPoint: [1.2, 1.09, 0.30],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: charB1,
      impactPoint: [0, 2.22, 3.2],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander-gunner']
  );
});

test('Panzer IV Ausf. D paths follow front drive, separate bow crew, side racks, rear engine, and three-man turret', () => {
  const panzerIV = unit(VEHICLES.PANZER_IV_D);
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerIV,
      impactPoint: [0, 0.84, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerIV,
      impactPoint: [0.48, 1.34, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-driver', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerIV,
      impactPoint: [-0.48, 1.34, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['crew-radio-operator', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerIV,
      impactPoint: [-0.50, 1.52, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-hull-mg', 'crew-radio-operator', 'module-engine']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerIV,
      impactPoint: [1.4, 1.22, 0.15],
      direction: [-1, 0, 0]
    }).map(hit => hit.id),
    ['module-ammunition-left', 'module-ammunition-right']
  );
  assert.deepEqual(
    traceVehicleInternalPath({
      unit: panzerIV,
      impactPoint: [0.06, 2.0, 3],
      direction: [0, 0, -1]
    }).map(hit => hit.id),
    ['module-breech', 'crew-commander']
  );
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

test('internal blast query follows rotated hull and turret OBBs, includes the radius boundary, and orders nearest first', () => {
  const spec = {
    internalLayout: {
      version: 'blast-query-test-v1',
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

  assert.deepEqual(
    queryVehicleInternalBlastCandidates({
      unit: rotated,
      impactPoint: [10, 2, -5],
      radiusMeters: 0.001
    }).map(candidate => candidate.id),
    ['turret-volume'],
    'turret-local volume must follow hull plus turret yaw'
  );
  assert.deepEqual(
    queryVehicleInternalBlastCandidates({
      unit: rotated,
      impactPoint: [11, 1, -4],
      radiusMeters: 0.001
    }).map(candidate => candidate.id),
    ['hull-volume'],
    'hull-local volume must follow hull yaw only'
  );

  const candidates = queryVehicleInternalBlastCandidates({
    unit: rotated,
    impactPoint: [10, 2, -5],
    radiusMeters: 1.3
  });
  assert.deepEqual(candidates.map(candidate => candidate.id), [
    'turret-volume',
    'hull-volume'
  ]);
  assert.equal(candidates[0].followsTurret, true);
  assert.equal(candidates[1].followsTurret, false);
  assert.ok(candidates[0].distanceMeters <= candidates[1].distanceMeters);
  assert.ok(candidates[1].distanceMeters <= 1.3);
});
