import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LastKnownContactMarkerSystem
} from '../src/world/LastKnownContactMarkerSystem.js';

const contact = ({
  targetUnitId = 'enemy-a',
  position = [12, 99, -8],
  channel = 'DIRECT',
  confidence = 0.8,
  uncertaintyM = 2
} = {}) => ({
  targetUnitId,
  position,
  channel,
  confidence,
  uncertaintyM
});

function markerChildren(scene) {
  const root = scene.getObjectByName('last-known-contact-markers');
  assert.ok(root);
  return {
    root,
    marker: root.children.find(child => child.visible)
  };
}

test('projects only hidden visual contacts at frozen terrain positions', () => {
  const scene = new THREE.Scene();
  const heights = [];
  const system = new LastKnownContactMarkerSystem(scene, {
    getGroundHeightAt(x, z) {
      heights.push([x, z]);
      return 3;
    }
  });

  assert.equal(system.sync({
    visibleUnitIds: ['visible-enemy'],
    contacts: [
      contact(),
      contact({ targetUnitId: 'voice', channel: 'VOICE' }),
      contact({ targetUnitId: 'radio', channel: 'RADIO' }),
      contact({ targetUnitId: 'sound', channel: 'SOUND' }),
      contact({ targetUnitId: 'visible-enemy' })
    ]
  }), 3);

  const diagnostics = system.getDiagnostics();
  assert.equal(diagnostics.visibleCount, 3);
  assert.equal(diagnostics.markerCount, 3);
  assert.deepEqual(heights, [[12, -8], [12, -8], [12, -8]]);
  const root = scene.getObjectByName('last-known-contact-markers');
  for (const marker of root.children) {
    assert.deepEqual(marker.position.toArray(), [12, 3.04, -8]);
    assert.equal(marker.children[0].material.color.getHex(), 0x80868b);
    assert.equal(marker.children[1].material.color.getHex(), 0x80868b);
  }
});

test('updates confidence and uncertainty on one pooled frozen marker', () => {
  const scene = new THREE.Scene();
  const system = new LastKnownContactMarkerSystem(scene, {
    getGroundHeightAt: () => 1
  });
  const hiddenUnit = {
    position: new THREE.Vector3(100, 0, 200),
    rotation: 2,
    damage: 'destroyed'
  };
  const first = contact({ position: [5, 0, 7], confidence: 0.9, uncertaintyM: 1 });
  system.sync({ visibleUnitIds: [], contacts: [{ ...first, hiddenUnit }] });
  const record = markerChildren(scene).marker;
  const glyph = record.getObjectByName('last-known-contact-glyph');
  const ring = record.getObjectByName('last-known-contact-uncertainty');
  const resources = {
    glyphGeometry: glyph.geometry,
    ringGeometry: ring.geometry,
    glyphMaterial: glyph.material,
    ringMaterial: ring.material
  };

  hiddenUnit.position.set(-40, 8, -70);
  hiddenUnit.rotation = -1;
  hiddenUnit.damage = null;
  system.sync({
    visibleUnitIds: [],
    contacts: [{
      ...first,
      confidence: 0.35,
      uncertaintyM: 6,
      hiddenUnit
    }]
  });

  assert.equal(markerChildren(scene).marker, record);
  assert.deepEqual(record.position.toArray(), [5, 1.04, 7]);
  assert.equal(glyph.material.opacity, 0.35);
  assert.equal(ring.material.opacity, 0.35);
  assert.deepEqual(ring.scale.toArray(), [6, 6, 6]);
  assert.equal(glyph.geometry, resources.glyphGeometry);
  assert.equal(ring.geometry, resources.ringGeometry);
  assert.equal(glyph.material, resources.glyphMaterial);
  assert.equal(ring.material, resources.ringMaterial);
  assert.deepEqual(
    Object.keys(system.getDiagnostics().markers[0].contact).sort(),
    ['channel', 'confidence', 'position', 'targetUnitId', 'uncertaintyM']
  );
});

test('hides invalid, expired, removed, or reacquired contacts and reuses pool', () => {
  const scene = new THREE.Scene();
  const system = new LastKnownContactMarkerSystem(scene, {
    getGroundHeightAt: () => 0
  });
  system.sync({ visibleUnitIds: [], contacts: [contact()] });
  const record = markerChildren(scene).marker;
  const initial = system.getDiagnostics();

  for (const projection of [
    { visibleUnitIds: ['enemy-a'], contacts: [contact()] },
    { visibleUnitIds: [], contacts: [contact({ confidence: 0 })] },
    { visibleUnitIds: [], contacts: [contact({ position: null })] },
    { visibleUnitIds: [], contacts: [contact({ position: [1, NaN, 2] })] },
    { visibleUnitIds: [], contacts: [] }
  ]) {
    system.sync(projection);
    assert.equal(record.visible, false);
    assert.equal(system.getDiagnostics().visibleCount, 0);
  }

  system.sync({
    visibleUnitIds: [],
    contacts: [contact({ position: [-2, 0, 4] })]
  });
  assert.equal(record.visible, true);
  assert.equal(markerChildren(scene).marker, record);
  assert.equal(system.getDiagnostics().geometryCount, initial.geometryCount);
  assert.equal(system.getDiagnostics().materialCount, initial.materialCount);
});

test('marker scene objects are occludable, shadowless, and raycast inert', () => {
  const scene = new THREE.Scene();
  const system = new LastKnownContactMarkerSystem(scene, {
    getGroundHeightAt: () => 0
  });
  system.sync({ visibleUnitIds: [], contacts: [contact({ position: [0, 0, 0] })] });
  const { root, marker } = markerChildren(scene);
  assert.ok(marker);

  root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 10, 0),
    new THREE.Vector3(0, -1, 0)
  );
  assert.deepEqual(raycaster.intersectObject(root, true), []);
  root.traverse(object => {
    assert.notEqual(object.userData?.unitRoot, true);
    assert.equal(Object.hasOwn(object.userData, 'unitId'), false);
    if (!object.isMesh) return;
    assert.equal(object.castShadow, false);
    assert.equal(object.receiveShadow, false);
    assert.equal(object.material.depthTest, true);
    assert.equal(object.material.depthWrite, false);
  });
});

test('dispose removes the root and releases every unique resource once', () => {
  const scene = new THREE.Scene();
  const system = new LastKnownContactMarkerSystem(scene, {
    getGroundHeightAt: () => 0
  });
  system.sync({
    visibleUnitIds: [],
    contacts: [contact(), contact({ targetUnitId: 'enemy-b' })]
  });

  const resources = new Set();
  scene.getObjectByName('last-known-contact-markers').traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  const disposeCounts = new Map();
  for (const resource of resources) {
    const dispose = resource.dispose.bind(resource);
    resource.dispose = () => {
      disposeCounts.set(resource, (disposeCounts.get(resource) ?? 0) + 1);
      dispose();
    };
  }

  system.dispose();
  system.dispose();
  assert.equal(scene.getObjectByName('last-known-contact-markers'), undefined);
  assert.equal(system.getDiagnostics().disposed, true);
  assert.equal(system.getDiagnostics().geometryCount, 0);
  assert.equal(system.getDiagnostics().materialCount, 0);
  assert.equal(disposeCounts.size, resources.size);
  for (const count of disposeCounts.values()) assert.equal(count, 1);
});
