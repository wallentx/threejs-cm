import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import { getVehicleVisualProfile } from '../src/world/vehicles/VehicleVisualProfiles.js';
import { assertModelHasNoBackfaceOnlyHoles } from './support/model-surface-audit.js';
import { auditClosedGeometry } from '../src/calibration/ModelSurfaceAudit.js';

test('closed-geometry audit distinguishes a sealed volume from an open surface', () => {
  const box = new THREE.BoxGeometry(2, 1, 3);
  const plane = new THREE.PlaneGeometry(2, 1);
  const sealed = auditClosedGeometry(box);
  const open = auditClosedGeometry(plane);
  assert.equal(sealed.closed, true);
  assert.equal(sealed.boundaryEdgeCount, 0);
  assert.equal(sealed.nonManifoldEdgeCount, 0);
  assert.equal(sealed.genus, 0);
  assert.equal(open.closed, false);
  assert.equal(open.boundaryEdgeCount, 4);
  assert.equal(open.genus, null);
  box.dispose();
  plane.dispose();
});

const CASES = Object.freeze([
  Object.freeze({ modelId: 'fr_somua' })
]);

for (const { modelId } of CASES) {
  test(`${modelId} has no multi-angle backface-only holes at any LOD`, () => {
    assertModelHasNoBackfaceOnlyHoles({
      name: modelId,
      createModel() {
        const model = UnitFactory.createTankMesh(
          modelId,
          FRANCE_1940_VEHICLE_MESH_FACTORIES
        );
        detachNestedProxyMeshes(model);
        return model;
      },
      dimensions: getVehicleVisualProfile(modelId).dimensionsMeters,
      tiers: ['high', 'medium', 'core', 'proxy'],
      setTier: setCalibrationLodVisibility,
      width: 384,
      height: 384,
      maximumDoubleOnlyRatio: 0
    });
  });
}
