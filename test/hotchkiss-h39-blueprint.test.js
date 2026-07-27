import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createHotchkissH39Mesh
} from '../src/world/vehicles/index.js';
import {
  H39_BLUEPRINT_CALIBRATION
} from '../src/world/vehicles/HotchkissH39.js';
import {
  HOTCHKISS_H39_VISUAL_DATA
} from '../src/content/france1940/vehicleData/HotchkissH39VisualData.js';

function assertDeeplyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child, seen);
  }
}

function signedVolume(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  let volume = 0;
  const count = indices?.count ?? positions.count;
  for (let offset = 0; offset < count; offset += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(
      positions,
      indices ? indices.getX(offset) : offset
    );
    const b = new THREE.Vector3().fromBufferAttribute(
      positions,
      indices ? indices.getX(offset + 1) : offset + 1
    );
    const c = new THREE.Vector3().fromBufferAttribute(
      positions,
      indices ? indices.getX(offset + 2) : offset + 2
    );
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  return volume;
}

test('H39 family visual data owns exact immutable renderer parameters and URL-only provenance', () => {
  assert.equal(HOTCHKISS_H39_VISUAL_DATA.modelId, 'fr_hotchkiss_h39');
  assert.equal(
    HOTCHKISS_H39_VISUAL_DATA.coordinateFrame,
    '+Y up, +Z forward, vehicle right -X, metres'
  );
  assert.deepEqual(HOTCHKISS_H39_VISUAL_DATA.dimensionsMeters, {
    length: 4.22,
    width: 1.85,
    height: 2.15
  });
  assert.equal(
    H39_BLUEPRINT_CALIBRATION,
    HOTCHKISS_H39_VISUAL_DATA.blueprint
  );
  assert.equal(
    HOTCHKISS_H39_VISUAL_DATA.blueprint.registrationStatus,
    'URL and provenance only; no accepted pixel-registered raster'
  );
  assert.equal(HOTCHKISS_H39_VISUAL_DATA.blueprint.imageUrl, undefined);
  assert.equal(HOTCHKISS_H39_VISUAL_DATA.blueprint.views, undefined);
  assert.equal(
    HOTCHKISS_H39_VISUAL_DATA.geometry.runningGear.model,
    'legacy-capsule-v1'
  );
  assert.match(
    HOTCHKISS_H39_VISUAL_DATA.geometry.runningGear.quality,
    /renderer approximation pending .* support-point migration/
  );
  assertDeeplyFrozen(HOTCHKISS_H39_VISUAL_DATA);
});

test('H39 exposes evidence-backed metre datums and defining landmarks', () => {
  assert.deepEqual(H39_BLUEPRINT_CALIBRATION.rigidEnvelopeMeters, {
    length: 4.22,
    width: 1.85,
    height: 2.15
  });
  assert.ok(H39_BLUEPRINT_CALIBRATION.sources.some(source => (
    source.publisher === 'United States War Department, 1942'
    && source.page === 37
  )));
  assert.ok(H39_BLUEPRINT_CALIBRATION.sources.some(source => (
    source.publisher === 'Musee des Blindes, Saumur'
  )));
  assert.equal(H39_BLUEPRINT_CALIBRATION.datums.roadWheelCentersZ.value.length, 6);
  assert.match(H39_BLUEPRINT_CALIBRATION.datums.roadWheelCentersZ.quality, /approximation/);
  assert.ok(H39_BLUEPRINT_CALIBRATION.outlineLandmarks.length >= 5);
});

test('H39 cast hull and APX-R turret lofts are outward-wound and inspectable', () => {
  const vehicle = createHotchkissH39Mesh();
  const hull = vehicle.getObjectByName('H39_CastHull');
  const turret = vehicle.getObjectByName('H39_APXR_Turret');
  assert.equal(hull.userData.profileStationCount, 11);
  assert.equal(turret.userData.profileRingCount, 5);
  assert.equal(hull.geometry.userData.outwardWindingAudited, true);
  assert.equal(turret.geometry.userData.outwardWindingAudited, true);
  assert.ok(signedVolume(hull.geometry) > 0);
  assert.ok(signedVolume(turret.geometry) > 0);
});

test('H39 preserves rigid envelope, ground contact, and bounded SA 38 projection', () => {
  const vehicle = createHotchkissH39Mesh();
  vehicle.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  vehicle.traverse(object => {
    if (!object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.lodBand === 'ui'
      || ['flexibleAttachment', 'weaponProjection'].includes(object.userData.envelopeRole)) return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  const measured = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(measured.z - 4.22) < 0.01);
  assert.ok(Math.abs(measured.x - 1.85) < 0.01);
  assert.ok(Math.abs(bounds.max.y - 2.15) < 0.01);
  assert.ok(bounds.min.y < 0.02);

  const muzzleWorld = vehicle.userData.muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(muzzleWorld.z < bounds.max.z);
  assert.ok(muzzleWorld.z > bounds.max.z - 0.2);
  assert.equal(vehicle.userData.barrel.userData.envelopeRole, 'weaponProjection');
});

test('H39 retains six wheels and three named horizontal bogies per side', () => {
  const vehicle = createHotchkissH39Mesh();
  for (const side of ['Right', 'Left']) {
    for (let index = 1; index <= 6; index++) {
      assert.ok(vehicle.getObjectByName(`${side}RoadWheel_${index}`));
    }
    for (let index = 1; index <= 3; index++) {
      assert.equal(
        vehicle.getObjectByName(`H39_${side}HorizontalBogie_${index}`)
          .userData.runningGearPart,
        'horizontal-spring-bogie'
      );
    }
  }
});
