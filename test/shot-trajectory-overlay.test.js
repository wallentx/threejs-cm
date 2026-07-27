import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShotTrajectoryOverlay } from '../src/world/debug/ShotTrajectoryOverlay.js';

function readPoint(line, index) {
  const attribute = line.geometry.getAttribute('position');
  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
}

test('shot trajectory overlay reuses bounded buffers for path, normal, and rebound vectors', () => {
  const scene = new THREE.Scene();
  const overlay = new ShotTrajectoryOverlay(scene);
  const record = {
    id: 4,
    impactId: 9,
    ricocheted: true,
    trajectoryPoints: [
      [0, 2, -20],
      [0.2, 1.8, -10],
      [1, 1.2, 0]
    ],
    impactPosition: [1, 1.2, 0],
    impactNormal: [1, 0, 0],
    postImpactVelocity: [100, 0, 300]
  };

  assert.equal(overlay.show(record), true);
  assert.equal(overlay.root.parent, scene);
  assert.equal(overlay.root.visible, true);
  assert.equal(overlay.selectedImpactId, 9);
  assert.equal(overlay.trajectory.geometry.drawRange.count, 3);
  assert.deepEqual(readPoint(overlay.trajectory, 0), [0, 2, -20]);
  assert.ok(new THREE.Vector3(...readPoint(overlay.trajectory, 2))
    .distanceTo(new THREE.Vector3(1, 1.2, 0)) < 1e-6);
  assert.equal(overlay.normal.geometry.drawRange.count, 2);
  assert.equal(overlay.outgoing.geometry.drawRange.count, 2);
  assert.ok(readPoint(overlay.normal, 1)[0] > record.impactPosition[0]);
  assert.ok(readPoint(overlay.outgoing, 1)[2] > record.impactPosition[2]);

  const trajectoryGeometry = overlay.trajectory.geometry;
  const trajectoryMaterial = overlay.trajectory.material;
  assert.equal(overlay.toggle(record), false);
  assert.equal(overlay.root.visible, false);
  assert.equal(overlay.toggle(record), true);
  assert.equal(overlay.trajectory.geometry, trajectoryGeometry);
  assert.equal(overlay.trajectory.material, trajectoryMaterial);

  let geometryDisposed = false;
  let materialDisposed = false;
  trajectoryGeometry.addEventListener('dispose', () => { geometryDisposed = true; });
  trajectoryMaterial.addEventListener('dispose', () => { materialDisposed = true; });
  overlay.dispose();
  assert.equal(overlay.root.parent, null);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
});

test('legacy impact records fall back to a two-point muzzle-to-impact path', () => {
  const overlay = new ShotTrajectoryOverlay(new THREE.Scene());
  assert.equal(overlay.show({
    id: 2,
    muzzlePosition: [2, 3, 4],
    impactPosition: [5, 6, 7],
    impactNormal: null,
    postImpactVelocity: null
  }), true);
  assert.equal(overlay.trajectory.geometry.drawRange.count, 2);
  assert.deepEqual(readPoint(overlay.trajectory, 0), [2, 3, 4]);
  assert.deepEqual(readPoint(overlay.trajectory, 1), [5, 6, 7]);
  assert.equal(overlay.normal.visible, false);
  assert.equal(overlay.outgoing.visible, false);
  overlay.dispose();
});
