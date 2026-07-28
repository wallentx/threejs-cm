import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { defineMapDescriptor } from '../src/maps/MapDescriptor.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { TerrainBuilder } from '../src/world/TerrainBuilder.js';

const APPROXIMATION =
  'gameplay approximation; not historical survey evidence';
const GROUND_SHELL_POLICY = {
  approximation: APPROXIMATION,
  sectionCollapse: [
    { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 }
  ]
};
const ROOF_POLICY = {
  approximation: APPROXIMATION,
  sectionCollapse: [
    { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
  ]
};

function createSystem() {
  const system = new BuildingSystem();
  system.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  return system;
}

function occupyGroundSlot(system, buildingId = 'farmhouse') {
  return system.occupySlot(buildingId, {
    nodeId: 'ground-front-left',
    slotId: 'ground-front-left',
    orderSequence: 1,
    unitId: 'unit-a',
    soldierId: 'soldier-a',
    soldierKey: 'unit-a:soldier-a'
  });
}

function mapWithPolicy(policy) {
  const map = structuredClone(STONNE_1940_MAP);
  map.structures[1].destructionThresholds = policy;
  return map;
}

function createVisualAdapter(descriptor) {
  return {
    descriptor,
    createVisual() {
      return new THREE.Group();
    },
    applyVisualState() {}
  };
}

test('placement threshold collapses at positive pre-collapse health without changing damage', () => {
  const system = createSystem();
  system.addBuilding({
    id: 'default',
    descriptorId: FR_FARMHOUSE_8X6_1F.id
  });
  system.addBuilding({
    id: 'policy',
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    destructionThresholds: ROOF_POLICY
  });

  const damage = {
    sectionDamages: [{ sectionId: 'roof', amount: 260 }]
  };
  const defaultResult = system.applyBlastDamage('default', damage);
  const policyResult = system.applyBlastDamage('policy', damage);
  const positiveRemainingHealth = 310 - policyResult.results[0].applied;

  assert.equal(defaultResult.results[0].applied, 260);
  assert.equal(policyResult.results[0].applied, 260);
  assert.ok(positiveRemainingHealth > 0);
  assert.equal(defaultResult.results[0].collapsed, false);
  assert.equal(system.getBuildingSnapshot('default').sections.roof.health, 50);
  assert.equal(policyResult.results[0].collapsed, true);
  assert.equal(system.getBuildingSnapshot('policy').sections.roof.collapsed, true);
});

test('map and building insertion reject malformed and unresolved policies', () => {
  const invalidMapPolicies = [
    [[], /must be a plain record/],
    [null, /must be a plain record/],
    [{ approximation: APPROXIMATION }, /sectionCollapse must be a non-empty array/],
    [
      { approximation: APPROXIMATION, sectionCollapse: {} },
      /sectionCollapse must be a non-empty array/
    ],
    [
      { approximation: '   ', sectionCollapse: ROOF_POLICY.sectionCollapse },
      /approximation must be a non-blank string/
    ],
    [
      {
        approximation: APPROXIMATION,
        sectionCollapse: [{ atOrBelowHealthFraction: 0.2 }]
      },
      /sectionId must be a non-empty string/
    ],
    [
      {
        approximation: APPROXIMATION,
        sectionCollapse: [{ sectionId: 7, atOrBelowHealthFraction: 0.2 }]
      },
      /sectionId must be a non-empty string/
    ],
    [
      {
        approximation: APPROXIMATION,
        sectionCollapse: [
          { sectionId: 'roof', atOrBelowHealthFraction: 0.2 },
          { sectionId: 'roof', atOrBelowHealthFraction: 0.3 }
        ]
      },
      /duplicate sectionId roof/
    ],
    ...[0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY].map(fraction => [
      {
        approximation: APPROXIMATION,
        sectionCollapse: [
          { sectionId: 'roof', atOrBelowHealthFraction: fraction }
        ]
      },
      /atOrBelowHealthFraction must be finite and within/
    ]),
    [
      {
        approximation: APPROXIMATION,
        sectionCollapse: [
          {
            sectionId: 'roof',
            atOrBelowHealthFraction: 0.2,
            misspelledThreshold: true
          }
        ]
      },
      /misspelledThreshold is not supported/
    ]
  ];

  for (const [policy, expected] of invalidMapPolicies) {
    assert.throws(() => defineMapDescriptor(mapWithPolicy(policy)), expected);
  }

  const system = createSystem();
  assert.throws(
    () => system.addBuilding({
      id: 'unknown-section',
      descriptorId: FR_FARMHOUSE_8X6_1F.id,
      destructionThresholds: {
        approximation: APPROXIMATION,
        sectionCollapse: [
          { sectionId: 'not-a-section', atOrBelowHealthFraction: 0.2 }
        ]
      }
    }),
    /references unknown section not-a-section/
  );
  assert.deepEqual(system.getBuildingIds(), []);
});

test('reversed authored entry order normalizes to byte-identical state and results', () => {
  const entries = [
    { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
    { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
  ];
  const run = sectionCollapse => {
    const system = createSystem();
    system.addBuilding({
      id: 'farmhouse',
      descriptorId: FR_FARMHOUSE_8X6_1F.id,
      destructionThresholds: {
        approximation: APPROXIMATION,
        sectionCollapse
      }
    });
    const before = system.captureState();
    const result = system.applyBlastDamage('farmhouse', {
      sectionDamages: [{ sectionId: 'roof', amount: 260 }]
    });
    return { before, result, after: system.captureState() };
  };

  const forward = run(entries);
  const reversed = run([...entries].reverse());
  assert.equal(JSON.stringify(forward.before), JSON.stringify(reversed.before));
  assert.equal(JSON.stringify(forward.result), JSON.stringify(reversed.result));
  assert.equal(JSON.stringify(forward.after), JSON.stringify(reversed.after));
  assert.deepEqual(
    forward.before.buildings[0].destructionThresholds.sectionCollapse
      .map(entry => entry.sectionId),
    ['ground-shell', 'roof']
  );
});

test('threshold collapse reuses portal, fire-port, occupant, rubble, collision, and event owners once', () => {
  const system = createSystem();
  system.addBuilding({
    id: 'farmhouse',
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    destructionThresholds: GROUND_SHELL_POLICY
  });
  assert.equal(occupyGroundSlot(system).accepted, true);
  const beforeCollision = system.getCollisionSnapshot('farmhouse');

  const result = system.applyBlastDamage('farmhouse', {
    sectionDamages: [{ sectionId: 'ground-shell', amount: 580 }]
  });
  const snapshot = system.getBuildingSnapshot('farmhouse');
  const collision = system.getCollisionSnapshot(
    'farmhouse',
    beforeCollision.version
  );

  assert.equal(result.results[0].applied, 580);
  assert.equal(640 - result.results[0].applied, 60);
  assert.equal(result.results[0].collapsed, true);
  assert.deepEqual(result.collapsedSections, ['roof']);
  assert.deepEqual(result.occupantConsequences, [{
    soldierKey: 'unit-a:soldier-a',
    unitId: 'unit-a',
    soldierId: 'soldier-a',
    fromSlotId: 'ground-front-left',
    toNodeId: 'farmhouse:exterior-rubble',
    phase: 'outside',
    damage: 70,
    ejected: true
  }]);
  assert.deepEqual(snapshot.invalidPortals, ['front-door']);
  assert.deepEqual(
    snapshot.invalidFirePorts,
    ['front-window-left', 'front-window-right']
  );
  assert.equal(snapshot.rubbleActive, true);
  assert.deepEqual(snapshot.occupancy, {});
  assert.equal(collision.version, beforeCollision.version + 1);
  assert.equal(collision.changes.length, 1);
  assert.ok(collision.changes[0].added.every(id => id.includes(':rubble:')));
  assert.ok(collision.changes[0].removed.some(id => id.includes(':ground-shell:')));
  assert.ok(collision.changes[0].removed.some(id => id.includes(':roof:')));
  assert.ok(collision.records.some(record => record.sectionId === 'rubble'));
  assert.ok(system.getFirePorts('farmhouse').every(port => port.enabled === false));

  assert.deepEqual(
    snapshot.events.map(event => event.type),
    [
      'section_damaged',
      'section_collapsed',
      'section_collapsed',
      'occupant_collapse_consequence'
    ]
  );
  assert.equal(
    snapshot.events.filter(event => (
      event.type === 'section_collapsed'
      && event.sectionId === 'ground-shell'
    )).length,
    1
  );
  assert.deepEqual(
    snapshot.events
      .filter(event => event.type === 'section_collapsed')
      .map(({ sectionId, reason }) => ({ sectionId, reason })),
    [
      { sectionId: 'ground-shell', reason: 'health_threshold_reached' },
      { sectionId: 'roof', reason: 'support_lost' }
    ]
  );

  const versions = {
    event: snapshot.eventVersion,
    collision: snapshot.collisionVersion
  };
  const repeat = system.applyBlastDamage('farmhouse', {
    sectionDamages: [{ sectionId: 'ground-shell', amount: 580 }]
  });
  const repeatedSnapshot = system.getBuildingSnapshot('farmhouse');
  assert.equal(repeat.results[0].applied, 0);
  assert.equal(repeat.occupantConsequences.length, 0);
  assert.equal(repeatedSnapshot.eventVersion, versions.event);
  assert.equal(repeatedSnapshot.collisionVersion, versions.collision);
});

test('capture restore and replay preserve copied policy and legacy zero-health behavior', () => {
  const authoredPolicy = structuredClone(GROUND_SHELL_POLICY);
  const system = createSystem();
  system.addBuilding({
    id: 'farmhouse',
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    destructionThresholds: authoredPolicy
  });
  authoredPolicy.sectionCollapse[0].atOrBelowHealthFraction = 0.99;
  assert.equal(
    system.getBuildingSnapshot('farmhouse')
      .destructionThresholds.sectionCollapse[0].atOrBelowHealthFraction,
    0.12
  );
  assert.equal(occupyGroundSlot(system).accepted, true);
  system.applyBlastDamage('farmhouse', {
    sectionDamages: [{ sectionId: 'ground-shell', amount: 500 }]
  });

  const capturedCopy = system.captureState();
  capturedCopy.buildings[0]
    .destructionThresholds.sectionCollapse[0].atOrBelowHealthFraction = 0.9;
  assert.equal(
    system.getBuildingSnapshot('farmhouse')
      .destructionThresholds.sectionCollapse[0].atOrBelowHealthFraction,
    0.12
  );

  const beforeCrossing = system.captureState();
  const cross = () => {
    const result = system.applyBlastDamage('farmhouse', {
      sectionDamages: [{ sectionId: 'ground-shell', amount: 70 }]
    });
    return {
      result,
      state: system.captureState(),
      collision: system.getCollisionSnapshot('farmhouse'),
      firePorts: system.getFirePorts('farmhouse')
    };
  };
  const first = cross();
  system.restoreState(beforeCrossing);
  const second = cross();
  assert.deepEqual(second, first);

  const legacySystem = createSystem();
  legacySystem.addBuilding({
    id: 'legacy',
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    destructionThresholds: GROUND_SHELL_POLICY
  });
  const legacySnapshot = legacySystem.captureState();
  delete legacySnapshot.buildings[0].destructionThresholds;
  legacySystem.restoreState(legacySnapshot);
  assert.equal(
    legacySystem.getBuildingSnapshot('legacy').destructionThresholds,
    null
  );
  const legacyDamage = legacySystem.applyBlastDamage('legacy', {
    sectionDamages: [{ sectionId: 'ground-shell', amount: 580 }]
  });
  assert.equal(legacyDamage.results[0].collapsed, false);
  assert.equal(
    legacySystem.getBuildingSnapshot('legacy').sections['ground-shell'].health,
    60
  );
});

test('real TerrainBuilder passes the exact frozen Stonne placement policy into state', () => {
  const scene = new THREE.Scene();
  const buildingSystem = new BuildingSystem();
  const adapters = {
    [FR_HOUSE_12X9_2F.id]: createVisualAdapter(FR_HOUSE_12X9_2F),
    [FR_FARMHOUSE_8X6_1F.id]:
      createVisualAdapter(FR_FARMHOUSE_8X6_1F)
  };
  const terrain = new TerrainBuilder(scene, {
    mapDescriptor: STONNE_1940_MAP,
    buildingSystem,
    structureAdapters: adapters,
    terrainSurfaceProvider: { create() {} }
  });
  terrain.buildStructures();

  const placement = STONNE_1940_MAP.structures.find(
    structure => structure.id === 'french_farmhouse_outbuilding'
  );
  const snapshot = buildingSystem.getBuildingSnapshot(placement.id);
  assert.equal(Object.isFrozen(placement.destructionThresholds), true);
  assert.equal(Object.isFrozen(placement.destructionThresholds.sectionCollapse), true);
  assert.ok(
    placement.destructionThresholds.sectionCollapse.every(Object.isFrozen)
  );
  assert.deepEqual(snapshot.destructionThresholds, placement.destructionThresholds);
  assert.notEqual(snapshot.destructionThresholds, placement.destructionThresholds);
  assert.equal(
    terrain.buildings.find(building => building.id === placement.id).descriptorId,
    FR_FARMHOUSE_8X6_1F.id
  );
});
