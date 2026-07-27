import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createParametricVehicleMesh,
  signedGeometryVolume,
  validateParametricVehicleDefinition
} from '../src/authoring/vehicle/ParametricVehicleCompiler.js';
import {
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import {
  RENAULT_D2_AUTHORING_DATA
} from '../src/content/france1940/vehicleData/RenaultD2AuthoringData.js';

const EXPECTED_LODS = ['core', 'high', 'medium', 'proxy'];
const ENVELOPE_TOLERANCE_METERS = (
  RENAULT_D2_AUTHORING_DATA.validation.acceptedToleranceMeters
);

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`
  );
}

function visibleRigidBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const objectBounds = new THREE.Box3();
  root.traverse(object => {
    if (
      (!object.isMesh && !object.isInstancedMesh)
      || !object.visible
      || object.userData.envelopeRole === 'flexibleAttachment'
    ) {
      return;
    }
    objectBounds.setFromObject(object);
    bounds.union(objectBounds);
  });
  return bounds;
}

function visibleTriangleCount(root) {
  let triangles = 0;
  root.traverse(object => {
    if (
      (!object.isMesh && !object.isInstancedMesh)
      || !object.visible
      || !object.geometry?.attributes?.position
    ) {
      return;
    }
    const geometryTriangles = (
      object.geometry.index?.count
      ?? object.geometry.attributes.position.count
    ) / 3;
    triangles += geometryTriangles * (object.isInstancedMesh ? object.count : 1);
  });
  return triangles;
}

test('Renault D2 authoring bundle records immutable source evidence and dimensions', async () => {
  const definition = validateParametricVehicleDefinition(
    RENAULT_D2_AUTHORING_DATA
  );
  assert.equal(definition, RENAULT_D2_AUTHORING_DATA);
  assert.ok(Object.isFrozen(definition));
  assert.ok(Object.isFrozen(definition.geometry.hull.stations));
  assert.deepEqual(definition.dimensionsMeters, {
    length: 5.46,
    width: 2.22,
    height: 2.67
  });
  assert.equal(definition.publishedData.roadWheelsPerSide, 15);
  assert.equal(definition.publishedData.driveLocation, 'rear');
  assert.equal(definition.publishedData.trenchTail, false);
  assert.match(definition.validation.acceptanceStatus, /human review/);
  assert.match(
    definition.blueprint.sourceRecords[0].quality,
    /secondary orthographic/
  );
  assert.equal(
    definition.blueprint.views.side.rigidRegistration.rigidFrontPixelX,
    14
  );
  assert.equal(
    definition.blueprint.views.front.landmarks['main-gun-axis'][0],
    337
  );
  assert.equal(
    definition.blueprint.views.top.landmarks['turret-ring-center'][0],
    694
  );

  const sourceImage = await readFile(
    new URL(
      '../public/assets/blueprints/france1940/renault-d2-tourelle-apx-4.png',
      import.meta.url
    )
  );
  assert.equal(
    createHash('sha256').update(sourceImage).digest('hex'),
    definition.blueprint.sourceRecords[0].sha256
  );
});

test('parametric compiler is injected and does not own Renault D2 identity', () => {
  const alternate = structuredClone(RENAULT_D2_AUTHORING_DATA);
  alternate.modelId = 'test_injected_vehicle';
  alternate.designation = 'Injected test vehicle';
  alternate.meshPrefix = 'Injected';
  alternate.validation.requiredParts = [];
  alternate.validation.closedParts = [];

  const model = createParametricVehicleMesh(alternate);
  assert.equal(model.name, 'test_injected_vehicle');
  assert.ok(model.getObjectByName('Injected_PrimaryHull'));
  assert.ok(model.getObjectByName('Injected_Turret'));
  assert.equal(model.getObjectByName('D2_PrimaryHull'), undefined);

  const invalid = structuredClone(alternate);
  invalid.geometry.mainGun.barrelLength += 0.1;
  assert.throws(
    () => validateParametricVehicleDefinition(invalid),
    /barrelLength diverges/
  );

  const unordered = structuredClone(alternate);
  unordered.geometry.hull.stations[2].z = unordered.geometry.hull.stations[1].z;
  assert.throws(
    () => validateParametricVehicleDefinition(unordered),
    /hull station z must be strictly ascending/
  );
});

test('Renault D2 emits source-defined parts, positive closed winding, and all LODs', () => {
  const model = createParametricVehicleMesh(RENAULT_D2_AUTHORING_DATA);
  for (const name of RENAULT_D2_AUTHORING_DATA.validation.requiredParts) {
    assert.ok(model.getObjectByName(name), `${name} missing`);
  }
  for (const name of RENAULT_D2_AUTHORING_DATA.validation.closedParts) {
    const mesh = model.getObjectByName(name);
    assert.ok(mesh?.isMesh, `${name} is not a mesh`);
    assert.equal(mesh.geometry.userData.outwardWindingAudited, true);
    assert.ok(signedGeometryVolume(mesh.geometry) > 0, `${name} winding`);
  }

  const lods = new Set();
  model.traverse(object => {
    if (object.isMesh || object.isInstancedMesh) {
      lods.add(object.userData.lodBand);
    }
  });
  assert.deepEqual([...lods].filter(Boolean).sort(), EXPECTED_LODS);

  const triangleCounts = {};
  for (const lod of ['high', 'medium', 'core', 'proxy']) {
    setCalibrationLodVisibility(model, lod);
    triangleCounts[lod] = visibleTriangleCount(model);
    assert.ok(triangleCounts[lod] > 0, `${lod} must render geometry`);
  }
  assert.ok(triangleCounts.high > triangleCounts.medium);
  assert.ok(triangleCounts.medium > triangleCounts.core);
  assert.ok(triangleCounts.proxy < triangleCounts.core);
});

test('Renault D2 rigid envelope and ground contact stay tied to published dimensions', () => {
  const model = createParametricVehicleMesh(RENAULT_D2_AUTHORING_DATA);
  const expected = RENAULT_D2_AUTHORING_DATA.dimensionsMeters;
  for (const lod of ['high', 'medium', 'core', 'proxy']) {
    setCalibrationLodVisibility(model, lod);
    const bounds = visibleRigidBounds(model);
    const size = bounds.getSize(new THREE.Vector3());
    assertNear(
      size.z,
      expected.length,
      ENVELOPE_TOLERANCE_METERS,
      `${lod} length`
    );
    assertNear(
      size.x,
      expected.width,
      ENVELOPE_TOLERANCE_METERS,
      `${lod} width`
    );
    assertNear(
      bounds.max.y,
      expected.height,
      ENVELOPE_TOLERANCE_METERS,
      `${lod} height`
    );
    assertNear(
      bounds.min.y,
      0,
      ENVELOPE_TOLERANCE_METERS,
      `${lod} ground contact`
    );
  }
});

test('Renault D2 mechanical datums drive tracks and independently mounted weapons', () => {
  const definition = RENAULT_D2_AUTHORING_DATA;
  const model = createParametricVehicleMesh(definition);
  const path = definition.geometry.runningGear.trackPath;
  assert.equal(path.roadWheels.length, 15);
  assert.ok(path.driveSprocket.centerZ < 0);
  assert.ok(path.idlerWheel.centerZ > 0);
  assert.equal(
    model.userData.runningGear.userData.trackPathConfig,
    path
  );
  assert.equal(
    model.userData.proxyRunningGear.userData.trackPathConfig,
    path
  );

  const turret = model.userData.turret;
  const barrel = model.userData.barrel;
  const muzzle = model.userData.muzzle;
  assert.equal(barrel.parent, turret);
  assert.equal(muzzle.parent, turret);
  assert.equal(barrel.userData.mountSide, 'right');
  assert.equal(model.userData.coax.userData.mountSide, 'left');
  assert.ok(barrel.position.x < 0);
  assert.ok(model.userData.coax.position.x > 0);
  assertNear(
    barrel.position.z + definition.geometry.mainGun.barrelLength * 0.5,
    muzzle.position.z,
    1e-9,
    'main muzzle'
  );
  assertNear(
    model.userData.coax.position.z
      + definition.geometry.coax.barrelLength * 0.5,
    model.userData.coaxMuzzle.position.z,
    1e-9,
    'coax muzzle'
  );
});

test('Renault D2 checked-in interchange artifact is parseable and semantically named', async () => {
  const generated = new URL(
    '../docs/vehicle-authoring/renault-d2/generated/',
    import.meta.url
  );
  const manifest = JSON.parse(await readFile(
    new URL('manifest.json', generated),
    'utf8'
  ));
  assert.equal(manifest.modelId, RENAULT_D2_AUTHORING_DATA.modelId);
  assert.equal(manifest.captureRecords.length, 12);
  assert.equal(
    manifest.sourceImageSha256,
    RENAULT_D2_AUTHORING_DATA.blueprint.sourceRecords[0].sha256
  );

  const bytes = await readFile(new URL('renault-d2-all-lods.glb', generated));
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
  assert.ok(gltf.scene.getObjectByName('D2_PrimaryHull'));
  assert.ok(gltf.scene.getObjectByName('D2_ProxyHull'));
  assert.ok(gltf.scene.getObjectByName('D2_MainMuzzle'));
});
