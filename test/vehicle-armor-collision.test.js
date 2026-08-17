import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BallisticsSystem } from '../src/game/BallisticsSystem.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { WEAPONS } from '../src/game/WeaponCatalog.js';
import { compileVehicleArmorMesh } from '../src/calibration/VehicleArmorMeshCompiler.js';
import {
  GENERATED_VEHICLE_ARMOR_COLLISIONS
} from '../src/content/france1940/vehicleData/GeneratedVehicleArmorCollision.js';
import {
  FRANCE_1940_VEHICLE_ARMOR_SOURCES
} from '../src/content/france1940/render/VehicleArmorSourceManifest.js';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/vehicleMeshFactories.js';
import {
  intersectVehicleArmor,
  traceVehicleArmorExit
} from '../src/simulation/vehicles/VehicleArmorCollision.js';

function vehicleUnit(spec = VEHICLES.PANZER_III_D, {
  position = [0, 0, 0],
  rotation = 0,
  turretYaw = 0
} = {}) {
  return {
    id: `armor_${spec.id}`,
    position: new THREE.Vector3(...position),
    rotation,
    vehicleWeapon: { turretYaw },
    vehicleSpec: spec
  };
}

function segment(start, end, unit) {
  return intersectVehicleArmor(
    new THREE.Vector3(...start),
    new THREE.Vector3(...end),
    unit
  );
}

test('every catalog vehicle owns immutable named model-local armor collision volumes', () => {
  for (const spec of Object.values(VEHICLES)) {
    const collision = spec.armorCollision;
    assert.equal(collision.version, 'named-mesh-triangle-plates-v3');
    assert.ok(Object.isFrozen(collision));
    assert.ok(Object.isFrozen(collision.volumes));
    assert.ok(collision.volumes.length >= 2);
    assert.equal(
      new Set(collision.volumes.map(volume => volume.id)).size,
      collision.volumes.length,
      `${spec.id} volume IDs must be stable and unique`
    );
    for (const volume of collision.volumes) {
      assert.ok(Object.isFrozen(volume));
      assert.ok(['hull', 'turret', 'mantlet', 'cupola', 'track'].includes(volume.part));
      assert.ok(
        ['opposite_face', 'none'].includes(volume.exitArmorPolicy),
        `${spec.id}:${volume.id} must declare a supported exit-armor policy`
      );
      if (volume.shape === 'triangle-mesh') {
        assert.ok(Object.isFrozen(volume.vertices));
        assert.ok(Object.isFrozen(volume.plates));
        assert.ok(volume.vertices.length >= 8);
        assert.ok(volume.plates.length > 0);
        for (const plate of volume.plates) {
          assert.ok(Object.isFrozen(plate));
          assert.ok(Object.isFrozen(plate.triangles));
          assert.ok(plate.triangles.length > 0);
        }
      } else {
        assert.ok(volume.halfExtents.every(extent => extent > 0));
        assert.deepEqual(
          Object.keys(volume.faceZones).sort(),
          ['negativeX', 'negativeY', 'negativeZ', 'positiveX', 'positiveY', 'positiveZ']
        );
      }
    }
    assert.ok(
      collision.volumes.every(volume => volume.sourceMeshName),
      `${spec.id} volumes must identify their authored source meshes`
    );
  }
});

test('checked-in armor triangles exactly reproduce every declared authored core mesh', () => {
  for (const [modelId, manifest] of Object.entries(
    FRANCE_1940_VEHICLE_ARMOR_SOURCES
  )) {
    const compiled = compileVehicleArmorMesh(
      FRANCE_1940_VEHICLE_MESH_FACTORIES[modelId](),
      manifest
    );
    assert.deepEqual(
      GENERATED_VEHICLE_ARMOR_COLLISIONS[modelId],
      compiled,
      `${modelId} armor snapshot is stale; run npm run author:vehicle-armor`
    );
  }
});

test('armor sweeps follow authoritative hull pitch and remove a separated turret volume', () => {
  const spec = {
    id: 'PHYSICS_COLLIDER',
    armorCollision: {
      quality: 'test',
      volumes: [{
        id: 'tilting-turret',
        part: 'turret',
        followsTurret: true,
        center: [0, 1, 0],
        offset: [0, 0, 0],
        halfExtents: [1, 1, 2],
        faceZones: {
          positiveX: 'turret_side',
          negativeX: 'turret_side',
          positiveY: 'turret_roof',
          negativeY: 'turret_bottom',
          positiveZ: 'turret_front',
          negativeZ: 'turret_rear'
        },
        fallbackZones: {},
        geometryQuality: 'test'
      }]
    }
  };
  const unit = vehicleUnit(spec);
  unit.vehiclePhysics = {
    hull: {
      initialized: true,
      pitch: -Math.PI / 6,
      roll: 0
    },
    turret: { status: 'ATTACHED' }
  };

  const hit = segment([0, 5, -1], [0, -2, -1], unit);
  assert.equal(hit.zone, 'turret_roof');
  assert.ok(hit.normal[1] > 0.8);
  assert.ok(hit.normal[2] < -0.45, 'roof normal must pitch with the rendered hull');

  unit.vehiclePhysics.turret.status = 'AIRBORNE';
  assert.equal(segment([0, 5, -1], [0, -2, -1], unit), null);
});

test('SOMUA armor uses its current GLB-derived hull, turret, and track meshes', () => {
  const unit = vehicleUnit(VEHICLES.SOMUA_S35);
  assert.equal(unit.vehicleSpec.armorCollision.version, 'named-mesh-triangle-plates-v3');
  assert.deepEqual(
    unit.vehicleSpec.armorCollision.volumes.map(volume => volume.sourceMeshName),
    [
      'S35_ProxyExteriorHull',
      'S35_ProxySlopingEngineDeck',
      'S35_ProxyAPXTurret',
      'S35_ProxyClosedObservationCupola',
      'S35_ProxyClosedCupolaRoof',
      'S35_ProxySA35Mantlet',
      'S35_ProxyTracks',
      'S35_ProxyTracks'
    ]
  );

  const front = segment([0, 0.85, 10], [0, 0.85, -10], unit);
  assert.equal(front.zone, 'hull_front');
  assert.equal(front.sourceMeshName, 'S35_ProxyExteriorHull');
  assert.match(front.plateId, /:positiveZ$/);

  const shoulder = segment([5, 1.45, -1.2], [-5, 1.45, -1.2], unit);
  assert.equal(shoulder.zone, 'hull_side');
  assert.equal(shoulder.sourceMeshName, 'S35_ProxyExteriorHull');
  assert.ok(shoulder.normal[0] > 0.5);
  assert.ok(shoulder.normal[1] > 0.1, 'GLB shoulder must retain its real slope');

  const track = segment([5, 0.05, -1.95], [-5, 0.05, -1.95], unit);
  assert.equal(track.zone, 'track_left');
  assert.equal(track.armorPart, 'track');
  assert.equal(track.sourceMeshName, 'S35_ProxyTracks');
  assert.equal(track.nominalArmorMm, 20);
  assert.match(track.thicknessDataQuality, /gameplay approximation/);

  const mantlet = segment([-0.325, 1.825, 5], [-0.325, 1.825, -5], unit);
  assert.equal(mantlet.zone, 'mantlet');
  assert.equal(mantlet.sourceMeshName, 'S35_ProxySA35Mantlet');
  assert.equal(mantlet.fallbackZone, 'turret_front');

  const cupola = segment([0.02, 10, 0.55], [0.02, -1, 0.55], unit);
  assert.equal(cupola.zone, 'cupola');
  assert.equal(cupola.fallbackZone, 'turret_side');

  const oldBoxFalsePositive = segment([1.04, 1.60, 10], [1.04, 1.60, -10], unit);
  assert.equal(oldBoxFalsePositive, null);
});

test('SOMUA auxiliary envelopes charge track and mantlet resistance only on entry', () => {
  const unit = vehicleUnit(VEHICLES.SOMUA_S35);
  unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
  const weapon = {
    ...WEAPONS.KWK36_AP,
    penetrationMmAt100m: 120
  };
  const ballistics = new BallisticsSystem({ random: () => 0.5 });

  for (const fixture of [
    {
      label: 'track',
      start: [5, 0.05, -1.95],
      end: [-5, 0.05, -1.95],
      expectedZone: 'track_left'
    },
    {
      label: 'mantlet',
      start: [-0.325, 1.825, 5],
      end: [-0.325, 1.825, -5],
      expectedZone: 'mantlet'
    }
  ]) {
    const hit = segment(fixture.start, fixture.end, unit);
    const direction = new THREE.Vector3(...fixture.end)
      .sub(new THREE.Vector3(...fixture.start))
      .normalize();
    const exit = traceVehicleArmorExit({
      unit,
      armorVolumeId: hit.armorVolumeId,
      entryPoint: hit.point,
      direction
    });
    assert.equal(hit.zone, fixture.expectedZone, fixture.label);
    assert.equal(exit.exitArmorPolicy, 'none', fixture.label);
    assert.equal(exit.nominalArmorMm, 0, fixture.label);
    assert.match(exit.thicknessDataQuality, /far boundary adds no armor resistance/);

    const result = ballistics.resolveVehicleImpact({
      weapon,
      velocity: direction.clone().multiplyScalar(weapon.muzzleVelocity)
    }, {
      kind: 'vehicle',
      unit,
      point: new THREE.Vector3(...hit.point),
      normal: new THREE.Vector3(...hit.normal),
      zone: hit.zone,
      fallbackZone: hit.fallbackZone,
      plateId: hit.plateId,
      armorVolumeId: hit.armorVolumeId,
      armorPart: hit.armorPart,
      armorGeometryQuality: hit.geometryQuality,
      nominalArmorMm: hit.nominalArmorMm,
      thicknessSourceZone: hit.thicknessSourceZone,
      thicknessDataQuality: hit.thicknessDataQuality,
      thicknessReferenceUrl: hit.thicknessReferenceUrl,
      localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
    });

    assert.equal(result.penetrated, true, fixture.label);
    assert.equal(result.exitResult.exitArmorPolicy, 'none', fixture.label);
    assert.equal(result.exitResult.nominalArmorMm, 0, fixture.label);
    assert.equal(result.exitArmorEnergySpentJ, 0, fixture.label);
    assert.equal(
      result.residualEnergyJ,
      result.preExitResidualEnergyJ,
      fixture.label
    );
  }
});

test('swept armor collision reports named front, side, rear, and top plates', () => {
  const unit = vehicleUnit();
  const front = segment([0, 1, 10], [0, 1, -10], unit);
  const rear = segment([0, 1, -10], [0, 1, 10], unit);
  const side = segment([10, 1, 0], [-10, 1, 0], unit);
  const top = segment([0.3, 10, 0.21], [0.3, -1, 0.21], unit);

  assert.equal(front.zone, 'hull_front');
  assert.match(front.plateId, /:positiveZ$/);
  assert.ok(front.normal[2] > 0.5);
  assert.equal(rear.zone, 'hull_rear');
  assert.equal(side.zone, 'hull_side');
  assert.equal(top.zone, 'turret_top');
  assert.equal(top.fallbackZone, 'turret_side');
});

test('armor volumes reject empty space that the old spherical target accepted', () => {
  const unit = vehicleUnit();
  const miss = segment([1.20, 2.30, 10], [1.20, 2.30, -10], unit);
  assert.equal(miss, null);

  const turretHit = segment([0, 2.10, 10], [0, 2.10, -10], unit);
  assert.equal(turretHit.zone, 'turret_front');
  assert.equal(turretHit.sourceMeshName, 'PanzerIIID_ThreeManTurret');
});

test('vehicle and turret yaw rotate named plate ownership with the model', () => {
  const hullTurned = vehicleUnit(VEHICLES.PANZER_III_D, { rotation: Math.PI / 2 });
  const hullFront = segment([10, 1, 0], [-10, 1, 0], hullTurned);
  assert.equal(hullFront.zone, 'hull_front');

  const turretTurned = vehicleUnit(VEHICLES.PANZER_III_D, { turretYaw: Math.PI / 2 });
  const turretFront = segment([10, 2.20, 0.21], [-10, 2.20, 0.21], turretTurned);
  assert.equal(turretFront.zone, 'turret_front');
  assert.match(turretFront.plateId, /:positiveZ$/);
});

test('resolved armor uses the swept plate normal and explicit thickness fallback', () => {
  const unit = vehicleUnit();
  unit.applyArmorHit = result => ({
    penetrated: result.penetrated,
    zone: result.zone,
    damageZone: result.damageZone
  });
  const hit = segment([0.3, 10, 0.21], [0.3, -1, 0.21], unit);
  assert.equal(hit.thicknessSourceZone, 'turret_side');
  const ballistics = new BallisticsSystem({ random: () => 0.5 });
  const result = ballistics.resolveVehicleImpact({
    weapon: WEAPONS.SA35_AP,
    velocity: new THREE.Vector3(0, -WEAPONS.SA35_AP.muzzleVelocity, 0)
  }, {
    kind: 'vehicle',
    unit,
    point: new THREE.Vector3(...hit.point),
    normal: new THREE.Vector3(...hit.normal),
    zone: hit.zone,
    fallbackZone: hit.fallbackZone,
    plateId: hit.plateId,
    armorVolumeId: hit.armorVolumeId,
    armorPart: hit.armorPart,
    armorGeometryQuality: hit.geometryQuality,
    thicknessSourceZone: hit.thicknessSourceZone,
    thicknessDataQuality: hit.thicknessDataQuality,
    localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
  });

  assert.equal(result.zone, 'turret_top');
  assert.equal(result.thicknessZone, 'turret_side');
  assert.equal(result.nominalArmorMm, VEHICLES.PANZER_III_D.armorMm.turret_side);
  assert.equal(result.impactCosine, 1);
  assert.deepEqual(result.impactNormal, [0, 1, 0]);
  assert.equal(result.crewResult.damageZone, 'turret_side');
  assert.match(result.armorGeometryQuality, /authored core vehicle mesh/);
});

test('resolved SOMUA track hits use authored track thickness and localized component routing', () => {
  const unit = vehicleUnit(VEHICLES.SOMUA_S35);
  unit.applyArmorHit = result => ({
    zone: result.zone,
    damageZone: result.damageZone,
    componentZone: result.componentZone
  });
  const hit = segment([5, 0.05, -1.95], [-5, 0.05, -1.95], unit);
  const weapon = {
    ...WEAPONS.KWK36_AP,
    penetrationMmAt100m: 120
  };
  const ballistics = new BallisticsSystem({ random: () => 0.5 });
  const result = ballistics.resolveVehicleImpact({
    weapon,
    velocity: new THREE.Vector3(-weapon.muzzleVelocity, 0, 0)
  }, {
    kind: 'vehicle',
    unit,
    point: new THREE.Vector3(...hit.point),
    normal: new THREE.Vector3(...hit.normal),
    zone: hit.zone,
    fallbackZone: hit.fallbackZone,
    plateId: hit.plateId,
    armorVolumeId: hit.armorVolumeId,
    armorPart: hit.armorPart,
    armorGeometryQuality: hit.geometryQuality,
    nominalArmorMm: hit.nominalArmorMm,
    thicknessSourceZone: hit.thicknessSourceZone,
    thicknessDataQuality: hit.thicknessDataQuality,
    thicknessReferenceUrl: hit.thicknessReferenceUrl,
    localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
  });

  assert.equal(result.zone, 'track_left');
  assert.equal(result.thicknessZone, 'track_left');
  assert.equal(result.nominalArmorMm, 20);
  assert.match(result.thicknessDataQuality, /gameplay approximation/);
  assert.equal(result.exitResult.exitArmorPolicy, 'none');
  assert.equal(result.exitResult.nominalArmorMm, 0);
  assert.equal(result.exitArmorEnergySpentJ, 0);
  assert.equal(result.crewResult.damageZone, 'hull_side');
  assert.equal(result.crewResult.componentZone, 'track_left');
});

test('resolved SOMUA penetration traces ordered internal model-local volumes', () => {
  const unit = vehicleUnit(VEHICLES.SOMUA_S35);
  unit.applyArmorHit = result => ({
    internalPathHits: result.internalPathHits,
    spallHits: result.spallHits
  });
  const hit = segment([0, 1.16, 10], [0, 1.16, -10], unit);
  const weapon = {
    ...WEAPONS.KWK36_AP,
    penetrationMmAt100m: 120
  };
  const ballistics = new BallisticsSystem({ random: () => 0 });
  const result = ballistics.resolveVehicleImpact({
    weapon,
    velocity: new THREE.Vector3(0, 0, -weapon.muzzleVelocity)
  }, {
    kind: 'vehicle',
    unit,
    point: new THREE.Vector3(...hit.point),
    normal: new THREE.Vector3(...hit.normal),
    zone: hit.zone,
    fallbackZone: hit.fallbackZone,
    plateId: hit.plateId,
    armorVolumeId: hit.armorVolumeId,
    armorPart: hit.armorPart,
    armorGeometryQuality: hit.geometryQuality,
    nominalArmorMm: hit.nominalArmorMm,
    thicknessSourceZone: hit.thicknessSourceZone,
    thicknessDataQuality: hit.thicknessDataQuality,
    thicknessReferenceUrl: hit.thicknessReferenceUrl,
    localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
  });

  assert.equal(result.penetrated, true);
  assert.deepEqual(
    result.internalPathHits.map(pathHit => pathHit.id),
    [
      'crew-driver',
      'crew-radio-operator',
      'module-engine',
      'module-transmission'
    ]
  );
  assert.deepEqual(result.crewResult.internalPathHits, result.internalPathHits);
  assert.equal(result.spallEffect.modelVersion, 'behind-armor-spall-v1');
  assert.equal(result.spallEffect.rayCount, 24);
  assert.ok(result.spallEffect.hitRayCount <= 24);
  assert.deepEqual(result.crewResult.spallHits, result.spallHits);
  assert.ok(result.spallHits.length > 0);
  assert.ok(result.spallHits.every(hit => hit.terminalEffectKind === 'behind_armor_spall'));
  assert.match(result.internalPathHits[0].layoutDataQuality, /gameplay approximations/);
});

test('resolved Panzer III front penetration routes through transmission and rear engine', () => {
  const unit = vehicleUnit(VEHICLES.PANZER_III_D);
  unit.applyArmorHit = result => ({
    internalPathHits: result.internalPathHits
  });
  const hit = segment([0, 0.9, 10], [0, 0.9, -10], unit);
  const ballistics = new BallisticsSystem({ random: () => 0 });
  const result = ballistics.resolveVehicleImpact({
    weapon: WEAPONS.SA35_AP,
    velocity: new THREE.Vector3(0, 0, -WEAPONS.SA35_AP.muzzleVelocity)
  }, {
    kind: 'vehicle',
    unit,
    point: new THREE.Vector3(...hit.point),
    normal: new THREE.Vector3(...hit.normal),
    zone: hit.zone,
    fallbackZone: hit.fallbackZone,
    plateId: hit.plateId,
    armorVolumeId: hit.armorVolumeId,
    armorPart: hit.armorPart,
    armorGeometryQuality: hit.geometryQuality,
    localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
  });

  assert.equal(result.penetrated, true);
  assert.deepEqual(
    result.internalPathHits.map(pathHit => pathHit.id),
    ['module-transmission', 'module-engine']
  );
  assert.deepEqual(result.crewResult.internalPathHits, result.internalPathHits);
});

test('turret penetration bounds internal damage at the turret exit armor', () => {
  const unit = vehicleUnit(VEHICLES.PANZER_III_D);
  unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
  const hit = segment([0, 2, 10], [0, 2, -10], unit);
  const weapon = {
    ...WEAPONS.SA35_AP,
    penetrationMmAt100m: 120
  };
  const result = new BallisticsSystem({ random: () => 0 }).resolveVehicleImpact({
    weapon,
    velocity: new THREE.Vector3(0, 0, -weapon.muzzleVelocity)
  }, {
    kind: 'vehicle',
    unit,
    point: new THREE.Vector3(...hit.point),
    normal: new THREE.Vector3(...hit.normal),
    zone: hit.zone,
    fallbackZone: hit.fallbackZone,
    plateId: hit.plateId,
    armorVolumeId: hit.armorVolumeId,
    armorPart: hit.armorPart,
    armorGeometryQuality: hit.geometryQuality,
    localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
  });

  assert.equal(result.penetrated, true);
  assert.equal(result.zone, 'turret_front');
  assert.equal(result.exitResult.zone, 'turret_rear');
  assert.deepEqual(
    result.internalPathHits.map(pathHit => pathHit.id),
    ['module-breech', 'crew-commander']
  );
  assert.ok(
    result.internalPathHits.every(pathHit =>
      pathHit.exitDistanceMeters <= result.exitResult.distanceMeters + 1e-9)
  );
  assert.ok(!result.internalPathHits.some(pathHit =>
    ['module-engine', 'module-transmission'].includes(pathHit.id)));
});

test('resolved French light armor penetrations enter their vehicle-owned internal layouts', () => {
  const weapon = {
    ...WEAPONS.KWK36_AP,
    penetrationMmAt100m: 120
  };
  for (const [spec, height] of [
    [VEHICLES.RENAULT_R35, 0.72],
    [VEHICLES.HOTCHKISS_H39, 0.69],
    [VEHICLES.AMC_35, 0.75],
    [VEHICLES.PANHARD_178, 0.76]
  ]) {
    const unit = vehicleUnit(spec);
    unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
    const hit = segment([0, height, 10], [0, height, -10], unit);
    const result = new BallisticsSystem({ random: () => 0 }).resolveVehicleImpact({
      weapon,
      velocity: new THREE.Vector3(0, 0, -weapon.muzzleVelocity)
    }, {
      kind: 'vehicle',
      unit,
      point: new THREE.Vector3(...hit.point),
      normal: new THREE.Vector3(...hit.normal),
      zone: hit.zone,
      fallbackZone: hit.fallbackZone,
      plateId: hit.plateId,
      armorVolumeId: hit.armorVolumeId,
      armorPart: hit.armorPart,
      armorGeometryQuality: hit.geometryQuality,
      localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
    });

    assert.equal(result.penetrated, true, spec.id);
    assert.deepEqual(
      result.internalPathHits.map(pathHit => pathHit.id),
      ['module-transmission', 'module-engine'],
      spec.id
    );
    assert.deepEqual(result.crewResult.internalPathHits, result.internalPathHits);
  }
});

test('unarmored transport shells enter through exact front meshes and trace the full body', () => {
  for (const [spec, height, expectedSource] of [
    [VEHICLES.LAFFLY_S20TL, 1.05, 'S20TL_RadiatorGrille'],
    [VEHICLES.OPEL_BLITZ, 0.98, 'OpelBlitz_RadiatorShell']
  ]) {
    const unit = vehicleUnit(spec);
    unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
    const hit = segment([0, height, 10], [0, height, -10], unit);
    const result = new BallisticsSystem({ random: () => 0 }).resolveVehicleImpact({
      weapon: WEAPONS.KWK36_AP,
      velocity: new THREE.Vector3(0, 0, -WEAPONS.KWK36_AP.muzzleVelocity)
    }, {
      kind: 'vehicle',
      unit,
      point: new THREE.Vector3(...hit.point),
      normal: new THREE.Vector3(...hit.normal),
      zone: hit.zone,
      fallbackZone: hit.fallbackZone,
      plateId: hit.plateId,
      armorVolumeId: hit.armorVolumeId,
      armorPart: hit.armorPart,
      armorGeometryQuality: hit.geometryQuality,
      localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
    });

    assert.equal(result.penetrated, true, spec.id);
    assert.equal(result.nominalArmorMm, 0, spec.id);
    assert.equal(hit.sourceMeshName, expectedSource, spec.id);
    assert.deepEqual(
      result.internalPathHits.map(pathHit => pathHit.id),
      ['module-engine', 'module-transmission', 'module-ammunition-cargo'],
      spec.id
    );
  }
});

test('early German light-tank penetrations enter distinct front- and rear-drive layouts', () => {
  for (const [spec, start, end, expected] of [
    [
      VEHICLES.PANZER_II_C,
      [0, 0.75, 10],
      [0, 0.75, -10],
      ['module-transmission', 'module-engine']
    ],
    [
      VEHICLES.PANZER_35T,
      [0, 0.78, -10],
      [0, 0.78, 10],
      ['module-transmission', 'module-engine']
    ]
  ]) {
    const unit = vehicleUnit(spec);
    unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
    const hit = segment(start, end, unit);
    const velocity = new THREE.Vector3(...end)
      .sub(new THREE.Vector3(...start))
      .normalize()
      .multiplyScalar(WEAPONS.KWK36_AP.muzzleVelocity);
    const result = new BallisticsSystem({ random: () => 0 }).resolveVehicleImpact({
      weapon: WEAPONS.KWK36_AP,
      velocity
    }, {
      kind: 'vehicle',
      unit,
      point: new THREE.Vector3(...hit.point),
      normal: new THREE.Vector3(...hit.normal),
      zone: hit.zone,
      fallbackZone: hit.fallbackZone,
      plateId: hit.plateId,
      armorVolumeId: hit.armorVolumeId,
      armorPart: hit.armorPart,
      armorGeometryQuality: hit.geometryQuality,
      localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
    });

    assert.equal(result.penetrated, true, spec.id);
    assert.deepEqual(
      result.internalPathHits.map(pathHit => pathHit.id),
      expected,
      spec.id
    );
  }
});

test('Panzer 38(t) and Sd.Kfz. 231 penetrations enter their distinct front systems', () => {
  for (const [spec, height, expected] of [
    [
      VEHICLES.PANZER_38T,
      0.75,
      ['module-transmission', 'module-engine']
    ],
    [
      VEHICLES.SDKFZ_231,
      0.80,
      ['module-engine', 'module-transmission']
    ]
  ]) {
    const unit = vehicleUnit(spec);
    unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
    const hit = segment([0, height, 10], [0, height, -10], unit);
    const result = new BallisticsSystem({ random: () => 0 }).resolveVehicleImpact({
      weapon: WEAPONS.KWK36_AP,
      velocity: new THREE.Vector3(0, 0, -WEAPONS.KWK36_AP.muzzleVelocity)
    }, {
      kind: 'vehicle',
      unit,
      point: new THREE.Vector3(...hit.point),
      normal: new THREE.Vector3(...hit.normal),
      zone: hit.zone,
      fallbackZone: hit.fallbackZone,
      plateId: hit.plateId,
      armorVolumeId: hit.armorVolumeId,
      armorPart: hit.armorPart,
      armorGeometryQuality: hit.geometryQuality,
      localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
    });

    assert.equal(result.penetrated, true, spec.id);
    assert.deepEqual(
      result.internalPathHits.map(pathHit => pathHit.id),
      expected,
      spec.id
    );
  }
});

test('Char B1 bis and Panzer IV penetrations enter their distinct rear- and front-drive systems', () => {
  const testProjectile = {
    ...WEAPONS.KWK36_AP,
    penetrationMmAt100m: 120
  };
  for (const [spec, height, expected] of [
    [
      VEHICLES.CHAR_B1_BIS,
      0.83,
      ['module-engine', 'module-transmission']
    ],
    [
      VEHICLES.PANZER_IV_D,
      0.84,
      ['module-transmission', 'module-engine']
    ]
  ]) {
    const unit = vehicleUnit(spec);
    unit.applyArmorHit = result => ({ internalPathHits: result.internalPathHits });
    const hit = segment([0, height, 10], [0, height, -10], unit);
    const result = new BallisticsSystem({ random: () => 0 }).resolveVehicleImpact({
      weapon: testProjectile,
      velocity: new THREE.Vector3(0, 0, -testProjectile.muzzleVelocity)
    }, {
      kind: 'vehicle',
      unit,
      point: new THREE.Vector3(...hit.point),
      normal: new THREE.Vector3(...hit.normal),
      zone: hit.zone,
      fallbackZone: hit.fallbackZone,
      plateId: hit.plateId,
      armorVolumeId: hit.armorVolumeId,
      armorPart: hit.armorPart,
      armorGeometryQuality: hit.geometryQuality,
      localImpactPoint: [hit.localPoint.x, hit.localPoint.y, hit.localPoint.z]
    });

    assert.equal(result.penetrated, true, spec.id);
    assert.deepEqual(
      result.internalPathHits.map(pathHit => pathHit.id),
      expected,
      spec.id
    );
  }
});

test('fast projectiles cannot tunnel through named armor volumes', () => {
  const unit = vehicleUnit();
  const hit = segment([0, 1, 1000], [0, 1, -1000], unit);
  assert.ok(hit);
  assert.equal(hit.zone, 'hull_front');
  assert.ok(hit.t > 0 && hit.t < 1);

  const replay = segment([0, 1, 1000], [0, 1, -1000], unit);
  assert.deepEqual(replay, hit);
});

test('armor-exit trace crosses the authored hull mesh to its far named plate', () => {
  const unit = vehicleUnit(VEHICLES.PANZER_III_D);
  const entry = segment([0, 1, 10], [0, 1, -10], unit);
  const exit = traceVehicleArmorExit({
    unit,
    armorVolumeId: entry.armorVolumeId,
    entryPoint: entry.point,
    direction: [0, 0, -1],
    maxDistanceMeters: 10
  });

  assert.match(entry.plateId, /:positiveZ$/);
  assert.ok(exit);
  assert.equal(exit.armorVolumeId, entry.armorVolumeId);
  assert.match(exit.plateId, /:negativeZ$/);
  assert.ok(Math.abs(exit.normal[0]) < 1e-12);
  assert.ok(exit.normal[1] > 0.5);
  assert.ok(exit.normal[2] < -0.5);
  assert.ok(Math.abs(exit.point[2] + 2.605454603) < 1e-6);
  assert.ok(Math.abs(exit.distanceMeters - 5.15636371) < 1e-6);
  assert.ok(exit.distanceMeters > 0.01, 'exit must not be the t=0 entry face');
});

test('armor-exit trace crosses the SOMUA triangle shell to its far named plate', () => {
  const unit = vehicleUnit(VEHICLES.SOMUA_S35);
  const entry = segment([0, 0.85, 10], [0, 0.85, -10], unit);
  const exit = traceVehicleArmorExit({
    unit,
    armorVolumeId: entry.armorVolumeId,
    entryPoint: entry.point,
    direction: [0, 0, -1],
    maxDistanceMeters: 10
  });

  assert.equal(entry.sourceMeshName, 'S35_ProxyExteriorHull');
  assert.match(entry.plateId, /:positiveZ$/);
  assert.ok(exit);
  assert.equal(exit.armorVolumeId, entry.armorVolumeId);
  assert.match(exit.plateId, /:negativeZ$/);
  assert.ok(exit.normal[2] < -0.5);
  assert.ok(exit.point[2] < -2.2);
  assert.ok(exit.distanceMeters > 4.7);
  assert.ok(exit.distanceMeters > 0.01, 'exit must not be the t=0 entry face');
});
