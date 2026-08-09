import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { BERTHIER_M1892_M16_VISUAL_DATA } from '../src/content/france1940/render/BerthierM1892M16VisualData.js';
import { MAS36_VISUAL_DATA } from '../src/content/france1940/render/Mas36VisualData.js';
import {
  collectWeaponSideSilhouetteTriangles,
  compareWeaponSilhouetteMasks,
  isolateConnectedAlphaComponent,
  projectWeaponSidePointToSource
} from '../src/debug/WeaponSilhouetteCalibration.js';

test('weapon silhouette jig locks model metres to the source butt, muzzle, and bore axis', () => {
  const registration = MAS36_VISUAL_DATA.silhouetteCalibration.side;
  assert.deepEqual(projectWeaponSidePointToSource(
    { x: 0, y: 0, z: 0 },
    registration
  ), { x: 2814, y: 153 });
  const muzzle = projectWeaponSidePointToSource({ x: 0, y: 0, z: 1.02 }, registration);
  assert.ok(Math.abs(muzzle.x - 499) < 1e-9);
  assert.equal(muzzle.y, 153);
});

test('weapon silhouette jig registers a right-facing supplied drawing without mirroring model geometry', () => {
  const registration = BERTHIER_M1892_M16_VISUAL_DATA.silhouetteCalibration.side;
  assert.deepEqual(
    projectWeaponSidePointToSource({ x: 0, y: 0, z: 0 }, registration),
    { x: 8, y: 256 }
  );
  const muzzle = projectWeaponSidePointToSource({ x: 0, y: 0, z: 0.945 }, registration);
  assert.ok(Math.abs(muzzle.x - 1159) < 1e-9);
  assert.equal(muzzle.y, 256);
});

test('weapon silhouette jig projects visible detailed triangles and excludes proxy geometry', () => {
  const root = new THREE.Group();
  const detail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.2));
  detail.position.z = 0.2;
  detail.userData.lodBand = 'core';
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.1));
  proxy.userData.lodBand = 'proxy';
  root.add(detail, proxy);
  const result = collectWeaponSideSilhouetteTriangles(
    root,
    MAS36_VISUAL_DATA.silhouetteCalibration.side,
    { width: 800 }
  );
  assert.equal(result.triangles.length, 12);
  assert.equal(result.width, 800);
  assert.equal(result.height, 177);
});

test('weapon silhouette jig isolates the seeded connected SVG component', () => {
  const width = 7;
  const height = 5;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const mark = (x, y) => { rgba[(y * width + x) * 4 + 3] = 255; };
  mark(0, 0); // title
  mark(3, 1); // selected rifle
  mark(4, 1);
  mark(4, 2);
  mark(1, 4); // neighboring view
  mark(2, 4);
  assert.equal(isolateConnectedAlphaComponent(rgba, width, height, 3, 1), 3);
  assert.equal(rgba[(0 * width + 0) * 4 + 3], 0);
  assert.equal(rgba[(1 * width + 3) * 4 + 3], 255);
  assert.equal(rgba[(4 * width + 1) * 4 + 3], 0);
});

test('weapon silhouette jig reports overlap and directional silhouette error', () => {
  const source = new Uint8ClampedArray(4 * 4 * 4);
  const model = new Uint8ClampedArray(4 * 4 * 4);
  for (const index of [1, 2, 3]) source[index * 4 + 3] = 255;
  for (const index of [2, 3, 4]) model[index * 4 + 3] = 255;
  const result = compareWeaponSilhouetteMasks(source, model, 4, 4);
  assert.equal(result.sourcePixels, 3);
  assert.equal(result.modelPixels, 3);
  assert.equal(result.overlapPixels, 2);
  assert.equal(result.sourceOnlyPixels, 1);
  assert.equal(result.modelOnlyPixels, 1);
  assert.equal(result.iou, 0.5);
});
