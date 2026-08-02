import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { setVehicleComponentHealth } from '../src/game/VehicleSystems.js';

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

function makeVehicle(id, x, z) {
  return new Unit({
    id,
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(x, 0, z)
  });
}

function placeLivingObserverUpstairs(buildings) {
  const observer = new Unit({
    id: 'upstairs-observer',
    faction: 'french',
    type: 'infantry_squad',
    squadSize: 2,
    position: new THREE.Vector3(-3.2, 0, 3.65)
  });
  const [observerAgent] = observer.soldierAI.agents;
  observerAgent.position.set(-3.2, 3.25, 3.65);
  observerAgent.facing = 0;
  observerAgent.buildingLocation = {
    buildingId: 'house',
    phase: 'occupied',
    nodeId: 'upper-front-left',
    soldierKey: `${observer.id}:${observerAgent.id}`
  };
  observerAgent.syncRecord();
  const occupied = buildings.occupySlot('house', {
    slotId: 'upper-front-left',
    unitId: observer.id,
    soldierId: observerAgent.id,
    soldierKey: observerAgent.buildingLocation.soldierKey
  });
  assert.equal(occupied.accepted, true);
  return observer;
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

test('an upstairs observer retains clear direct sight of damaged and abandoned real vehicles', () => {
  const { buildings, spotting } = createSpotting();
  const observer = placeLivingObserverUpstairs(buildings);
  const damaged = makeVehicle('damaged-target', -3.5, 31);
  const abandoned = makeVehicle('abandoned-target', -2.3, 43);
  const occludedFiring = makeVehicle('occluded-firing-target', 40, 30);
  const visibleTargets = [damaged, abandoned];
  const units = [observer, ...visibleTargets, occludedFiring];

  spotting.advance(units, 4);
  for (const target of visibleTargets) {
    assert.equal(
      spotting.getObservation(observer.id, 0, target.id)?.visibleNow,
      true,
      `${target.id} must begin under unobstructed direct observation`
    );
  }
  assert.equal(
    spotting.checkLOS(
      observer.roster[0].worldPosition,
      occludedFiring.position,
      { fromEyeHeight: 0, toAimHeight: 1.6 }
    ).clear,
    false,
    'the off-window vehicle must have a genuine building occluder'
  );
  assert.equal(
    spotting.getObservation(observer.id, 0, occludedFiring.id)?.visibleNow ?? false,
    false,
    'the upper wall must genuinely occlude the off-window vehicle'
  );

  damaged.applyVehicleExplosiveHit({
    explosiveEffect: {
      cause: 'direct_he_detonation',
      modelVersion: 'test-direct-he-v1',
      protectionResult: 'exterior_only',
      interiorExposed: false,
      detonationPoint: damaged.position.toArray(),
      crewIntents: [],
      componentIntents: [],
      externalIntent: {
        componentId: 'tracks',
        damageAmount: 45,
        armorPart: 'track_left',
        dataQuality: 'gameplay test approximation'
      },
      dataQuality: 'gameplay test approximation'
    },
    penetrated: false,
    random: () => 0
  });
  damaged.applyArmorHit({
    penetrated: false,
    weapon: { kind: 'cannon_test' },
    random: () => 0
  });
  setVehicleComponentHealth(damaged.vehicleComponents, 'optics', 0);
  damaged.syncLegacyVehicleDamage();
  damaged.recordAuthoritativeShot();
  damaged.targetUnit = observer;
  damaged.updateVehicleCombat(3, {
    target: observer,
    combat: { fireWeapon: () => false }
  });
  assert.equal(damaged.vehicleWeapon.targetUnitId, observer.id);
  for (const crewman of abandoned.roster) {
    crewman.health = 0;
    crewman.status = 'KIA';
  }
  abandoned.applyVehicleExplosiveHit({
    explosiveEffect: {
      cause: 'mortar_detonation',
      modelVersion: 'test-mortar-v1',
      protectionResult: 'exterior_only',
      interiorExposed: false,
      detonationPoint: abandoned.position.toArray(),
      crewIntents: [],
      componentIntents: [],
      externalIntent: null,
      dataQuality: 'gameplay test approximation'
    },
    penetrated: false,
    random: () => 0
  });
  assert.equal(abandoned.vehicleDamageState.destroyed, true);
  observer.applySoldierDamage(1, 1000);
  occludedFiring.recordAuthoritativeShot();

  spotting.advance([...units].reverse(), 0.1);
  for (const target of visibleTargets) {
    assert.equal(
      spotting.getObservation(observer.id, 0, target.id)?.visibleNow,
      true,
      `${target.id} state must not revoke clear physical sight`
    );
  }
  assert.equal(
    spotting.getObservation(observer.id, 0, occludedFiring.id)?.visibleNow ?? false,
    false,
    'firing urgency must evaluate but never reveal an occluded target'
  );

  const saved = spotting.captureState();
  const { spotting: restored } = createSpotting();
  restored.restoreState(saved);
  assert.deepEqual(restored.captureState(), saved);
  spotting.advance(units, 0.1);
  restored.advance([...units].reverse(), 0.04);
  restored.advance(units, 0.06);
  assert.deepEqual(
    restored.captureState(),
    spotting.captureState(),
    'visibility continuation must ignore unit order and frame partition after restore'
  );
});
