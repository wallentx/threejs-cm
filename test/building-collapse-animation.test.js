import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import {
  FRANCE_1940_BUILDING_DESCRIPTORS
} from '../src/maps/france/FranceBuildingDescriptors.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { BuildingSystem } from '../src/simulation/buildings/BuildingSystem.js';
import { GameApp } from '../src/app/GameApp.js';
import { TerrainBuilder } from './helpers/France1940TestTerrain.js';
import {
  createFrenchHouseVisual,
  applyFrenchHouseVisualState,
  disposeFrenchHouseVisual,
  BuildingCollapseAnimator,
  createFrenchHouseVisualAdapter
} from '../src/world/buildings/FrenchHouse.js';

function createHarness() {
  const buildingSystem = new BuildingSystem();
  buildingSystem.registerDescriptor(FR_HOUSE_12X9_2F);
  buildingSystem.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const visual = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildingSystem.getBuildingSnapshot('house'),
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });
  return { buildingSystem, visual };
}

const STRUCTURE_ADAPTERS = Object.freeze(Object.fromEntries(
  FRANCE_1940_BUILDING_DESCRIPTORS.map(descriptor => [
    descriptor.id,
    createFrenchHouseVisualAdapter(descriptor)
  ])
));

function createTerrainHarness() {
  const buildingSystem = new BuildingSystem();
  for (const descriptor of FRANCE_1940_BUILDING_DESCRIPTORS) {
    buildingSystem.registerDescriptor(descriptor);
  }
  const terrain = new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP,
    buildingSystem,
    structureAdapters: STRUCTURE_ADAPTERS
  });
  terrain.buildStructures();
  return { buildingSystem, terrain };
}

function runGameAppPresentationFrame(terrain, deltaTime) {
  const previousDocument = globalThis.document;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const body = { dataset: {} };
  globalThis.document = { body };
  globalThis.requestAnimationFrame = () => 0;
  const app = Object.create(GameApp.prototype);
  Object.assign(app, {
    terrain,
    renderer: {
      deviceLost: false,
      render() {},
      getDiagnostics: () => ({})
    },
    frameProfiler: { record() {}, snapshot: () => ({}) },
    timer: { update() {}, getDelta: () => deltaTime },
    wego: { getSimulationDelta: () => 0 },
    refreshVisibilityProjection() {},
    cameraManager: { update() {} },
    camera: new THREE.Vector3(),
    units: [],
    qualityTier: 'high',
    debugOverlay: { hasEnabledOverlays: () => false, getStats: () => ({}) },
    unitHoverPreview: { update() {} },
    vehicleDamageEffects: { update() {} },
    combat: { telemetry: { impacts: [] } },
    ui: { render() {}, renderDebugMetrics() {} },
    lastDebugMetricsUpdate: Number.POSITIVE_INFINITY,
    lastDiagnosticsUpdate: Number.POSITIVE_INFINITY
  });
  try {
    app.animate(1000);
    assert.notEqual(body.dataset.gameStatus, 'error', body.dataset.gameError);
  } finally {
    globalThis.document = previousDocument;
    if (previousRequestAnimationFrame === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    }
  }
}

test('BuildingCollapseAnimator animates partial section collapse deterministically across all LOD tiers', () => {
  const { buildingSystem, visual } = createHarness();
  try {
    const initialRuntime = buildingSystem.getBuildingSnapshot('house');
    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, initialRuntime, {
      collapseProjection: 'restore'
    });

    const animator = visual.userData.collapseAnimator;
    assert.ok(animator instanceof BuildingCollapseAnimator);

    // Apply blast damage to ground-floor-structure section to trigger partial collapse
    buildingSystem.applyBlastDamage('house', {
      sectionDamages: [{ sectionId: 'ground-floor-structure', amount: 1000 }]
    });
    const damagedRuntime = buildingSystem.getBuildingSnapshot('house');
    assert.equal(damagedRuntime.sections['ground-floor-structure'].collapsed, true);

    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, damagedRuntime);
    animator.advance(damagedRuntime, 0.4);

    const lodTiers = visual.userData.lodTiers;
    assert.equal(lodTiers.length, 4);

    // Verify mid-collapse progress = 0.5 across all LOD tiers
    const animState = animator.sectionRecords.get('ground-floor-structure');
    assert.ok(animState);
    assert.equal(animState.progress, 0.5);

    // Check that meshes in all LOD tiers have updated position Y (dropped) and rotation
    for (const tier of lodTiers) {
      const group = tier.sections.get('ground-floor-structure');
      assert.ok(group);
      assert.equal(group.visible, true, `section group remains visible mid-animation in LOD ${tier.lod}`);

      for (const child of group.children) {
        if (!child.isMesh) continue;
        const basePos = child.userData.baseTransform.position;
        assert.ok(child.position.y < basePos[1], `mesh Y dropped in LOD ${tier.lod}`);
        assert.notEqual(child.rotation.z, child.userData.baseTransform.rotation[2], `mesh rotated in LOD ${tier.lod}`);
      }
    }

    animator.advance(damagedRuntime, 0.4);
    assert.equal(animState.progress, 1.0);
    assert.equal(animState.completed, true);

    // At progress 1.0, group becomes hidden across all LOD tiers
    for (const tier of lodTiers) {
      const group = tier.sections.get('ground-floor-structure');
      assert.equal(group.visible, false, `section group becomes hidden at completion in LOD ${tier.lod}`);
    }
  } finally {
    disposeFrenchHouseVisual(visual);
  }
});

test('State rewind/rollback restores exact base transforms without residual offsets', () => {
  const { buildingSystem, visual } = createHarness();
  try {
    const intactSnapshot = buildingSystem.captureState();
    const initialRuntime = buildingSystem.getBuildingSnapshot('house');
    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, initialRuntime, {
      collapseProjection: 'restore'
    });

    const lodTiers = visual.userData.lodTiers;

    // Record initial base positions for high LOD
    const highGroup = lodTiers[0].sections.get('ground-shell');
    const initialPositions = highGroup.children.map(child => child.position.toArray());

    // Collapse ground shell
    buildingSystem.applyBlastDamage('house', {
      sectionDamages: [{ sectionId: 'ground-shell', amount: 1000 }]
    });
    const collapsedRuntime = buildingSystem.getBuildingSnapshot('house');
    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, collapsedRuntime);
    visual.userData.collapseAnimator.advance(collapsedRuntime, 0.5);

    // Verify transforms modified
    const midPositions = highGroup.children.map(child => child.position.toArray());
    assert.notDeepEqual(midPositions, initialPositions);

    // Rollback simulation state to intact
    buildingSystem.restoreState(intactSnapshot);
    const restoredRuntime = buildingSystem.getBuildingSnapshot('house');
    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, restoredRuntime, {
      collapseProjection: 'restore'
    });

    // Verify transforms restored byte-for-byte to initial positions
    const restoredPositions = highGroup.children.map(child => child.position.toArray());
    assert.deepEqual(restoredPositions, initialPositions);
  } finally {
    disposeFrenchHouseVisual(visual);
  }
});

test('BuildingCollapseAnimator reuses geometry, materials, and precomputed targets during playback', () => {
  const { buildingSystem, visual } = createHarness();
  try {
    buildingSystem.applyBlastDamage('house', {
      sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
    });
    const runtime = buildingSystem.getBuildingSnapshot('house');
    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, runtime);
    const animator = visual.userData.collapseAnimator;
    const targets = animator.sectionRecords.get('roof').targets;

    const initialGeometries = new Set();
    const initialMaterials = new Set();
    visual.traverse(obj => {
      if (obj.geometry) initialGeometries.add(obj.geometry);
      if (obj.material) initialMaterials.add(obj.material);
    });

    // Advance 60 frames of animation
    for (let frame = 0; frame < 60; frame++) {
      animator.advance(runtime, 0.016);
    }

    const currentGeometries = new Set();
    const currentMaterials = new Set();
    visual.traverse(obj => {
      if (obj.geometry) currentGeometries.add(obj.geometry);
      if (obj.material) currentMaterials.add(obj.material);
    });

    assert.equal(currentGeometries.size, initialGeometries.size);
    assert.equal(currentMaterials.size, initialMaterials.size);
    assert.equal(animator.sectionRecords.get('roof').targets, targets);
  } finally {
    disposeFrenchHouseVisual(visual);
  }
});

test('GameApp and TerrainBuilder production tick advances live roof collapse across every LOD', () => {
  const { buildingSystem, terrain } = createTerrainHarness();
  const buildingId = 'french_village_house';
  const building = terrain.buildings.find(candidate => candidate.id === buildingId);
  assert.ok(building);
  const visual = building.object;
  try {
    const animator = visual.userData.collapseAnimator;
    const roofBases = visual.userData.lodTiers.map(tier => tier.roof.position.y);
    buildingSystem.applyBlastDamage(buildingId, {
      sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
    });
    terrain.syncBuildingRuntime(buildingId);
    const roofRecord = animator.sectionRecords.get('roof');
    assert.equal(roofRecord.active, true);
    assert.equal(roofRecord.progress, 0);

    for (let frame = 0; frame < 4; frame++) {
      runGameAppPresentationFrame(terrain, 0.1);
    }
    assert.equal(roofRecord.progress, 0.5);
    visual.userData.lodTiers.forEach((tier, index) => {
      assert.equal(tier.roof.visible, true, `${tier.lod} roof stays visible mid-collapse`);
      assert.ok(tier.roof.position.y < roofBases[index], `${tier.lod} roof drops`);
      assert.notEqual(tier.roof.rotation.z, 0, `${tier.lod} roof tilts`);
    });

    for (let frame = 0; frame < 4; frame++) {
      runGameAppPresentationFrame(terrain, 0.1);
    }
    assert.equal(roofRecord.progress, 1);
    assert.equal(roofRecord.completed, true);
    assert.equal(animator.hasActiveTransitions(), false);
    for (const tier of visual.userData.lodTiers) {
      assert.equal(tier.sections.get('roof').visible, false);
      assert.equal(tier.roof.visible, false, `${tier.lod} roof hides at terminal pose`);
    }
  } finally {
    for (const record of terrain.buildings) disposeFrenchHouseVisual(record.object);
  }
});

test('restore projection terminates collapsed roofs and rewinds intact roofs exactly', () => {
  const { buildingSystem, visual } = createHarness();
  try {
    const intact = buildingSystem.captureState();
    const roofBases = visual.userData.lodTiers.map(tier => ({
      position: tier.roof.position.toArray(),
      rotation: tier.roof.rotation.toArray(),
      scale: tier.roof.scale.toArray()
    }));
    buildingSystem.applyBlastDamage('house', {
      sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
    });
    const collapsed = buildingSystem.getBuildingSnapshot('house');
    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, collapsed);
    const animator = visual.userData.collapseAnimator;
    animator.advance(collapsed, 0.2);
    const roofRecord = animator.sectionRecords.get('roof');
    assert.equal(roofRecord.progress, 0.25);

    applyFrenchHouseVisualState(visual, FR_HOUSE_12X9_2F, collapsed, {
      collapseProjection: 'restore'
    });
    assert.equal(roofRecord.progress, 1);
    assert.equal(roofRecord.active, false);
    for (const tier of visual.userData.lodTiers) assert.equal(tier.roof.visible, false);

    buildingSystem.restoreState(intact);
    applyFrenchHouseVisualState(
      visual,
      FR_HOUSE_12X9_2F,
      buildingSystem.getBuildingSnapshot('house'),
      { collapseProjection: 'restore' }
    );
    assert.equal(roofRecord.progress, 0);
    assert.equal(roofRecord.completed, false);
    visual.userData.lodTiers.forEach((tier, index) => {
      assert.equal(tier.roof.visible, true);
      assert.deepEqual(tier.roof.position.toArray(), roofBases[index].position);
      assert.deepEqual(tier.roof.rotation.toArray(), roofBases[index].rotation);
      assert.deepEqual(tier.roof.scale.toArray(), roofBases[index].scale);
    });
  } finally {
    disposeFrenchHouseVisual(visual);
  }
});
