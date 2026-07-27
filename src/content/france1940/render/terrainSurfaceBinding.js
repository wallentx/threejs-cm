import { FRANCE_1940_ASSET_IDS } from '../assets/index.js';
import { FRANCE_1940_ASSET_RESOLVER } from './assetPack.js';

const MATERIAL_ROLES = Object.freeze([
  'ground',
  'water',
  'bridgeRoad',
  'masonry',
  'foliageTrunk',
  'foliageLeaves',
  'foliageLeavesDark'
]);

function validateSurfaceSet(logicalId, surfaceSet) {
  if (!surfaceSet || surfaceSet.kind !== 'terrain-surface-set') {
    throw new TypeError(`Logical asset ${logicalId} must create a terrain surface set`);
  }
  if (!surfaceSet.materials || typeof surfaceSet.materials !== 'object') {
    throw new TypeError(`Logical asset ${logicalId} must create terrain materials`);
  }
  for (const role of MATERIAL_ROLES) {
    if (!surfaceSet.materials[role]?.isMaterial) {
      throw new TypeError(`Logical asset ${logicalId} requires terrain material ${role}`);
    }
  }
  if (typeof surfaceSet.dispose !== 'function') {
    throw new TypeError(`Logical asset ${logicalId} terrain surface set requires dispose`);
  }
}

export function createFrance1940TerrainSurfaceProvider(
  assetResolver = FRANCE_1940_ASSET_RESOLVER
) {
  if (assetResolver?.familyId !== 'france-1940') {
    throw new Error(
      `France 1940 terrain surfaces require france-1940 assets, received `
      + `${assetResolver?.familyId ?? 'missing'}`
    );
  }
  const binding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.terrainSurfaceProvider,
    'terrain-surface-provider'
  );
  const provider = binding.provider;
  if (
    !provider
    || provider.kind !== 'terrain-surface-provider'
    || typeof provider.create !== 'function'
  ) {
    throw new TypeError(
      `Logical asset ${binding.logicalId} requires a terrain surface provider`
    );
  }
  if (
    binding.record.source.type === 'procedural'
    && provider.id !== binding.record.source.generatorId
  ) {
    throw new Error(
      `Logical asset ${binding.logicalId} expected generator `
      + `${binding.record.source.generatorId}, received ${provider.id ?? 'missing'}`
    );
  }
  const assetBinding = Object.freeze({
    logicalId: binding.logicalId,
    sourcePackId: binding.packId,
    implementationId: provider.id
  });
  return Object.freeze({
    id: provider.id,
    kind: provider.kind,
    assetBinding,
    create(surfaces) {
      const surfaceSet = provider.create(surfaces);
      validateSurfaceSet(binding.logicalId, surfaceSet);
      for (const material of Object.values(surfaceSet.materials)) {
        material.userData.assetBinding = assetBinding;
      }
      return Object.freeze({
        ...surfaceSet,
        assetBinding
      });
    }
  });
}

export const FRANCE_1940_TERRAIN_SURFACE_PROVIDER =
  createFrance1940TerrainSurfaceProvider();
