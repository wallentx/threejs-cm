import { FRANCE_1940_ASSET_IDS } from '../assets/index.js';
import { FRANCE_1940_ASSET_RESOLVER } from './assetPack.js';

const INFANTRY_ASSETS_BY_MODEL = Object.freeze({
  french_1940_chasseur: FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh,
  german_1940_grenadier: FRANCE_1940_ASSET_IDS.germanGrenadierInfantryMesh
});

const STRUCTURE_ASSETS_BY_MODEL = Object.freeze({
  GERMAN_MG34_BUNKER: FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh
});

function requireMeshProvider(assetResolver, logicalId, kind) {
  const binding = assetResolver.require(logicalId, kind);
  const provider = binding.provider;
  if (
    !provider
    || provider.kind !== kind
    || typeof provider.create !== 'function'
  ) {
    throw new TypeError(`Logical asset ${logicalId} requires a ${kind} provider`);
  }
  if (
    binding.record.source.type === 'procedural'
    && provider.id !== binding.record.source.generatorId
  ) {
    throw new Error(
      `Logical asset ${logicalId} expected generator `
      + `${binding.record.source.generatorId}, received ${provider.id ?? 'missing'}`
    );
  }
  return binding;
}

function bindMeshFactory(binding, bindingKey) {
  return (...args) => {
    const mesh = binding.provider.create(...args);
    if (!mesh?.isObject3D || !mesh.userData) {
      throw new TypeError(`Logical asset ${binding.logicalId} provider must create Object3D`);
    }
    mesh.userData.assetBindings = {
      ...mesh.userData.assetBindings,
      [bindingKey]: {
        logicalId: binding.logicalId,
        sourcePackId: binding.packId,
        implementationId: binding.provider.id
      }
    };
    return mesh;
  };
}

function createFactoryMap(assetResolver, assetsByModel, kind, bindingKey) {
  return Object.freeze(Object.fromEntries(
    Object.entries(assetsByModel).map(([modelId, logicalId]) => {
      const binding = requireMeshProvider(assetResolver, logicalId, kind);
      return [modelId, bindMeshFactory(binding, bindingKey)];
    })
  ));
}

export function createFrance1940UnitMeshFactories(
  assetResolver = FRANCE_1940_ASSET_RESOLVER
) {
  if (assetResolver?.familyId !== 'france-1940') {
    throw new Error(
      `France 1940 unit renderers require france-1940 assets, received `
      + `${assetResolver?.familyId ?? 'missing'}`
    );
  }
  return Object.freeze({
    infantryMeshes: createFactoryMap(
      assetResolver,
      INFANTRY_ASSETS_BY_MODEL,
      'infantry-mesh-factory',
      'infantryMesh'
    ),
    structureMeshes: createFactoryMap(
      assetResolver,
      STRUCTURE_ASSETS_BY_MODEL,
      'structure-mesh-factory',
      'structureMesh'
    )
  });
}

const DEFAULT_UNIT_MESH_FACTORIES = createFrance1940UnitMeshFactories();

export const FRANCE_1940_INFANTRY_MESH_FACTORIES =
  DEFAULT_UNIT_MESH_FACTORIES.infantryMeshes;

export const FRANCE_1940_STRUCTURE_MESH_FACTORIES =
  DEFAULT_UNIT_MESH_FACTORIES.structureMeshes;
