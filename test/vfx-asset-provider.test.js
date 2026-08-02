import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {
  createAssetResolver,
  createRuntimeAssetPack,
  defineAssetManifest
} from '../src/assets/AssetManifest.js';
import {
  FRANCE_1940_ASSET_IDS,
  FRANCE_1940_ASSET_MANIFEST
} from '../src/content/france1940/assets/index.js';
import {
  createFrance1940VfxProvider,
  createFrance1940VisualFactories,
  FRANCE_1940_RUNTIME_ASSET_PACK,
  FRANCE_1940_VFX_PROVIDER
} from '../src/content/france1940/render/index.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { VehicleDamageEffects } from '../src/world/VehicleDamageEffects.js';
import {
  PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
} from '../src/world/vfx/ProceduralBattlefieldVfxProvider.js';

function createVehicle() {
  const mesh = new THREE.Group();
  mesh.userData.modelMetadata = {
    dimensionsMeters: { length: 5, width: 2.4, height: 2.2 }
  };
  return {
    id: 'vfx-test-vehicle',
    vehicleSpec: { id: 'TEST' },
    vehicleDamage: {
      hull: 'DAMAGED',
      engine: 'DESTROYED',
      tracks: 'OK',
      gun: 'OK',
      turret: 'OK'
    },
    currentLOD: 'high',
    mesh
  };
}

function replacementResolver(provider, generatorId = provider.id) {
  const manifest = defineAssetManifest({
    id: `france1940-test-vfx-${generatorId}`,
    familyId: 'france-1940',
    replaces: [FRANCE_1940_ASSET_MANIFEST.id],
    assets: {
      [FRANCE_1940_ASSET_IDS.battlefieldVfxProvider]: {
        id: FRANCE_1940_ASSET_IDS.battlefieldVfxProvider,
        kind: 'battlefield-vfx-provider',
        source: {
          type: 'procedural',
          generatorId
        },
        provenance: 'test replacement battlefield VFX'
      }
    }
  });
  return {
    manifest,
    resolver: createAssetResolver([
      FRANCE_1940_RUNTIME_ASSET_PACK,
      createRuntimeAssetPack(manifest, {
        [FRANCE_1940_ASSET_IDS.battlefieldVfxProvider]: provider
      })
    ])
  };
}

test('replacement VFX provider reaches pooled combat and vehicle-damage effects', () => {
  const implementationId = 'test-battlefield-vfx-v1';
  let combatCreates = 0;
  let vehicleCreates = 0;
  const replacementProvider = Object.freeze({
    id: implementationId,
    kind: 'battlefield-vfx-provider',
    createCombatResources() {
      combatCreates++;
      return PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createCombatResources();
    },
    createVehicleDamageResources() {
      vehicleCreates++;
      return PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createVehicleDamageResources();
    }
  });
  const { manifest, resolver } = replacementResolver(replacementProvider);
  const visualFactories = createFrance1940VisualFactories({
    assetResolver: resolver
  });
  const vfxProvider = visualFactories.vfxProvider;
  const expectedBinding = {
    logicalId: FRANCE_1940_ASSET_IDS.battlefieldVfxProvider,
    sourcePackId: manifest.id,
    implementationId
  };

  assert.deepEqual(vfxProvider.assetBinding, expectedBinding);
  const scene = new THREE.Scene();
  const combat = new CombatSystem(scene, {}, () => 0.5, { vfxProvider });
  combat.createExplosionEffect(new THREE.Vector3(1, 2, 3), 0.5);
  assert.equal(combatCreates, 1);
  assert.deepEqual(combat.vfxAssetBinding, expectedBinding);
  assert.deepEqual(combat.effects[0].mesh.userData.assetBinding, expectedBinding);
  assert.deepEqual(combat.effects[0].material.userData.assetBinding, expectedBinding);
  const debrisEvent = Object.freeze({
    eventKey: 'house-1:wall-a',
    buildingId: 'house-1',
    sectionId: 'wall-a',
    materialLabel: 'masonry',
    severity: 'breached',
    worldPosition: Object.freeze([4, 1, -2]),
    impactPosition: null,
    positionSource: 'section-collider-centroid',
    reason: 'replacement-test'
  });
  const debris = combat.createBuildingDebrisEffect(debrisEvent);
  assert.deepEqual(
    combat.effectGeometries.buildingDebris.userData.assetBinding,
    expectedBinding
  );
  assert.deepEqual(debris.mesh.userData.assetBinding, expectedBinding);
  assert.deepEqual(debris.material.userData.assetBinding, expectedBinding);
  assert.equal(debris.mesh.userData.buildingDebrisEvent, debrisEvent);
  assert.ok(combat.effectCaps.buildingDebris > 0);
  const projectileMesh = combat.vfxResources.createProjectileMesh({
    kind: 'rifle',
    caliberMm: 7.5
  });
  assert.deepEqual(projectileMesh.userData.assetBinding, expectedBinding);
  assert.deepEqual(projectileMesh.geometry.userData.assetBinding, expectedBinding);
  assert.deepEqual(projectileMesh.material.userData.assetBinding, expectedBinding);

  const unit = createVehicle();
  const damageEffects = new VehicleDamageEffects({ vfxProvider });
  damageEffects.update(1 / 30, [unit], []);
  const record = damageEffects.records.get(unit.id);
  assert.equal(vehicleCreates, 1);
  assert.deepEqual(record.root.userData.assetBinding, expectedBinding);
  assert.deepEqual(
    unit.mesh.userData.assetBindings.vehicleDamageVfx,
    expectedBinding
  );
  assert.deepEqual(
    record.smoke.children[0].material.userData.assetBinding,
    expectedBinding
  );

  combat.dispose();
  damageEffects.dispose();
  assert.equal(unit.mesh.userData.assetBindings.vehicleDamageVfx, undefined);
});

test('VFX resource sets dispose shared GPU resources exactly once', () => {
  const combatResources = FRANCE_1940_VFX_PROVIDER.createCombatResources();
  const vehicleResources = FRANCE_1940_VFX_PROVIDER.createVehicleDamageResources();
  let combatDisposals = 0;
  let debrisDisposals = 0;
  let vehicleDisposals = 0;
  combatResources.effectGeometries.impact.addEventListener(
    'dispose',
    () => combatDisposals++
  );
  combatResources.effectGeometries.buildingDebris.addEventListener(
    'dispose',
    () => debrisDisposals++
  );
  vehicleResources.geometries.smoke.addEventListener(
    'dispose',
    () => vehicleDisposals++
  );

  assert.equal(combatResources.dispose(), true);
  assert.equal(combatResources.dispose(), false);
  assert.equal(vehicleResources.dispose(), true);
  assert.equal(vehicleResources.dispose(), false);
  assert.equal(combatDisposals, 1);
  assert.equal(debrisDisposals, 1);
  assert.equal(vehicleDisposals, 1);
});

test('VFX asset binding rejects wrong generators and incomplete resource sets', () => {
  assert.throws(
    () => new CombatSystem(new THREE.Scene(), {}),
    /battlefield VFX provider/
  );
  assert.throws(
    () => new VehicleDamageEffects(),
    /battlefield VFX provider/
  );

  const wrongProvider = Object.freeze({
    ...PROCEDURAL_BATTLEFIELD_VFX_PROVIDER,
    id: 'wrong-vfx-generator'
  });
  const wrong = replacementResolver(wrongProvider, 'expected-vfx-generator');
  assert.throws(
    () => createFrance1940VfxProvider(wrong.resolver),
    /expected generator expected-vfx-generator, received wrong-vfx-generator/
  );

  const incompleteProvider = Object.freeze({
    id: 'incomplete-vfx-generator',
    kind: 'battlefield-vfx-provider',
    createCombatResources() {
      return { kind: 'combat-vfx-resources' };
    },
    createVehicleDamageResources() {
      return { kind: 'vehicle-damage-vfx-resources' };
    }
  });
  const incomplete = replacementResolver(incompleteProvider);
  const provider = createFrance1940VfxProvider(incomplete.resolver);
  assert.throws(
    () => provider.createCombatResources(),
    /require impact geometry/
  );
  assert.throws(
    () => provider.createVehicleDamageResources(),
    /require smoke geometry/
  );

  let missingDebrisResources = null;
  const missingDebrisProvider = Object.freeze({
    ...PROCEDURAL_BATTLEFIELD_VFX_PROVIDER,
    id: 'missing-building-debris-vfx',
    createCombatResources() {
      const resources =
        PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createCombatResources();
      missingDebrisResources = resources;
      const {
        buildingDebris: omittedBuildingDebris,
        ...remainingGeometries
      } = resources.effectGeometries;
      assert.ok(omittedBuildingDebris);
      return Object.freeze({
        ...resources,
        effectGeometries: Object.freeze(remainingGeometries)
      });
    }
  });
  const missingDebris = replacementResolver(missingDebrisProvider);
  const missingDebrisBinding = createFrance1940VfxProvider(
    missingDebris.resolver
  );
  assert.throws(
    () => missingDebrisBinding.createCombatResources(),
    /require buildingDebris geometry/
  );
  missingDebrisResources.dispose();

  let missingResolverResources = null;
  const missingResolverProvider = Object.freeze({
    ...PROCEDURAL_BATTLEFIELD_VFX_PROVIDER,
    id: 'missing-building-debris-resolver-vfx',
    createCombatResources() {
      const resources =
        PROCEDURAL_BATTLEFIELD_VFX_PROVIDER.createCombatResources();
      missingResolverResources = resources;
      return Object.freeze({
        ...resources,
        resolveBuildingDebrisStyle: null
      });
    }
  });
  const missingResolver = replacementResolver(missingResolverProvider);
  const missingResolverBinding = createFrance1940VfxProvider(
    missingResolver.resolver
  );
  assert.throws(
    () => missingResolverBinding.createCombatResources(),
    /require building debris material-style resolver/
  );
  missingResolverResources.dispose();
});

test('generic combat and vehicle-damage systems contain no France-family imports', async () => {
  const [combatSource, damageSource] = await Promise.all([
    readFile(new URL('../src/game/CombatSystem.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/VehicleDamageEffects.js', import.meta.url), 'utf8')
  ]);
  for (const source of [combatSource, damageSource]) {
    assert.doesNotMatch(source, /content\/france1940|FRANCE_1940/);
    assert.doesNotMatch(source, /ProceduralBattlefieldVfxProvider/);
  }
});
