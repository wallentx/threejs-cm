import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';

const obstacle = {
  minX: 4,
  maxX: 6,
  minZ: -1,
  maxZ: 1,
  height: 3,
  type: 'wall'
};

test('line-of-sight box test rejects nearby non-intersecting segments', () => {
  const spotting = new SpottingSystem({}, { bocageObstacles: [] });
  assert.equal(
    spotting.segmentIntersectsBox(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(10, 1, 0),
      obstacle
    ),
    true
  );
  assert.equal(
    spotting.segmentIntersectsBox(
      new THREE.Vector3(0, 1, 3),
      new THREE.Vector3(10, 1, 3),
      obstacle
    ),
    false
  );
});

test('hidden enemies require a shorter spotting distance', () => {
  const spotting = new SpottingSystem({}, { bocageObstacles: [] });
  const observer = {
    faction: 'french',
    morale: 'OK',
    experience: 'Regular',
    roster: [{ status: 'OK' }],
    position: new THREE.Vector3(0, 0, 0),
    mesh: { visible: true }
  };
  const enemy = {
    faction: 'german',
    isHiding: true,
    stance: 'PRONE',
    roster: [{ status: 'OK' }],
    position: new THREE.Vector3(120, 0, 0),
    mesh: { visible: true }
  };

  spotting.updateSpotting([observer, enemy]);
  assert.equal(enemy.mesh.visible, false);

  enemy.position.set(70, 0, 0);
  spotting.updateSpotting([observer, enemy]);
  assert.equal(enemy.mesh.visible, true);
});
