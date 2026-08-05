import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  createFrance1940VisualFactories,
  FRANCE_1940_RUNTIME_ASSET_PACK
} from '../src/content/france1940/render/index.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { TerrainBuilder } from '../src/world/TerrainBuilder.js';

const MATERIAL_ROLES = Object.freeze([
  'ground',
  'riverBank',
  'water',
  'bridgeRoad',
  'masonry',
  'fenceCard',
  'foliageTrunk',
  'foliageLeaves',
  'foliageLeavesDark'
]);

function replacementSurfaceSet(implementationId) {
  const disposeCounts = Object.fromEntries(MATERIAL_ROLES.map(role => [role, 0]));
  const materials = Object.freeze(Object.fromEntries(
    MATERIAL_ROLES.map((role, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(index / MATERIAL_ROLES.length, 0.5, 0.5)
      });
      material.userData.replacementRole = role;
      material.addEventListener('dispose', () => { disposeCounts[role]++; });
      return [role, material];
    })
  ));
  let disposed = false;
  return Object.freeze({
    kind: 'terrain-surface-set',
    materials,
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const material of Object.values(materials)) material.dispose();
      return true;
    },
    implementationId,
    getDisposeCounts() {
      return { ...disposeCounts };
    }
  });
}

test('TerrainBuilder requires an injected family-neutral surface provider', async () => {
  assert.throws(
    () => new TerrainBuilder(new THREE.Scene(), {
      mapDescriptor: STONNE_1940_MAP
    }),
    /requires an injected terrain surface provider/
  );

  const source = await readFile(
    new URL('../src/world/TerrainBuilder.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /content\/france1940|procedural-terrain-surfaces/);
  assert.doesNotMatch(source, /#aaa39a|#28723b|StoneMasonryBump|CanvasTexture/);
  assert.match(source, /terrainSurfaceProvider\.create/);
});

test('replacement terrain surface provider reaches live ground, riverbank, river, bridge, walls, and foliage', () => {
  const implementationId = 'test-terrain-surfaces-v1';
  let createCount = 0;
  const replacementProvider = Object.freeze({
    id: implementationId,
    kind: 'terrain-surface-provider',
    create() {
      createCount++;
      return replacementSurfaceSet(implementationId);
    }
  });
  const replacementManifest = defineAssetManifest({
    id: 'france1940-test-terrain-assets',
    familyId: 'france-1940',
    replaces: [FRANCE_1940_ASSET_MANIFEST.id],
    assets: {
      [FRANCE_1940_ASSET_IDS.terrainSurfaceProvider]: {
        id: FRANCE_1940_ASSET_IDS.terrainSurfaceProvider,
        kind: 'terrain-surface-provider',
        source: {
          type: 'procedural',
          generatorId: implementationId
        }
      }
    }
  });
  const replacementPack = createRuntimeAssetPack(replacementManifest, {
    [FRANCE_1940_ASSET_IDS.terrainSurfaceProvider]: replacementProvider
  });
  const assetResolver = createAssetResolver([
    FRANCE_1940_RUNTIME_ASSET_PACK,
    replacementPack
  ]);
  const visualFactories = createFrance1940VisualFactories({ assetResolver });
  const scene = new THREE.Scene();
  const mapDescriptor = {
    ...STONNE_1940_MAP,
    structures: []
  };
  const terrain = new TerrainBuilder(scene, {
    mapDescriptor,
    terrainSurfaceProvider: visualFactories.terrainSurfaceProvider
  });
  terrain.buildScenarioMap();

  assert.equal(createCount, 1);
  assert.equal(terrain.terrainMesh.material.userData.replacementRole, 'ground');
  assert.equal(
    scene.getObjectByName('RiverBankNorth').material.userData.replacementRole,
    'riverBank'
  );
  assert.equal(
    scene.getObjectByName('RiverWater').material.userData.replacementRole,
    'water'
  );
  assert.equal(
    scene.getObjectByName('BridgeDeck').material.userData.replacementRole,
    'bridgeRoad'
  );
  assert.equal(
    terrain.stoneWallSegments[0].material.userData.replacementRole,
    'masonry'
  );
  assert.equal(
    terrain.fenceCardRuns[0].material.userData.replacementRole,
    'fenceCard'
  );
  assert.equal(
    scene.getObjectByName('MatureTreeTrunks').material.userData.replacementRole,
    'foliageTrunk'
  );
  assert.equal(
    scene.getObjectByName('MatureTreeCrownsPrimary').material.userData.replacementRole,
    'foliageLeaves'
  );
  assert.deepEqual(terrain.terrainMesh.userData.assetBindings.terrainSurface, {
    logicalId: FRANCE_1940_ASSET_IDS.terrainSurfaceProvider,
    sourcePackId: replacementManifest.id,
    implementationId
  });
  assert.equal(terrain.getSurfaceAssets(), terrain.getSurfaceAssets());
  const surfaceSet = terrain.getSurfaceAssets();
  assert.equal(surfaceSet.dispose(), true);
  assert.deepEqual(
    surfaceSet.getDisposeCounts(),
    Object.fromEntries(MATERIAL_ROLES.map(role => [role, 1]))
  );
  assert.equal(surfaceSet.dispose(), false);
  assert.deepEqual(
    surfaceSet.getDisposeCounts(),
    Object.fromEntries(MATERIAL_ROLES.map(role => [role, 1]))
  );
});

test('terrain asset binding rejects a mismatched generator and incomplete surface set', () => {
  const logicalId = FRANCE_1940_ASSET_IDS.terrainSurfaceProvider;
  const createResolver = (packId, generatorId, provider) => {
    const manifest = defineAssetManifest({
      id: packId,
      familyId: 'france-1940',
      replaces: [FRANCE_1940_ASSET_MANIFEST.id],
      assets: {
        [logicalId]: {
          id: logicalId,
          kind: 'terrain-surface-provider',
          source: {
            type: 'procedural',
            generatorId
          }
        }
      }
    });
    return createAssetResolver([
      FRANCE_1940_RUNTIME_ASSET_PACK,
      createRuntimeAssetPack(manifest, { [logicalId]: provider })
    ]);
  };

  assert.throws(
    () => createFrance1940VisualFactories({
      assetResolver: createResolver(
        'france1940-test-terrain-generator-mismatch',
        'expected-terrain-generator',
        Object.freeze({
          id: 'wrong-terrain-generator',
          kind: 'terrain-surface-provider',
          create() {
            return replacementSurfaceSet('wrong-terrain-generator');
          }
        })
      )
    }),
    /expected generator expected-terrain-generator/
  );

  const incompleteId = 'test-incomplete-terrain-provider';
  const visualFactories = createFrance1940VisualFactories({
    assetResolver: createResolver(
      'france1940-test-incomplete-terrain',
      incompleteId,
      Object.freeze({
        id: incompleteId,
        kind: 'terrain-surface-provider',
        create() {
          return Object.freeze({
            kind: 'terrain-surface-set',
            materials: Object.freeze({
              ground: new THREE.MeshStandardMaterial()
            }),
            dispose() {}
          });
        }
      })
    )
  });
  const terrain = new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP,
    terrainSurfaceProvider: visualFactories.terrainSurfaceProvider
  });
  assert.throws(
    () => terrain.getSurfaceAssets(),
    /requires terrain material water/
  );

  const missingRiverBankProvider = Object.freeze({
    id: 'test-missing-riverbank-provider',
    kind: 'terrain-surface-provider',
    create() {
      const materials = Object.freeze(Object.fromEntries(
        MATERIAL_ROLES
          .filter(role => role !== 'riverBank')
          .map(role => [role, new THREE.MeshStandardMaterial()])
      ));
      return Object.freeze({
        kind: 'terrain-surface-set',
        materials,
        dispose() {}
      });
    }
  });
  const terrainWithMissingRiverBank = new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP,
    terrainSurfaceProvider: missingRiverBankProvider
  });
  assert.throws(
    () => terrainWithMissingRiverBank.getSurfaceAssets(),
    /requires material riverBank/
  );
});
