import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { SpottingSystem } from '../src/game/SpottingSystem.js';

function createSpotting() {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const spotting = new SpottingSystem(null, {
    bocageObstacles: [],
    getHeightAt: () => -10
  }, { buildingSystem: buildings });
  return { buildings, spotting };
}

test('building LOS passes through windows, stops at wall sections, and follows breaches', () => {
  const { buildings, spotting } = createSpotting();
  const throughWindow = spotting.checkLOS(
    { x: -3.2, y: 0, z: 10 },
    { x: -3.2, y: 0.15, z: 0 },
    { fromEyeHeight: 1.45, toAimHeight: 1.3 }
  );
  assert.equal(throughWindow.clear, true);

  const throughWall = spotting.checkLOS(
    { x: -1.45, y: 0, z: 10 },
    { x: -1.45, y: 0.15, z: 0 },
    { fromEyeHeight: 1.45, toAimHeight: 1.3 }
  );
  assert.equal(throughWall.clear, false);
  assert.equal(throughWall.buildingId, 'house');
  assert.equal(throughWall.sectionId, 'ground-shell');

  buildings.applyProjectileDamage('house', {
    sectionId: 'ground-shell',
    colliderPartId: 'ground-left-inner',
    amount: 500,
    penetrationMm: 1000,
    createBreach: true
  });
  spotting.invalidateBuildingColliders();
  assert.equal(spotting.checkLOS(
    { x: -1.45, y: 0, z: 10 },
    { x: -1.45, y: 0.15, z: 0 },
    { fromEyeHeight: 1.45, toAimHeight: 1.3 }
  ).clear, true);
});

