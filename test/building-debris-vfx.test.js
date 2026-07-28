import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import {
  BuildingSystem,
  localToWorldPoint
} from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import {
  PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
} from '../src/world/vfx/ProceduralBattlefieldVfxProvider.js';

function createBuildingSystem({
  descriptor = FR_HOUSE_12X9_2F,
  buildingId = 'debris-house',
  transform = {}
} = {}) {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(descriptor);
  buildings.addBuilding({
    id: buildingId,
    descriptorId: descriptor.id,
    transform
  });
  return buildings;
}

function createObservingProvider(onResolve) {
  return Object.freeze({
    id: 'observing-building-debris-vfx',
    kind: 'battlefield-vfx-provider',
    createCombatResources() {
      const resources =
        PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createCombatResources();
      return Object.freeze({
        ...resources,
        resolveBuildingDebrisStyle(materialLabel, severity) {
          onResolve?.(materialLabel, severity);
          return resources.resolveBuildingDebrisStyle(materialLabel, severity);
        }
      });
    },
    createVehicleDamageResources() {
      return PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createVehicleDamageResources();
    }
  });
}

function activeDebris(combat) {
  return combat.effects.filter(effect => effect.kind === 'buildingDebris');
}

test('building result projection is immutable, deduplicated, and insertion-order independent', () => {
  const transform = {
    position: [12, 2, -7],
    rotationY: Math.PI / 2
  };
  const damageResult = {
    result: {
      sectionId: 'upper-shell',
      applied: 12,
      breached: true,
      collapsed: false
    },
    results: [
      { sectionId: 'roof', applied: 8, breached: false, collapsed: false },
      { sectionId: 'ground-shell', applied: 4, breached: true, collapsed: false },
      { sectionId: 'foundation', applied: 0, breached: false, collapsed: false },
      { sectionId: 'ground-shell', applied: 2, breached: false, collapsed: false }
    ],
    collapsedSections: ['upper-floor-structure', 'ground-shell'],
    occupantConsequences: [{
      soldierKey: 'unit-a:soldier-1',
      unitId: 'unit-a',
      soldierId: 'soldier-1',
      damage: 35
    }]
  };
  const reversed = {
    ...structuredClone(damageResult),
    results: [...damageResult.results].reverse(),
    collapsedSections: [...damageResult.collapsedSections].reverse()
  };
  const orders = [];
  const buildingsA = createBuildingSystem({ transform });
  const combatA = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem: buildingsA,
    onOccupantConsequences: records => orders.push(`occupants:${records.length}`),
    onBuildingChanged: () => orders.push('building'),
    vfxProvider: createObservingProvider(
      (material, severity) => orders.push(`vfx:${material}:${severity}`)
    )
  });
  const buildingsB = createBuildingSystem({ transform });
  const combatB = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem: buildingsB,
    vfxProvider: PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
  });
  const impactPosition = new THREE.Vector3(1, 2, 3);

  const eventsA = combatA.processBuildingDamageResult(
    'debris-house',
    damageResult,
    'projectile',
    impactPosition
  );
  const eventsB = combatB.processBuildingDamageResult(
    'debris-house',
    reversed,
    'projectile',
    impactPosition
  );

  assert.deepEqual(eventsA, eventsB);
  assert.deepEqual(
    eventsA.map(event => [event.sectionId, event.severity]),
    [
      ['ground-shell', 'collapsed'],
      ['roof', 'damaged'],
      ['upper-floor-structure', 'collapsed'],
      ['upper-shell', 'breached']
    ]
  );
  assert.deepEqual(
    activeDebris(combatA).map(effect => effect.debrisEvent),
    eventsA
  );
  assert.deepEqual(
    activeDebris(combatB).map(effect => effect.debrisEvent),
    eventsB
  );
  assert.deepEqual(orders, [
    'occupants:1',
    'building',
    'vfx:masonry:collapsed',
    'vfx:timber-and-tile:damaged',
    'vfx:timber:collapsed',
    'vfx:masonry:breached'
  ]);
  assert.equal(Object.isFrozen(eventsA), true);
  assert.ok(eventsA.every(Object.isFrozen));
  assert.ok(eventsA.every(event => Object.isFrozen(event.worldPosition)));
  assert.ok(eventsA.every(event => Object.isFrozen(event.impactPosition)));
  assert.deepEqual(
    eventsA.find(event => event.sectionId === 'roof').worldPosition,
    localToWorldPoint([0, 6.45, 0], transform)
  );
  assert.deepEqual(
    eventsA.find(event => event.sectionId === 'roof').impactPosition,
    [1, 2, 3]
  );
  assert.equal(
    eventsA.find(event => event.sectionId === 'roof').materialLabel,
    'timber-and-tile'
  );
  assert.deepEqual(
    eventsA.map(event => event.eventKey),
    [
      'debris-house:ground-shell',
      'debris-house:roof',
      'debris-house:upper-floor-structure',
      'debris-house:upper-shell'
    ]
  );
  assert.ok(eventsA.flatMap(event => event.worldPosition).every(Number.isFinite));

  combatA.reset();
  const projectileEvents = combatA.processBuildingDamageResult(
    'debris-house',
    {
      result: {
        sectionId: 'upper-shell',
        applied: 5,
        breached: true,
        collapsed: false
      }
    },
    'shape-equivalence',
    impactPosition
  );
  combatA.reset();
  const blastEvents = combatA.processBuildingDamageResult(
    'debris-house',
    {
      results: [{
        sectionId: 'upper-shell',
        applied: 5,
        breached: true,
        collapsed: false
      }]
    },
    'shape-equivalence',
    impactPosition
  );
  assert.deepEqual(projectileEvents, blastEvents);

  combatA.dispose();
  combatB.dispose();
});

test('procedural debris styles route material families without combat-owned colors', () => {
  const resources =
    PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createCombatResources();
  const masonry = resources.resolveBuildingDebrisStyle('masonry', 'damaged');
  const stone = resources.resolveBuildingDebrisStyle('rough stone', 'damaged');
  const timber = resources.resolveBuildingDebrisStyle('timber', 'damaged');
  const roof = resources.resolveBuildingDebrisStyle(
    'timber-and-tile',
    'damaged'
  );
  const mixed = resources.resolveBuildingDebrisStyle(
    'timber-and-stone',
    'damaged'
  );
  const fallback = resources.resolveBuildingDebrisStyle(
    'unmapped-composite',
    'damaged'
  );

  assert.equal(masonry.id, 'masonry');
  assert.equal(stone.id, 'masonry');
  assert.equal(timber.id, 'timber');
  assert.equal(roof.id, 'roof-tile');
  assert.equal(mixed.id, 'mixed');
  assert.equal(fallback.id, 'fallback');
  assert.equal(new Set([
    masonry.color,
    timber.color,
    roof.color,
    mixed.color,
    fallback.color
  ]).size, 5);
  assert.ok(
    resources.resolveBuildingDebrisStyle('masonry', 'collapsed').initialScale
      > resources.resolveBuildingDebrisStyle('masonry', 'breached').initialScale
  );
  assert.ok(
    resources.resolveBuildingDebrisStyle('masonry', 'breached').initialScale
      > masonry.initialScale
  );
  const material = resources.createEffectMaterial('buildingDebris');
  assert.equal(material.isMaterial, true);
  assert.equal(
    resources.effectGeometries.buildingDebris.userData.vfxRole,
    'combat-building-debris'
  );
  material.dispose();
  assert.equal(resources.dispose(), true);
  assert.equal(resources.dispose(), false);
});

test('section centroids use the current transform and missing geometry has a named origin fallback', () => {
  const descriptor = structuredClone(FR_HOUSE_12X9_2F);
  descriptor.id = 'debris-fallback-house';
  descriptor.sections.find(section => section.id === 'roof').colliderParts = [];
  const transform = {
    position: [-15, 3.5, 22],
    rotationY: -Math.PI / 3
  };
  const buildings = createBuildingSystem({
    descriptor,
    buildingId: 'fallback-house',
    transform
  });
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem: buildings,
    vfxProvider: PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
  });

  const [event] = combat.processBuildingDamageResult(
    'fallback-house',
    {
      result: {
        sectionId: 'roof',
        applied: 10,
        breached: false,
        collapsed: false
      }
    },
    'blast',
    [4, 5, 6]
  );

  assert.equal(event.positionSource, 'building-origin-fallback');
  assert.deepEqual(event.worldPosition, transform.position);
  assert.deepEqual(event.impactPosition, [4, 5, 6]);
  assert.ok(event.worldPosition.every(Number.isFinite));
  combat.dispose();
});

test('building callbacks remain authoritative when debris presentation fails', () => {
  const buildings = createBuildingSystem();
  const buildingBefore = buildings.captureState();
  const callbackOrder = [];
  const failingProvider = createObservingProvider(() => {
    callbackOrder.push('presentation');
    throw new Error('test debris style failure');
  });
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem: buildings,
    onOccupantConsequences: records => {
      callbackOrder.push(`occupants:${records.length}`);
    },
    onBuildingChanged: () => callbackOrder.push('building'),
    vfxProvider: failingProvider
  });
  const result = {
    result: {
      sectionId: 'ground-shell',
      applied: 4,
      breached: false,
      collapsed: false
    },
    occupantConsequences: [{
      soldierKey: 'unit-b:soldier-2',
      unitId: 'unit-b',
      soldierId: 'soldier-2',
      damage: 10
    }]
  };

  const events = combat.processBuildingDamageResult(
    'debris-house',
    result,
    'projectile',
    new THREE.Vector3()
  );

  assert.equal(events.length, 1);
  assert.deepEqual(callbackOrder, ['occupants:1', 'building', 'presentation']);
  assert.equal(activeDebris(combat).length, 0);
  assert.deepEqual(buildings.captureState(), buildingBefore);
  combat.dispose();
});

test('repeated no-op damage to an already-collapsed section emits no second burst', () => {
  const buildings = createBuildingSystem();
  buildings.occupySlot('debris-house', {
    slotId: 'upper-front-left',
    soldierKey: 'unit-collapse:soldier-1',
    unitId: 'unit-collapse',
    soldierId: 'soldier-1'
  });
  const buildingChanges = [];
  const occupantBatches = [];
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem: buildings,
    onBuildingChanged: change => buildingChanges.push(change),
    onOccupantConsequences: consequences => {
      occupantBatches.push(consequences);
    },
    vfxProvider: PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
  });
  const damageInput = {
    sectionId: 'roof',
    colliderPartId: 'roof-main',
    amount: 1000,
    penetrationMm: 1000
  };

  const collapse = buildings.applyProjectileDamage(
    'debris-house',
    damageInput
  );
  assert.ok(collapse.result.applied > 0);
  assert.equal(collapse.result.collapsed, true);
  assert.deepEqual(collapse.collapsedSections, []);
  const firstEvents = combat.processBuildingDamageResult(
    'debris-house',
    collapse,
    'initial-collapse',
    new THREE.Vector3()
  );
  assert.deepEqual(
    firstEvents.map(event => [event.sectionId, event.severity]),
    [['roof', 'collapsed']]
  );
  assert.equal(activeDebris(combat).length, 1);
  assert.equal(occupantBatches.length, 1);
  assert.equal(occupantBatches[0].length, 1);
  const collapsedState = buildings.captureState();

  combat.reset();
  const noOp = buildings.applyProjectileDamage(
    'debris-house',
    damageInput
  );
  assert.deepEqual(noOp.result, {
    sectionId: 'roof',
    applied: 0,
    penetrated: false,
    collapsed: true
  });
  assert.deepEqual(noOp.collapsedSections, []);
  assert.deepEqual(buildings.captureState(), collapsedState);
  const secondEvents = combat.processBuildingDamageResult(
    'debris-house',
    noOp,
    'repeat-no-op',
    new THREE.Vector3()
  );

  assert.deepEqual(secondEvents, []);
  assert.equal(activeDebris(combat).length, 0);
  assert.equal(occupantBatches.length, 1);
  assert.equal(buildingChanges.length, 2);
  assert.deepEqual(
    buildingChanges.map(change => [
      change.reason,
      change.damageResult.result.applied,
      change.damageResult.result.collapsed
    ]),
    [
      ['initial-collapse', collapse.result.applied, true],
      ['repeat-no-op', 0, true]
    ]
  );
  combat.dispose();
});

test('debris pooling is capped, deterministic, transient, and disposed once', () => {
  const buildings = createBuildingSystem();
  const scene = new THREE.Scene();
  let randomCalls = 0;
  const combat = new CombatSystem(scene, {}, () => {
    randomCalls++;
    return 0.5;
  }, {
    buildingSystem: buildings,
    vfxProvider: PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
  });
  const buildingBefore = buildings.captureState();
  const collisionBefore = buildings.getCollisionSnapshot('debris-house');
  const combatBefore = combat.captureState();
  const result = {
    result: {
      sectionId: 'ground-shell',
      applied: 1,
      breached: false,
      collapsed: false
    }
  };
  const resultBefore = structuredClone(result);
  const cap = combat.effectCaps.buildingDebris;

  for (let index = 0; index < cap + 2; index++) {
    combat.processBuildingDamageResult(
      'debris-house',
      result,
      `event-${index}`,
      new THREE.Vector3(index, 0, 0)
    );
  }

  const pool = combat.effectPools.buildingDebris;
  assert.equal(pool.length, cap);
  assert.equal(activeDebris(combat).length, cap);
  assert.deepEqual(
    activeDebris(combat).map(effect => effect.debrisEvent.reason),
    Array.from({ length: cap }, (_, index) => `event-${index + 2}`)
  );
  assert.ok(pool.every(
    effect => effect.mesh.geometry === combat.effectGeometries.buildingDebris
  ));
  assert.equal(new Set(pool.map(effect => effect.material)).size, cap);
  assert.deepEqual(buildings.captureState(), buildingBefore);
  assert.deepEqual(
    buildings.getCollisionSnapshot('debris-house'),
    collisionBefore
  );
  assert.deepEqual(combat.captureState(), combatBefore);
  assert.deepEqual(result, resultBefore);
  assert.equal(randomCalls, 0);

  const effect = activeDebris(combat)[0];
  const opacityBefore = effect.material.opacity;
  const scaleBefore = effect.mesh.scale.x;
  combat.update(effect.maxLife / 2);
  assert.ok(effect.material.opacity < opacityBefore);
  assert.ok(effect.mesh.scale.x > scaleBefore);
  assert.deepEqual(buildings.captureState(), buildingBefore);
  assert.deepEqual(combat.captureState(), combatBefore);
  assert.equal(randomCalls, 0);

  combat.restoreState(combatBefore);
  assert.equal(activeDebris(combat).length, 0);
  assert.ok(pool.every(candidate => !candidate.active));
  assert.ok(pool.every(candidate => candidate.mesh.parent === null));
  assert.deepEqual(combat.captureState(), combatBefore);
  assert.deepEqual(buildings.captureState(), buildingBefore);

  combat.processBuildingDamageResult(
    'debris-house',
    result,
    'replayed-damage',
    new THREE.Vector3()
  );
  assert.equal(activeDebris(combat).length, 1);
  const materialDisposals = new Map(pool.map(candidate => [candidate, 0]));
  for (const candidate of pool) {
    candidate.material.addEventListener('dispose', () => {
      materialDisposals.set(candidate, materialDisposals.get(candidate) + 1);
    });
  }
  let geometryDisposals = 0;
  combat.effectGeometries.buildingDebris.addEventListener(
    'dispose',
    () => geometryDisposals++
  );

  assert.equal(combat.dispose(), true);
  assert.equal(combat.dispose(), false);
  assert.ok([...materialDisposals.values()].every(count => count === 1));
  assert.equal(geometryDisposals, 1);
  assert.equal(activeDebris(combat).length, 0);
  assert.equal(randomCalls, 0);
});
