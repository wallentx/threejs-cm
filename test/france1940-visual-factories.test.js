import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFrance1940VisualFactories,
  FRANCE_1940_ASSET_RESOLVER,
  FRANCE_1940_FACTION_PRESENTATION,
  FRANCE_1940_INFANTRY_MESH_FACTORIES,
  FRANCE_1940_RUNTIME_ASSET_PACK,
  FRANCE_1940_STRUCTURE_MESH_FACTORIES,
  FRANCE_1940_TERRAIN_SURFACE_PROVIDER,
  FRANCE_1940_VEHICLE_MESH_FACTORIES,
  FRANCE_1940_VISUAL_FACTORIES
} from '../src/content/france1940/render/index.js';
import {
  FRANCE_1940_ASSET_IDS,
  FRANCE_1940_ASSET_MANIFEST
} from '../src/content/france1940/assets/index.js';
import { FRANCE_1940_VEHICLES } from '../src/content/france1940/vehicles.js';
import { FRANCE_1940_FACTIONS } from '../src/content/france1940/factions.js';
import { FRANCE_1940_PRESENTATION } from '../src/content/france1940/presentation.js';
import {
  createAssetResolver,
  createRuntimeAssetPack,
  defineAssetManifest
} from '../src/assets/AssetManifest.js';
import {
  PROCEDURAL_VEHICLE_SURFACE_PACK
} from '../src/world/vehicles/VehicleMaterialLibrary.js';

test('France 1940 owns one complete frozen unit visual-factory registration', () => {
  const expectedModelIds = [...new Set(
    Object.values(FRANCE_1940_VEHICLES).map(vehicle => vehicle.modelId)
  )].sort();

  assert.equal(FRANCE_1940_VISUAL_FACTORIES.familyId, 'france-1940');
  assert.equal(
    FRANCE_1940_VISUAL_FACTORIES.vehicleMeshes,
    FRANCE_1940_VEHICLE_MESH_FACTORIES
  );
  assert.equal(
    FRANCE_1940_VISUAL_FACTORIES.infantryMeshes,
    FRANCE_1940_INFANTRY_MESH_FACTORIES
  );
  assert.equal(
    FRANCE_1940_VISUAL_FACTORIES.structureMeshes,
    FRANCE_1940_STRUCTURE_MESH_FACTORIES
  );
  assert.equal(
    FRANCE_1940_VISUAL_FACTORIES.factionPresentation,
    FRANCE_1940_FACTION_PRESENTATION
  );
  assert.equal(
    FRANCE_1940_VISUAL_FACTORIES.terrainSurfaceProvider,
    FRANCE_1940_TERRAIN_SURFACE_PROVIDER
  );
  assert.equal(FRANCE_1940_TERRAIN_SURFACE_PROVIDER.kind, 'terrain-surface-provider');
  assert.equal(typeof FRANCE_1940_TERRAIN_SURFACE_PROVIDER.create, 'function');
  for (const [factionId, faction] of Object.entries(FRANCE_1940_FACTIONS)) {
    assert.equal(
      FRANCE_1940_FACTION_PRESENTATION[factionId],
      FRANCE_1940_PRESENTATION[faction.presentationId]
    );
  }
  assert.deepEqual(
    Object.keys(FRANCE_1940_INFANTRY_MESH_FACTORIES).sort(),
    ['french_1940_chasseur', 'german_1940_grenadier']
  );
  assert.deepEqual(
    Object.keys(FRANCE_1940_STRUCTURE_MESH_FACTORIES),
    ['GERMAN_MG34_BUNKER']
  );
  assert.ok(
    Object.values(FRANCE_1940_INFANTRY_MESH_FACTORIES)
      .every(factory => typeof factory === 'function')
  );
  assert.ok(
    Object.values(FRANCE_1940_STRUCTURE_MESH_FACTORIES)
      .every(factory => typeof factory === 'function')
  );
  assert.deepEqual(Object.keys(FRANCE_1940_VEHICLE_MESH_FACTORIES).sort(), expectedModelIds);
  assert.ok(
    Object.values(FRANCE_1940_VEHICLE_MESH_FACTORIES)
      .every(factory => typeof factory === 'function')
  );
  assert.equal(Object.isFrozen(FRANCE_1940_VISUAL_FACTORIES), true);
  assert.equal(Object.isFrozen(FRANCE_1940_FACTION_PRESENTATION), true);
  assert.equal(Object.isFrozen(FRANCE_1940_INFANTRY_MESH_FACTORIES), true);
  assert.equal(Object.isFrozen(FRANCE_1940_STRUCTURE_MESH_FACTORIES), true);
  assert.equal(Object.isFrozen(FRANCE_1940_TERRAIN_SURFACE_PROVIDER), true);
  assert.equal(Object.isFrozen(FRANCE_1940_VEHICLE_MESH_FACTORIES), true);
  assert.equal(
    FRANCE_1940_VISUAL_FACTORIES.assetPackIds,
    FRANCE_1940_ASSET_RESOLVER.packIds
  );
});

test('replacement family asset pack reaches a real vehicle surface binding', () => {
  const implementationId = 'test-high-contrast-vehicle-surface-v1';
  let applyCount = 0;
  const replacementProvider = Object.freeze({
    id: implementationId,
    kind: 'vehicle-surface-pack',
    apply(root) {
      applyCount++;
      const base = PROCEDURAL_VEHICLE_SURFACE_PACK.apply(root);
      const diagnostics = Object.freeze({
        ...base,
        id: implementationId,
        provenance: 'test replacement pack'
      });
      root.userData.vehicleMaterialDiagnostics = diagnostics;
      return diagnostics;
    }
  });
  const replacementManifest = defineAssetManifest({
    id: 'france1940-test-surface-assets',
    familyId: 'france-1940',
    replaces: [FRANCE_1940_ASSET_MANIFEST.id],
    assets: {
      [FRANCE_1940_ASSET_IDS.vehicleSurfacePack]: {
        id: FRANCE_1940_ASSET_IDS.vehicleSurfacePack,
        kind: 'vehicle-surface-pack',
        source: {
          type: 'procedural',
          generatorId: implementationId
        },
        provenance: 'test-only replacement'
      }
    }
  });
  const replacementPack = createRuntimeAssetPack(replacementManifest, {
    [FRANCE_1940_ASSET_IDS.vehicleSurfacePack]: replacementProvider
  });
  const assetResolver = createAssetResolver([
    FRANCE_1940_RUNTIME_ASSET_PACK,
    replacementPack
  ]);
  const visualFactories = createFrance1940VisualFactories({ assetResolver });
  const vehicle = visualFactories.vehicleMeshes.fr_somua();

  assert.equal(applyCount, 1);
  assert.deepEqual(
    visualFactories.assetPackIds,
    [FRANCE_1940_ASSET_MANIFEST.id, replacementManifest.id]
  );
  assert.deepEqual(vehicle.userData.assetBindings.vehicleSurface, {
    logicalId: FRANCE_1940_ASSET_IDS.vehicleSurfacePack,
    sourcePackId: replacementManifest.id,
    implementationId
  });
  assert.equal(vehicle.userData.modelMetadata.materialPack.id, implementationId);
});

test('replacement family asset providers reach live infantry and structure meshes', () => {
  const infantryImplementationId = 'test-french-infantry-mesh-v1';
  const structureImplementationId = 'test-mg34-bunker-mesh-v1';
  let infantryCreateCount = 0;
  let structureCreateCount = 0;
  const replacementInfantryProvider = Object.freeze({
    id: infantryImplementationId,
    kind: 'infantry-mesh-factory',
    create(roster) {
      infantryCreateCount++;
      const mesh = FRANCE_1940_INFANTRY_MESH_FACTORIES.french_1940_chasseur(roster);
      mesh.userData.replacementProvider = infantryImplementationId;
      return mesh;
    }
  });
  const replacementStructureProvider = Object.freeze({
    id: structureImplementationId,
    kind: 'structure-mesh-factory',
    create() {
      structureCreateCount++;
      const mesh = FRANCE_1940_STRUCTURE_MESH_FACTORIES.GERMAN_MG34_BUNKER();
      mesh.userData.replacementProvider = structureImplementationId;
      return mesh;
    }
  });
  const replacementManifest = defineAssetManifest({
    id: 'france1940-test-unit-mesh-assets',
    familyId: 'france-1940',
    replaces: [FRANCE_1940_ASSET_MANIFEST.id],
    assets: {
      [FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh]: {
        id: FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh,
        kind: 'infantry-mesh-factory',
        source: {
          type: 'procedural',
          generatorId: infantryImplementationId
        },
        provenance: 'test-only replacement'
      },
      [FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh]: {
        id: FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh,
        kind: 'structure-mesh-factory',
        source: {
          type: 'procedural',
          generatorId: structureImplementationId
        },
        provenance: 'test-only replacement'
      }
    }
  });
  const replacementPack = createRuntimeAssetPack(replacementManifest, {
    [FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh]: replacementInfantryProvider,
    [FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh]: replacementStructureProvider
  });
  const assetResolver = createAssetResolver([
    FRANCE_1940_RUNTIME_ASSET_PACK,
    replacementPack
  ]);
  const visualFactories = createFrance1940VisualFactories({ assetResolver });
  const infantry = visualFactories.infantryMeshes.french_1940_chasseur([
    { id: 'rifleman', weapon: 'MAS-36 Rifle' }
  ]);
  const structure = visualFactories.structureMeshes.GERMAN_MG34_BUNKER();

  assert.equal(infantryCreateCount, 1);
  assert.equal(structureCreateCount, 1);
  assert.equal(infantry.userData.replacementProvider, infantryImplementationId);
  assert.equal(structure.userData.replacementProvider, structureImplementationId);
  assert.deepEqual(infantry.userData.assetBindings.infantryMesh, {
    logicalId: FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh,
    sourcePackId: replacementManifest.id,
    implementationId: infantryImplementationId
  });
  assert.deepEqual(structure.userData.assetBindings.structureMesh, {
    logicalId: FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh,
    sourcePackId: replacementManifest.id,
    implementationId: structureImplementationId
  });
});

test('unit mesh asset bindings reject incompatible runtime providers', () => {
  const logicalId = FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh;
  const createResolver = (packId, generatorId, provider) => {
    const manifest = defineAssetManifest({
      id: packId,
      familyId: 'france-1940',
      replaces: [FRANCE_1940_ASSET_MANIFEST.id],
      assets: {
        [logicalId]: {
          id: logicalId,
          kind: 'infantry-mesh-factory',
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
        'france1940-test-wrong-generator',
        'expected-infantry-generator',
        Object.freeze({
          id: 'different-infantry-generator',
          kind: 'infantry-mesh-factory',
          create() {
            return FRANCE_1940_INFANTRY_MESH_FACTORIES.french_1940_chasseur([]);
          }
        })
      )
    }),
    /expected generator expected-infantry-generator/
  );

  const invalidImplementationId = 'test-invalid-infantry-result';
  const visualFactories = createFrance1940VisualFactories({
    assetResolver: createResolver(
      'france1940-test-invalid-result',
      invalidImplementationId,
      Object.freeze({
        id: invalidImplementationId,
        kind: 'infantry-mesh-factory',
        create() {
          return {};
        }
      })
    )
  });
  assert.throws(
    () => visualFactories.infantryMeshes.french_1940_chasseur([]),
    /provider must create Object3D/
  );
});

test('generic UnitFactory dispatches injected registries without France 1940 content', async () => {
  const source = await readFile(
    new URL('../src/world/UnitFactory.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /from ['"].*\/vehicles\/index\.js['"]/);
  assert.doesNotMatch(
    source,
    /\bfr_somua\b|\bger_panzer4\b|\bfrench\b|\bgerman\b|\bMG34\b|\bChasseur\b/
  );
  assert.match(source, /requires injected \$\{label\} factories/);
  assert.match(source, /createInfantrySquadMesh\(modelId, roster, infantryMeshFactories\)/);
  assert.match(source, /createStructureMesh\(modelId, structureMeshFactories\)/);
});

test('generic infantry animation exports contain no France 1940 weapon geometry', async () => {
  const [genericIndex, familyWeapons] = await Promise.all([
    readFile(new URL('../src/world/infantry/index.js', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../src/content/france1940/render/France1940InfantryWeaponFactory.js',
        import.meta.url
      ),
      'utf8'
    )
  ]);

  assert.doesNotMatch(
    genericIndex,
    /MAS-36|FM 24\/29|MAS-38|Kar98k|MG34|MP40|WeaponFactory/
  );
  assert.match(familyWeapons, /FRANCE_1940_INFANTRY_WEAPON_VISUALS/);
  assert.match(familyWeapons, /createFrance1940InfantryWeaponRig/);
  assert.match(familyWeapons, /MAS-36|FM 24\/29|MAS-38|Kar98k|MG34|MP40/);
});
