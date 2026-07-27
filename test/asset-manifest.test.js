import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createAssetResolver,
  createRuntimeAssetPack,
  defineAssetManifest,
  validateAssetManifest
} from '../src/assets/AssetManifest.js';
import {
  createFrance1940Family,
  FRANCE_1940_ASSET_MANIFEST
} from '../src/content/france1940/index.js';
import {
  FRANCE_1940_ASSET_IDS
} from '../src/content/france1940/assets/index.js';
import {
  FRANCE_1940_ASSET_RESOLVER,
  FRANCE_1940_RUNTIME_ASSET_PACK
} from '../src/content/france1940/render/index.js';
import { validateFamilyDefinition } from '../src/scenario/FamilyRegistry.js';

function manifestDefinition(overrides = {}) {
  return {
    id: 'base-pack',
    familyId: 'test-family',
    replaces: [],
    assets: {
      'test.surface': {
        id: 'test.surface',
        kind: 'surface-pack',
        source: {
          type: 'procedural',
          generatorId: 'test-generator'
        },
        dependencies: [],
        metadata: {
          quality: 'test'
        }
      }
    },
    ...overrides
  };
}

test('logical asset manifests clone plain input and deeply freeze portable records', () => {
  const input = manifestDefinition();
  const manifest = defineAssetManifest(input);
  input.assets['test.surface'].metadata.quality = 'mutated';

  assert.equal(validateAssetManifest(manifest), manifest);
  assert.equal(manifest.assets['test.surface'].metadata.quality, 'test');
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.assets), true);
  assert.equal(Object.isFrozen(manifest.assets['test.surface'].source), true);
  assert.equal(Object.isFrozen(manifest.assets['test.surface'].metadata), true);

  assert.throws(
    () => defineAssetManifest(manifestDefinition({
      assets: {
        wrong: {
          id: 'different',
          kind: 'surface-pack',
          source: { type: 'procedural', generatorId: 'test' }
        }
      }
    })),
    /asset key\/id mismatch/
  );
  assert.throws(
    () => defineAssetManifest(manifestDefinition({
      assets: {
        'test.surface': {
          id: 'test.surface',
          kind: 'surface-pack',
          source: { type: 'procedural' }
        }
      }
    })),
    /generatorId/
  );
  const missingDependencyManifest = defineAssetManifest(manifestDefinition({
    assets: {
      'test.surface': {
        id: 'test.surface',
        kind: 'surface-pack',
        source: { type: 'procedural', generatorId: 'test' },
        dependencies: ['missing.asset']
      }
    }
  }));
  assert.throws(
    () => createAssetResolver([
      createRuntimeAssetPack(missingDependencyManifest, {
        'test.surface': {}
      })
    ]),
    /unknown dependency missing\.asset/
  );
  assert.throws(
    () => defineAssetManifest({
      ...manifestDefinition(),
      metadata: { rendererFactory: () => null }
    }),
    /plain data/
  );
});

test('runtime asset packs require declared providers and explicit deterministic replacement', () => {
  const baseManifest = defineAssetManifest(manifestDefinition());
  const baseProvider = Object.freeze({ id: 'base-provider' });
  const basePack = createRuntimeAssetPack(baseManifest, {
    'test.surface': baseProvider
  });
  const baseResolver = createAssetResolver([basePack]);

  assert.equal(baseResolver.familyId, 'test-family');
  assert.equal(baseResolver.requireProvider('test.surface', 'surface-pack'), baseProvider);
  assert.deepEqual(baseResolver.packIds, ['base-pack']);
  assert.throws(
    () => createRuntimeAssetPack(baseManifest),
    /requires provider test\.surface/
  );
  assert.throws(
    () => createRuntimeAssetPack(baseManifest, {
      'test.surface': baseProvider,
      undeclared: {}
    }),
    /undeclared provider undeclared/
  );

  const replacementManifest = defineAssetManifest(manifestDefinition({
    id: 'replacement-pack',
    replaces: ['base-pack'],
    assets: {
      'test.surface': {
        id: 'test.surface',
        kind: 'surface-pack',
        source: {
          type: 'procedural',
          generatorId: 'replacement-generator'
        }
      }
    }
  }));
  const replacementProvider = Object.freeze({ id: 'replacement-provider' });
  const replacementPack = createRuntimeAssetPack(replacementManifest, {
    'test.surface': replacementProvider
  });
  const resolver = createAssetResolver([basePack, replacementPack]);
  const binding = resolver.require('test.surface', 'surface-pack');

  assert.equal(binding.packId, 'replacement-pack');
  assert.equal(binding.record, replacementManifest.assets['test.surface']);
  assert.equal(binding.provider, replacementProvider);
  assert.equal(resolver.requireProvider('test.surface'), replacementProvider);
  assert.deepEqual(resolver.packIds, ['base-pack', 'replacement-pack']);

  const implicitReplacement = createRuntimeAssetPack(
    defineAssetManifest(manifestDefinition({ id: 'implicit-pack' })),
    { 'test.surface': replacementProvider }
  );
  assert.throws(
    () => createAssetResolver([basePack, implicitReplacement]),
    /must explicitly replace base-pack/
  );
  const changedKindPack = createRuntimeAssetPack(
    defineAssetManifest(manifestDefinition({
      id: 'changed-kind-pack',
      replaces: ['base-pack'],
      assets: {
        'test.surface': {
          id: 'test.surface',
          kind: 'audio-bank',
          source: {
            type: 'procedural',
            generatorId: 'changed-kind-generator'
          }
        }
      }
    })),
    { 'test.surface': replacementProvider }
  );
  assert.throws(
    () => createAssetResolver([basePack, changedKindPack]),
    /cannot change test\.surface kind/
  );
  assert.throws(
    () => createAssetResolver([replacementPack]),
    /replaces unavailable pack base-pack/
  );
});

test('France 1940 family owns one renderer-neutral manifest and one bound core runtime pack', async () => {
  const family = createFrance1940Family();
  const expectedKinds = Object.freeze({
    [FRANCE_1940_ASSET_IDS.vehicleSurfacePack]: 'vehicle-surface-pack',
    [FRANCE_1940_ASSET_IDS.terrainSurfaceProvider]: 'terrain-surface-provider',
    [FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh]: 'infantry-mesh-factory',
    [FRANCE_1940_ASSET_IDS.germanGrenadierInfantryMesh]: 'infantry-mesh-factory',
    [FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh]: 'structure-mesh-factory',
    [FRANCE_1940_ASSET_IDS.battlefieldVfxProvider]: 'battlefield-vfx-provider',
    [FRANCE_1940_ASSET_IDS.battlefieldAudioProvider]:
      'battlefield-audio-provider',
    [FRANCE_1940_ASSET_IDS.somuaSideCalibrationReference]:
      'calibration-reference-image',
    [FRANCE_1940_ASSET_IDS.renaultR35MultiviewCalibrationReference]:
      'calibration-reference-image',
    [FRANCE_1940_ASSET_IDS.renaultD2MultiviewCalibrationReference]:
      'calibration-reference-image'
  });

  assert.equal(family.assetManifest, FRANCE_1940_ASSET_MANIFEST);
  assert.equal(FRANCE_1940_ASSET_MANIFEST.familyId, family.id);
  assert.equal(FRANCE_1940_RUNTIME_ASSET_PACK.manifest, FRANCE_1940_ASSET_MANIFEST);
  assert.deepEqual(
    Object.keys(FRANCE_1940_ASSET_MANIFEST.assets).sort(),
    Object.keys(expectedKinds).sort()
  );
  for (const [logicalId, kind] of Object.entries(expectedKinds)) {
    const binding = FRANCE_1940_ASSET_RESOLVER.require(logicalId, kind);
    assert.equal(binding.packId, FRANCE_1940_ASSET_MANIFEST.id);
    assert.equal(binding.record, FRANCE_1940_ASSET_MANIFEST.assets[logicalId]);
    if (binding.record.source.type === 'procedural') {
      assert.equal(binding.provider.kind, kind);
      assert.equal(binding.provider.id, binding.record.source.generatorId);
    } else {
      assert.equal(binding.provider, null);
      assert.ok(
        [
          '/s35-compare.jpg',
          '/assets/blueprints/france1940/renault-r-35-2.png',
          '/assets/blueprints/france1940/renault-d2-tourelle-apx-4.png'
        ]
          .includes(binding.record.source.url)
      );
    }
  }

  const wrongFamilyManifest = defineAssetManifest({
    id: 'wrong-family-assets',
    familyId: 'different-family',
    replaces: [],
    assets: {}
  });
  assert.throws(
    () => validateFamilyDefinition({
      ...family,
      assetManifest: wrongFamilyManifest
    }),
    /cannot own asset manifest for different-family/
  );

  const sources = await Promise.all([
    '../src/assets/AssetManifest.js',
    '../src/content/france1940/assets/manifest.js'
  ].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /^import\s.+?from\s+['"](?:three|.*\/(?:game|world|ui|main))(?:\/|['"])/m
    );
    assert.doesNotMatch(source, /\b(?:document|window|HTMLElement)\b/);
  }
});
