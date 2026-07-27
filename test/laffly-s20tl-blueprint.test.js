import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createLafflyS20TLMesh,
  LAFFLY_S20TL_BLUEPRINT_CONTRACT
} from '../src/world/vehicles/LafflyS20TL.js';
import { setCalibrationLodVisibility } from '../src/calibration/CalibrationModel.js';

const TOLERANCE = 2e-6;

function visibleBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh || !object.visible || !object.geometry) return;
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

function visibleTriangleCount(root) {
  let triangles = 0;
  root.traverse(object => {
    if (!object.isMesh || !object.visible || !object.geometry) return;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position.count / 3;
  });
  return triangles;
}

function signedVolume(geometry) {
  const positions = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(positions, index.getX(offset));
    b.fromBufferAttribute(positions, index.getX(offset + 1));
    c.fromBufferAttribute(positions, index.getX(offset + 2));
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

test('Laffly S20TL retains the exact rigid envelope at every LOD', () => {
  const model = createLafflyS20TLMesh();
  const expected = LAFFLY_S20TL_BLUEPRINT_CONTRACT.dimensionsMeters;
  for (const tier of ['high', 'medium', 'core', 'proxy']) {
    setCalibrationLodVisibility(model, tier);
    const bounds = visibleBounds(model);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.z - expected.length) < TOLERANCE, `${tier} length`);
    assert.ok(Math.abs(size.x - expected.width) < TOLERANCE, `${tier} width`);
    assert.ok(Math.abs(size.y - expected.height) < TOLERANCE, `${tier} height`);
    assert.ok(Math.abs(bounds.min.y) < TOLERANCE, `${tier} ground contact`);
  }
});

test('Laffly S20TL main wheels and undulation rollers use drawing-measured stations', () => {
  const model = createLafflyS20TLMesh();
  const contract = LAFFLY_S20TL_BLUEPRINT_CONTRACT;
  const mainWheels = [];
  const frontRollers = [];
  const bellyRollers = [];
  model.traverse(object => {
    if (object.userData.lodBand !== 'core') return;
    if (/^S20TL_Wheel_\d_(Right|Left)$/.test(object.name)) mainWheels.push(object);
    if (/^S20TL_FrontUndulationRoller_/.test(object.name) && !/_Hub$/.test(object.name)) frontRollers.push(object);
    if (/^S20TL_BellyUndulationRoller_/.test(object.name) && !/_Hub$/.test(object.name)) bellyRollers.push(object);
  });

  assert.equal(mainWheels.length, 6);
  assert.deepEqual(
    [...new Set(mainWheels.map(wheel => wheel.position.z))].sort((a, b) => b - a),
    [...contract.axleZ]
  );
  assert.ok(mainWheels.every(wheel => Math.abs(wheel.position.y - contract.wheelRadius) < TOLERANCE));
  assert.equal(frontRollers.length, 2);
  assert.equal(bellyRollers.length, 2);
  assert.ok(frontRollers.every(roller => roller.position.z === contract.frontRoller.z));
  assert.ok(bellyRollers.every(roller => roller.position.z === contract.bellyRoller.z));
});

test('Laffly S20TL is uncovered at every tier and keeps open-top identity in its proxy', () => {
  const model = createLafflyS20TLMesh();
  assert.equal(model.userData.openTop, true);
  assert.equal(model.userData.canvasTop, false);
  assert.equal(model.getObjectByName('S20TL_UnarmedHardpoint'), model.userData.muzzle);

  const roofLikeMeshes = [];
  model.traverse(object => {
    if (object.isMesh && /(canvas.?top|canvas.?roof|troop.?roof|cab.?roof)/i.test(object.name)) {
      roofLikeMeshes.push(object.name);
    }
  });
  assert.deepEqual(roofLikeMeshes, []);

  setCalibrationLodVisibility(model, 'proxy');
  const visibleProxyNames = [];
  model.traverse(object => {
    if (object.isMesh && object.visible) visibleProxyNames.push(object.name);
  });
  assert.ok(visibleProxyNames.some(name => name.includes('ProxyBonnet')));
  assert.ok(visibleProxyNames.some(name => name.includes('ProxyTroopSide')));
  assert.ok(visibleProxyNames.some(name => name.includes('ProxyWindshieldFrame')));
  assert.ok(visibleProxyNames.some(name => name.includes('ProxyFrontRoller')));
  assert.ok(visibleProxyNames.some(name => name.includes('ProxyBellyRoller')));
});

test('Laffly S20TL bonnet is an outward-wound semantic station loft', () => {
  const model = createLafflyS20TLMesh();
  const bonnet = model.getObjectByName('S20TL_LongTaperedBonnet');
  assert.ok(bonnet?.isMesh);
  assert.equal(bonnet.userData.calibrationRole, 'semantic station loft');
  assert.equal(bonnet.geometry.userData.semanticStations.length, 4);
  assert.ok(signedVolume(bonnet.geometry) > 0.9);
});

test('Laffly S20TL records provenance, measured versus inferred datums, and viable LOD budgets', () => {
  const model = createLafflyS20TLMesh();
  const metadata = model.userData.modelMetadata;
  assert.equal(metadata.sourceRecords.length, 3);
  assert.match(metadata.sourceRecords[0].title, /Voiture de Dragons Portés/);
  assert.match(metadata.sourceRecords[0].url, /wikimedia/);
  assert.match(metadata.sourceRecords[1].url, /imagesdefense/);
  assert.deepEqual(metadata.calibrationDatums.drawingMeasured.axleZ, [1.55, -0.82, -1.78]);
  assert.match(metadata.calibrationDatums.photoInferred.panelThicknesses, /approximation/);

  const triangles = {};
  for (const tier of ['high', 'medium', 'core', 'proxy']) {
    setCalibrationLodVisibility(model, tier);
    triangles[tier] = visibleTriangleCount(model);
    assert.ok(triangles[tier] > 0, `${tier} must render geometry`);
  }
  assert.ok(triangles.high > triangles.medium);
  assert.ok(triangles.medium > triangles.core);
  assert.ok(triangles.proxy < triangles.core);
});
