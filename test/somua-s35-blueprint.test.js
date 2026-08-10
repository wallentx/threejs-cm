import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SOMUA_S35_BLUEPRINT_CALIBRATION,
  createSomuaS35Mesh
} from '../src/world/vehicles/SomuaS35.js';
import {
  createSomuaS35HullLoftMeshData,
  createSomuaS35TurretLoftMeshData,
  SOMUA_S35_HULL_STATIONS,
  SOMUA_S35_TURRET_STATIONS,
  SOMUA_S35_WEAPON_INSTALLATION,
  createSomuaS35ArmorCollision
} from '../src/content/france1940/vehicleData/SomuaS35Shape.js';
import {
  SOMUA_S35_VISUAL_DATA
} from '../src/content/france1940/vehicleData/SomuaS35VisualData.js';
import { auditClosedGeometry } from '../src/calibration/ModelSurfaceAudit.js';
import {
  SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY,
  SOMUA_S35_REFERENCE_GUN_MUZZLE,
  SOMUA_S35_REFERENCE_REGISTRATION
} from '../src/content/france1940/vehicleData/SomuaS35ReferenceGeometry.js';

function signedVolume(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

function detailedRigidBounds(vehicle) {
  vehicle.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  vehicle.traverse(object => {
    if (!object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.lodBand === 'ui'
      || ['weaponProjection', 'flexibleAttachment'].includes(object.userData.envelopeRole)) {
      return;
    }
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

function hullRoofYAt(z) {
  for (let index = 1; index < SOMUA_S35_HULL_STATIONS.length; index++) {
    const rear = SOMUA_S35_HULL_STATIONS[index - 1];
    const front = SOMUA_S35_HULL_STATIONS[index];
    if (z < rear.z || z > front.z) continue;
    const alpha = (z - rear.z) / (front.z - rear.z);
    return THREE.MathUtils.lerp(rear.deckY, front.deckY, alpha);
  }
  throw new Error(`No S35 hull roof segment contains z=${z}`);
}

function minimumMeshDistance(source, target, sourceFilter) {
  const sourcePosition = source.geometry.attributes.position;
  const targetPosition = target.geometry.attributes.position;
  const targetIndex = target.geometry.index;
  const sourcePoint = new THREE.Vector3();
  const closestPoint = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triangles = [];
  for (let offset = 0; offset < targetIndex.count; offset += 3) {
    a.fromBufferAttribute(targetPosition, targetIndex.getX(offset))
      .applyMatrix4(target.matrixWorld);
    b.fromBufferAttribute(targetPosition, targetIndex.getX(offset + 1))
      .applyMatrix4(target.matrixWorld);
    c.fromBufferAttribute(targetPosition, targetIndex.getX(offset + 2))
      .applyMatrix4(target.matrixWorld);
    triangles.push(new THREE.Triangle(a.clone(), b.clone(), c.clone()));
  }
  let minimum = Infinity;
  for (let index = 0; index < sourcePosition.count; index += 1) {
    sourcePoint.fromBufferAttribute(sourcePosition, index)
      .applyMatrix4(source.matrixWorld);
    if (!sourceFilter(sourcePoint)) continue;
    for (const triangle of triangles) {
      triangle.closestPointToPoint(sourcePoint, closestPoint);
      minimum = Math.min(minimum, sourcePoint.distanceTo(closestPoint));
    }
  }
  return minimum;
}

function minimumPointMeshDistance(point, mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const closestPoint = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let minimum = Infinity;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, index.getX(offset + 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, index.getX(offset + 2)).applyMatrix4(mesh.matrixWorld);
    new THREE.Triangle(a, b, c).closestPointToPoint(point, closestPoint);
    minimum = Math.min(minimum, point.distanceTo(closestPoint));
  }
  return minimum;
}

test('SOMUA S35 preserves its exact rigid envelope and reproducible side registration', () => {
  const vehicle = createSomuaS35Mesh();
  const metadata = vehicle.userData.modelMetadata;
  assert.deepEqual(metadata.dimensionsMeters, { length: 5.38, width: 2.12, height: 2.62 });
  assert.equal(metadata.blueprintCalibration, SOMUA_S35_BLUEPRINT_CALIBRATION);
  assert.equal(
    metadata.blueprintCalibration.sources[0].artifact,
    '/assets/blueprints/france1940/s35-4view.webp'
  );
  assert.deepEqual(
    Object.keys(metadata.blueprintCalibration.imageRegistration.views).sort(),
    ['front', 'rear', 'side', 'top']
  );
  assert.match(
    metadata.blueprintCalibration.datums.registeredInferred.quality,
    /source-owned hull and APX geometry/
  );

  const bounds = detailedRigidBounds(vehicle);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 5.38) < 1e-5);
  assert.ok(Math.abs(size.x - 2.12) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - 2.62) < 1e-5);
  assert.ok(
    bounds.min.y >= -1e-5 && bounds.min.y < 0.01,
    'closed tracks must meet the ground within floating-point tolerance'
  );
});

test('SOMUA running gear keeps the complete source wheel and track assemblies', () => {
  const vehicle = createSomuaS35Mesh();
  const wheels = vehicle.getObjectByName('S35_SourceRunningGear');
  const tracks = vehicle.getObjectByName('S35_SourceTracks');
  const proxyWheels = vehicle.getObjectByName('S35_ProxyRunningGear');
  const proxyTracks = vehicle.getObjectByName('S35_ProxyTracks');
  assert.equal(wheels.userData.lodBand, 'core');
  assert.equal(tracks.userData.lodBand, 'core');
  assert.equal(wheels.userData.sourceNodeNames.length, 41);
  assert.equal(tracks.userData.sourceNodeNames.length, 196);
  assert.equal(
    wheels.userData.sourceNodeNames
      .filter(name => /^pCylinder(?:[5-9]|1[0-3])_Wheel/.test(name)).length,
    18,
    'nine source road wheels per side must survive extraction'
  );
  assert.ok(proxyWheels.geometry.index.count < wheels.geometry.index.count);
  assert.ok(proxyTracks.geometry.index.count < tracks.geometry.index.count);
  assert.equal(SOMUA_S35_VISUAL_DATA.geometry.runningGear.supports.roadWheels.length, 9);
  assert.ok(SOMUA_S35_VISUAL_DATA.geometry.runningGear.supports.driveSprocket.centerZ < 0);
  assert.ok(SOMUA_S35_VISUAL_DATA.geometry.runningGear.supports.idlerWheel.centerZ > 0);
});

test('SOMUA authored cast hull and APX turret remain closed and outward-wound', () => {
  const vehicle = createSomuaS35Mesh();
  for (const name of ['S35_SourceExteriorHull', 'S35_APX1CE_TurretBody']) {
    const part = vehicle.getObjectByName(name);
    assert.ok(part, `${name} must exist`);
    assert.ok(signedVolume(part.geometry) > 0, `${name} must face outward`);
    assert.ok(part.geometry.userData.signedVolumeCubicMeters > 0);
  }
});

test('SOMUA rear engine deck follows and seats on the cast hull roof', () => {
  const vehicle = createSomuaS35Mesh();
  const deck = vehicle.getObjectByName('S35_SlopingEngineDeck');
  const hull = vehicle.getObjectByName('S35_SourceExteriorHull');
  assert.ok(deck, 'sloping rear engine deck must exist');
  vehicle.updateMatrixWorld(true);
  const deckBounds = new THREE.Box3().setFromObject(deck);
  const rearContactDistance = minimumMeshDistance(
    deck,
    hull,
    point => point.z <= deckBounds.min.z + 0.18
  );
  const frontContactDistance = minimumMeshDistance(
    deck,
    hull,
    point => point.z >= deckBounds.max.z - 0.18
  );
  assert.ok(rearContactDistance <= 0.002, `rear deck contact gap ${rearContactDistance} m`);
  assert.ok(frontContactDistance <= 0.002, `front deck contact gap ${frontContactDistance} m`);
  assert.deepEqual(deck.userData.sourceNodeNames, ['polySurface291_Upper_blinn3_0']);
  assert.equal(deck.userData.contactSurface, 'S35_SourceExteriorHull');
});

test('SOMUA armament and proxy retain articulated silhouette ownership', () => {
  const vehicle = createSomuaS35Mesh();
  const turret = vehicle.userData.turret;
  const mantlet = vehicle.getObjectByName('S35_SA35_Mantlet');
  const barrel = vehicle.userData.barrel;
  const coaxMuzzle = vehicle.userData.weaponMuzzles.coax;
  vehicle.updateMatrixWorld(true);
  const mantletBounds = new THREE.Box3().setFromObject(mantlet);
  const barrelBounds = new THREE.Box3().setFromObject(barrel);
  const turretTopY = turret.localToWorld(new THREE.Vector3(
    0,
    SOMUA_S35_TURRET_STATIONS.at(-1).y,
    0
  )).y;

  assert.ok(
    mantletBounds.max.y <= turretTopY + 0.001,
    `mantlet top ${mantletBounds.max.y} must remain within turret top ${turretTopY}`
  );
  assert.deepEqual(mantlet.userData.sourceNodeNames, ['polySurface300_Turret_blinn_0']);
  assert.deepEqual(barrel.userData.sourceNodeNames, ['polySurface300_Turret_blinn_0']);
  assert.equal(
    mantlet.geometry.userData.sourceTriangleCount
      + barrel.geometry.userData.sourceTriangleCount,
    646,
    'mantlet and barrel partitions must cover the complete source installation'
  );
  assert.ok(mantletBounds.max.z < barrelBounds.max.z, 'barrel must project ahead of mantlet');
  const coaxWorld = coaxMuzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(
    minimumPointMeshDistance(coaxWorld, barrel) <= 0.006,
    'coax muzzle marker must remain within 6 mm of the source gun installation surface'
  );
  assert.equal(vehicle.userData.muzzle.parent, vehicle.userData.turret);
  assert.equal(barrel.parent, vehicle.userData.turret);
  assert.equal(barrel.userData.envelopeRole, 'weaponProjection');
  assert.equal(coaxMuzzle.userData.mountSide, 'right');
  assert.equal(coaxMuzzle.parent, vehicle.userData.turret);
  assert.deepEqual(coaxMuzzle.position.toArray(), [
    SOMUA_S35_WEAPON_INSTALLATION.coax.axisLocalX,
    SOMUA_S35_WEAPON_INSTALLATION.coax.axisLocalY,
    SOMUA_S35_WEAPON_INSTALLATION.coax.muzzleLocalZ
  ]);
  assert.ok(vehicle.getObjectByName('S35_ProxyTracks'));
  assert.ok(vehicle.getObjectByName('S35_ProxyRunningGear'));
  assert.ok(vehicle.getObjectByName('S35_ProxyExteriorHull'));
  assert.equal(vehicle.userData.proxyTurret.parent, vehicle.userData.turret);
  assert.equal(mantlet.userData.lodBand, 'core');
  assert.equal(vehicle.userData.proxyMantlet.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.proxyMantlet.userData.lodBand, 'proxy');
  assert.equal(vehicle.userData.proxyBarrel.parent, vehicle.userData.turret);
  assert.ok(vehicle.getObjectByName('S35_ClosedCupolaRoof'));
  assert.equal(vehicle.getObjectByName('S35_CupolaHatch'), undefined);
  assert.equal(vehicle.userData.commanderStation.canUnbutton, false);
  assert.deepEqual(vehicle.userData.commanderHatches, []);
  assert.equal(vehicle.userData.proxyCupola.userData.lodBand, 'proxy');
  assert.equal(vehicle.userData.proxyCupolaRoof.userData.lodBand, 'proxy');

  const armor = createSomuaS35ArmorCollision({
    hull_front: 47,
    hull_side: 40,
    hull_rear: 35,
    turret_front: 56,
    turret_side: 46,
    turret_rear: 46
  }, 'test://somua-s35');
  const mantletVolume = armor.volumes.find(volume => volume.id === 'gun-mantlet');
  assert.deepEqual(mantletVolume.offset, [
    SOMUA_S35_WEAPON_INSTALLATION.main.axisLocalX,
    SOMUA_S35_WEAPON_INSTALLATION.main.axisLocalY,
    SOMUA_S35_WEAPON_INSTALLATION.mantlet.centerLocalZ
  ]);
});

test('SOMUA source-owned geometry retains four-view evidence and reduced GLB LODs', () => {
  const geometry = SOMUA_S35_VISUAL_DATA.geometry;
  assert.equal(SOMUA_S35_HULL_STATIONS, geometry.hullStations);
  assert.equal(SOMUA_S35_TURRET_STATIONS, geometry.turret.stations);
  assert.ok(SOMUA_S35_HULL_STATIONS.length >= 16);
  assert.ok(SOMUA_S35_HULL_STATIONS.every(station => (
    station.sourcePixels.length === 2 && /source pixels|elevation/.test(station.sourceQuality)
  )));
  assert.ok(SOMUA_S35_TURRET_STATIONS.every(station => (
    station.planVertices.length === 12 && station.sourcePixels.length === 3
  )));
  assert.deepEqual(
    geometry.runningGear.supports.roadWheels[0].sourcePixels,
    [790, 1905]
  );
  assert.deepEqual(
    geometry.runningGear.supports.roadWheels.at(-1).sourcePixels,
    [3295, 1905]
  );

  const vehicle = createSomuaS35Mesh();
  const hull = vehicle.getObjectByName('S35_SourceExteriorHull');
  const proxyHull = vehicle.getObjectByName('S35_ProxyExteriorHull');
  const turret = vehicle.getObjectByName('S35_APX1CE_TurretBody');
  const proxyTurret = vehicle.getObjectByName('S35_ProxyAPXTurret');
  assert.ok(proxyHull.geometry.index.count < hull.geometry.index.count);
  assert.ok(proxyTurret.geometry.index.count < turret.geometry.index.count);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.sourceExteriorNodeCount, 297);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.emittedSourceNodeCount, 285);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.derivedPresentationNodeCount, 4);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.excludedInteriorNodeCount, 4);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.excludedPresentationNodeCount, 13);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.sourceTriangleCount, 169985);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.visibleHighTriangleCount, 44483);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.proxyTriangleCount, 20220);
  assert.equal(SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.assemblyCount, 29);
  assert.deepEqual(vehicle.userData.modelMetadata.lodTriangles, {
    high: 44483,
    proxy: 20220,
    sourceExterior: 169985
  });
  const turretSourceNodes = new Set();
  let turretSourceTriangles = 0;
  let turretEmittedTriangles = 0;
  vehicle.userData.turret.traverse(object => {
    if (!object.isMesh || object.userData.lodBand === 'proxy') return;
    for (const name of object.userData.sourceNodeNames) turretSourceNodes.add(name);
    turretSourceTriangles += object.geometry.userData.sourceTriangleCount;
    turretEmittedTriangles += object.geometry.userData.emittedTriangleCount;
  });
  assert.equal(turretSourceTriangles, 3130);
  assert.equal(turretEmittedTriangles, 3282);
  assert.ok(turretSourceNodes.has('pCylinder95_Turret_blinn_0'));
  assert.ok(turretSourceNodes.has('pCylinder96_Turret_blinn_0'));
  assert.ok(turretSourceNodes.has('polySurface303_Turret_blinn_0'));
  assert.ok(turretSourceNodes.has('pPlane28_Turret_blinn_0'));
  assert.ok(turretSourceNodes.has('derived_right_vision_aperture_cover_indicator'));
  assert.ok(turretSourceNodes.has('derived_left_vision_aperture_cover_indicator'));
  assert.equal(
    turret.geometry.userData.sourceSha256,
    SOMUA_S35_REFERENCE_REGISTRATION.source.sha256
  );
  const reference = createSomuaS35TurretLoftMeshData();
  const armor = createSomuaS35ArmorCollision({
    hull_front: 47,
    hull_side: 40,
    hull_rear: 35,
    turret_front: 56,
    turret_side: 46,
    turret_rear: 46
  }, 'test://somua-s35');
  const armorTurret = armor.volumes.find(volume => volume.id === 'turret-apx1ce-shell');
  assert.equal(
    armorTurret.sourceNodeName,
    'registered-four-view-apx1ce-closed-loft'
  );
  assert.deepEqual(armorTurret.vertices, reference.positions);
  assert.equal(
    armorTurret.plates.reduce((sum, plate) => sum + plate.triangles.length, 0),
    reference.indices.length / 3
  );
  assert.ok(vehicle.getObjectByName('S35_APX1CE_SideDoor'));
  assert.equal(vehicle.getObjectByName('S35_APX1CE_RightPortOuter'), undefined);
  assert.equal(vehicle.getObjectByName('S35_APX1CE_LeftPortOuter'), undefined);
  assert.deepEqual(
    vehicle.getObjectByName('S35_APX1CE_SideDoor').userData.sourceNodeNames,
    ['pPlane28_Turret_blinn_0']
  );
  assert.equal(vehicle.getObjectByName('S35_APX1CE_TurretDome'), undefined);
  assert.deepEqual(
    vehicle.getObjectByName('S35_SA35_Mantlet').userData.sourceNodeNames,
    ['polySurface300_Turret_blinn_0']
  );
  assert.deepEqual(
    vehicle.getObjectByName('S35_ClosedObservationCupola').userData.sourceNodeNames,
    ['pCylinder98_Turret_blinn_0']
  );
  assert.deepEqual(
    vehicle.getObjectByName('S35_ClosedCupolaRoof').userData.sourceNodeNames,
    ['pCylinder99_Turret_blinn_0']
  );
});

test('SOMUA primary armor shells retain closed GLB topology without repair fans', () => {
  const vehicle = createSomuaS35Mesh();
  const expected = new Map([
    ['S35_SourceExteriorHull', {
      triangles: 14614,
      sourceNodes: [
        'polySurface162_Chassis_blinn9_0',
        'pPlane11_Chassis_blinn9_0',
        'polySurface182_Chassis_blinn9_0',
        'polySurface312_Chassis_blinn9_0',
        'polySurface307_Upper_blinn3_0'
      ]
    }],
    ['S35_ProxyExteriorHull', {
      triangles: 8680,
      sourceNodes: [
        'polySurface162_Chassis_blinn9_0',
        'pPlane11_Chassis_blinn9_0',
        'polySurface182_Chassis_blinn9_0',
        'polySurface312_Chassis_blinn9_0',
        'polySurface307_Upper_blinn3_0'
      ]
    }],
    ['S35_APX1CE_TurretBody', {
      triangles: 1810,
      sourceNodes: [
        'pCylinder95_Turret_blinn_0',
        'pCylinder96_Turret_blinn_0',
        'polySurface303_Turret_blinn_0',
        'derived_right_vision_aperture_cover',
        'derived_left_vision_aperture_cover'
      ]
    }],
    ['S35_ProxyAPXTurret', {
      triangles: 1076,
      sourceNodes: [
        'pCylinder95_Turret_blinn_0',
        'pCylinder96_Turret_blinn_0',
        'polySurface303_Turret_blinn_0',
        'derived_right_vision_aperture_cover',
        'derived_left_vision_aperture_cover'
      ]
    }]
  ]);
  for (const [name, { triangles, sourceNodes }] of expected) {
    const mesh = vehicle.getObjectByName(name);
    const audit = auditClosedGeometry(mesh.geometry);
    assert.equal(audit.closed, true, `${name} must be sealed`);
    assert.equal(audit.genus, 0, `${name} must remain a simple armor volume`);
    assert.equal(mesh.geometry.index.count / 3, triangles);
    assert.deepEqual(mesh.geometry.userData.sourceNodeNames, sourceNodes);
    assert.equal(mesh.geometry.userData.cleanArmorShell, false);
    assert.equal(
      mesh.geometry.userData.geometryProvenance,
      'GLB-derived exterior assembly with post-reduction boundary-loop closure'
    );
    for (const part of mesh.geometry.userData.sourceParts) {
      assert.doesNotMatch(
        part.closureAudit?.method ?? '',
        /fan/i,
        `${part.sourceNodeName} must not use a center-fan repair`
      );
    }
  }

  const details = vehicle.getObjectByName('S35_SourceExteriorDetails');
  assert.equal(details.userData.lodBand, 'high');
  assert.equal(details.geometry.index.count / 3, 1887);
  assert.equal(vehicle.getObjectByName('S35_ProxyExteriorDetails'), undefined);

  const sourceNames = [];
  vehicle.traverse(object => {
    if (object.isMesh) sourceNames.push(...(object.userData.sourceNodeNames ?? []));
  });
  assert.ok(
    sourceNames.every(name => !name.includes('Interior_blinn3')),
    'interior source faces must never be emitted into the runtime model'
  );
  assert.ok(
    sourceNames.every(name => !name.includes('registered-four-view')),
    'the procedural four-view loft must not replace the GLB render shell'
  );
});

test('SOMUA retains only the source twin exhaust from the mixed toolset mesh', () => {
  const vehicle = createSomuaS35Mesh();
  const exhaust = vehicle.getObjectByName('S35_TwinExhaust');
  const proxyExhaust = vehicle.getObjectByName('S35_ProxyTwinExhaust');
  for (const part of [exhaust, proxyExhaust]) {
    assert.ok(part, 'twin exhaust must survive every runtime distance tier');
    assert.equal(part.userData.sourceMaterialSlot, 'metal');
    assert.deepEqual(
      part.userData.sourceNodeNames,
      ['polySurface310_Toolset_blinn5_0#twin-exhaust']
    );
    assert.equal(part.geometry.userData.sourceTriangleCount, 988);
  }
  assert.ok(
    proxyExhaust.geometry.index.count < exhaust.geometry.index.count,
    'proxy exhaust must use the reduced source-derived representation'
  );
  assert.equal(
    SOMUA_S35_REFERENCE_REGISTRATION.source
      .partiallyRetainedSourceNodes.polySurface310_Toolset_blinn5_0.retainedPart,
    'polySurface310_Toolset_blinn5_0#twin-exhaust'
  );
});

test('SOMUA GLB assemblies render repaired outward faces without double-sided materials', () => {
  const vehicle = createSomuaS35Mesh();
  const excluded = new Set(
    SOMUA_S35_REFERENCE_REGISTRATION.source.excludedPresentationNodes
  );
  let assemblyCount = 0;
  vehicle.traverse(object => {
    if (!object.isMesh || !object.userData.sourceAssemblyKey) return;
    assemblyCount += 1;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    assert.ok(
      materials.every(material => material.side === THREE.FrontSide),
      `${object.name} must render repaired outward faces only`
    );
    assert.ok(
      object.userData.sourceNodeNames.every(name => !excluded.has(name)),
      `${object.name} must not restore excluded presentation micro-detail`
    );
  });
  assert.equal(assemblyCount, 29);
  assert.equal(vehicle.getObjectByName('S35_Source_static_body_high_metal'), undefined);
  assert.equal(vehicle.getObjectByName('S35_Source_static_body_high_track'), undefined);
  assert.equal(vehicle.getObjectByName('S35_Source_turret_body_medium_track'), undefined);
  const hull = vehicle.getObjectByName('S35_SourceExteriorHull');
  const details = vehicle.getObjectByName('S35_SourceExteriorDetails');
  assert.equal(hull.userData.sourceMaterialSlot, 'paint');
  assert.deepEqual(hull.userData.sourceMaterialNames, [
    'Chassis_blinn9',
    'Upper_blinn3'
  ]);
  assert.ok(details.userData.sourceMaterialNames.includes('blinn4'));
  assert.ok(details.userData.sourceMaterialNames.includes('Door_blinn4'));
});
