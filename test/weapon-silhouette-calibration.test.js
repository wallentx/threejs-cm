import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { BERTHIER_M1892_M16_VISUAL_DATA } from '../src/content/france1940/render/BerthierM1892M16VisualData.js';
import { FM2429_VISUAL_DATA } from '../src/content/france1940/render/Fm2429VisualData.js';
import { KAR98K_VISUAL_DATA } from '../src/content/france1940/render/Kar98kVisualData.js';
import { MAS38_VISUAL_DATA } from '../src/content/france1940/render/Mas38VisualData.js';
import { MG34_VISUAL_DATA } from '../src/content/france1940/render/Mg34VisualData.js';
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

test('weapon silhouette jig locks the supplied Kar98k sheet component to its nominal rigid length', () => {
  const registration = KAR98K_VISUAL_DATA.silhouetteCalibration.side;
  assert.deepEqual(
    projectWeaponSidePointToSource({ x: 0, y: 0, z: 0 }, registration),
    { x: 53, y: 700 }
  );
  const muzzle = projectWeaponSidePointToSource({ x: 0, y: 0, z: 1.11 }, registration);
  assert.ok(Math.abs(muzzle.x - 1910) < 1e-9);
  assert.equal(muzzle.y, 700);
  assert.deepEqual(registration.componentSeedPixel, [700, 770]);
  assert.equal(registration.viewDirection, '-X');
});

test('weapon silhouette jig isolates the labeled FM 24/29 component from the French sheet', () => {
  const registration = FM2429_VISUAL_DATA.silhouetteCalibration.side;
  assert.deepEqual(
    projectWeaponSidePointToSource({ x: 0, y: 0, z: 0 }, registration),
    { x: 3425, y: 1972 }
  );
  const muzzle = projectWeaponSidePointToSource({ x: 0, y: 0, z: 1.08 }, registration);
  assert.ok(Math.abs(muzzle.x - 5701) < 1e-9);
  assert.equal(muzzle.y, 1972);
  assert.deepEqual(registration.componentSeedPixel, [4300, 2000]);
  assert.equal(registration.viewDirection, '-X');
});

test('weapon silhouette jig isolates the right-facing MAS-38 component at its rigid length', () => {
  const registration = MAS38_VISUAL_DATA.silhouetteCalibration.side;
  assert.deepEqual(
    projectWeaponSidePointToSource({ x: 0, y: 0, z: 0 }, registration),
    { x: 2323, y: 1910 }
  );
  const muzzle = projectWeaponSidePointToSource({ x: 0, y: 0, z: 0.63 }, registration);
  assert.ok(Math.abs(muzzle.x - 3580) < 1e-9);
  assert.equal(muzzle.y, 1910);
  assert.deepEqual(registration.componentSeedPixel, [2800, 1950]);
  assert.equal(registration.viewDirection, '-X');
});

test('weapon silhouette jig isolates the right-facing MG34 at its rigid length', () => {
  const registration = MG34_VISUAL_DATA.silhouetteCalibration.side;
  assert.deepEqual(
    projectWeaponSidePointToSource({ x: 0, y: 0, z: 0 }, registration),
    { x: 2066, y: 1996 }
  );
  const muzzle = projectWeaponSidePointToSource({ x: 0, y: 0, z: 1.22 }, registration);
  assert.ok(Math.abs(muzzle.x - 4198) < 1e-9);
  assert.equal(muzzle.y, 1996);
  assert.deepEqual(registration.componentSeedPixel, [2860, 1980]);
  assert.equal(registration.viewDirection, '-X');
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
