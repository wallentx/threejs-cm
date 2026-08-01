import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createSelectionGroundHeightResolver,
  UnitHoverPreview
} from '../src/world/UnitHoverPreview.js';

const GROUND_OFFSET_METERS = 0.035;

function assertNear(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`
  );
}

test('unit hover preview ground-projects every living infantryman and never raycasts', () => {
  const scene = new THREE.Scene();
  const preview = new UnitHoverPreview(scene, {
    getGroundHeightAt: (x, z) => x * 0.1 + z * 0.05
  });
  const agents = [
    { position: new THREE.Vector3(1, 2, 3) },
    { position: new THREE.Vector3(4, 5, 6) },
    { position: new THREE.Vector3(7, 8, 9) }
  ];
  const unit = {
    type: 'infantry_squad',
    mesh: { visible: true },
    soldierAI: { getLivingAgents: () => agents }
  };

  preview.setHoveredUnit(unit);
  assert.equal(preview.update(), 3);
  assert.equal(preview.rings.filter(ring => ring.visible).length, 3);
  assertNear(preview.rings[1].position.y, 0.4 + 0.3 + GROUND_OFFSET_METERS);
  assert.notEqual(preview.rings[1].quaternion.angleTo(new THREE.Quaternion()), 0);
  const ringNormal = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(preview.rings[1].quaternion);
  assert.ok(ringNormal.y < 1, 'ring should conform to the ground normal');
  assert.equal(preview.material.depthTest, true);
  assert.equal(preview.material.depthWrite, false);
  const intersections = [];
  preview.rings[0].raycast({}, intersections);
  assert.deepEqual(intersections, []);

  preview.setHoveredUnit(null);
  assert.equal(preview.group.visible, false);
  assert.equal(preview.rings.some(ring => ring.visible), false);
  preview.dispose();
  assert.equal(scene.children.includes(preview.group), false);
});

test('switching differently sized units isolates render objects and updates synchronously', () => {
  const scene = new THREE.Scene();
  const preview = new UnitHoverPreview(scene);
  const firstUnit = {
    id: 'large-squad',
    type: 'infantry_squad',
    mesh: { visible: true },
    soldierAI: {
      getLivingAgents: () => [
        { position: new THREE.Vector3(0, 0, 0) },
        { position: new THREE.Vector3(1, 0, 0) },
        { position: new THREE.Vector3(2, 0, 0) }
      ]
    }
  };
  const secondUnit = {
    id: 'small-squad',
    type: 'infantry_squad',
    mesh: { visible: true },
    soldierAI: {
      getLivingAgents: () => [
        { position: new THREE.Vector3(10, 0, 10) }
      ]
    }
  };

  preview.setHoveredUnit(firstUnit);
  assert.equal(preview.update(), 3);
  const firstUnitRings = preview.rings.filter(ring => ring.visible);
  preview.setHoveredUnit(secondUnit);
  assert.equal(firstUnitRings.some(ring => ring.visible), false);
  assert.equal(preview.rings.filter(ring => ring.visible).length, 1);
  assert.equal(preview.update(), 1);
  const [secondUnitRing] = preview.rings.filter(ring => ring.visible);
  assert.notEqual(secondUnitRing, firstUnitRings[0]);
  assert.equal(secondUnitRing.userData.previewOwnerUnitId, 'small-squad');
  assert.deepEqual(secondUnitRing.position.toArray(), [10, 0.035, 10]);
  preview.dispose();
});

test('infantry hover includes declared unit equipment footprints', () => {
  const scene = new THREE.Scene();
  const unitMesh = new THREE.Group();
  unitMesh.position.set(8, 4, -3);
  const equipment = new THREE.Group();
  equipment.name = 'MortarEquipment';
  equipment.position.set(1.5, 0, -0.75);
  equipment.userData.selectionFootprint = {
    id: 'test-mortar',
    radiusMeters: 0.48
  };
  unitMesh.add(equipment);
  unitMesh.userData.selectionEquipment = [equipment];
  scene.add(unitMesh);

  const preview = new UnitHoverPreview(scene, {
    getGroundHeightAt: () => 2
  });
  preview.setHoveredUnit({
    type: 'infantry_squad',
    mesh: unitMesh,
    rotation: 0,
    soldierAI: {
      getLivingAgents: () => [
        { position: new THREE.Vector3(8, 4, -3) },
        { position: new THREE.Vector3(9, 4, -3) }
      ]
    }
  });

  assert.equal(preview.update(), 3);
  const equipmentRing = preview.rings.find(ring =>
    ring.userData.selectionEquipmentId === 'test-mortar'
  );
  assert.equal(equipmentRing.userData.selectionEquipmentId, 'test-mortar');
  assert.deepEqual(
    equipmentRing.position.toArray(),
    [9.5, 2 + GROUND_OFFSET_METERS, -3.75]
  );
  assert.ok(equipmentRing.scale.x < 1);
  preview.dispose();
});

test('vehicle hover preview follows its ground-projected oriented footprint', () => {
  const scene = new THREE.Scene();
  const preview = new UnitHoverPreview(scene, {
    getGroundHeightAt: () => 2
  });
  preview.setHoveredUnit({
    type: 'tank',
    position: new THREE.Vector3(10, 1, -4),
    rotation: Math.PI / 3,
    mesh: {
      visible: true,
      userData: {
        modelMetadata: {
          dimensionsMeters: { width: 3, length: 6, height: 2.5 }
        }
      }
    }
  });

  assert.equal(preview.update(), 1);
  const [vehicleRing] = preview.rings.filter(ring => ring.visible);
  assert.deepEqual(vehicleRing.position.toArray(), [10, 2.035, -4]);
  assert.equal(vehicleRing.rotation.y, Math.PI / 3);
  assert.ok(vehicleRing.scale.z > vehicleRing.scale.x);
  preview.dispose();
});

test('selection ground resolver follows rendered terrain, bridge decks, and occupied floors', () => {
  const resolver = createSelectionGroundHeightResolver({
    getHeightAt: x => 1 + x,
    getMovementHeightAt: x => x === 5 ? 7 : 1 + x,
    getRenderedTerrainHeightAt: x => 1.25 + x
  });

  assert.equal(resolver(0, 0), 1.25);
  assert.equal(resolver(5, 0), 7);
  assert.equal(resolver(3, 0, { supportHeight: 12 }), 12);
});
