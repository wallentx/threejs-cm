import {
  createAMC35Mesh,
  createCharB1BisMesh,
  createHotchkissH39Mesh,
  createLafflyS20TLMesh,
  createOpelBlitzMesh,
  createPanhard178Mesh,
  createPanzer35tMesh,
  createPanzer38tMesh,
  createPanzerIIMesh,
  createPanzerIIIMesh,
  createPanzerIVMesh,
  createRenaultR35Mesh,
  createSdKfz231Mesh,
  createSomuaS35Mesh
} from '../../../world/vehicles/index.js';
import {
  FRANCE_1940_ASSET_IDS
} from '../assets/index.js';
import {
  FRANCE_1940_ASSET_RESOLVER
} from './assetPack.js';

/**
 * Family-owned selection table for procedural vehicle renderers.
 *
 * Geometry factories remain in the legacy world path during staged migration,
 * but generic UnitFactory no longer owns France 1940 model IDs or selection.
 */
const BASE_VEHICLE_MESH_FACTORIES = Object.freeze({
  fr_somua: createSomuaS35Mesh,
  fr_renault_r35: createRenaultR35Mesh,
  fr_hotchkiss_h39: createHotchkissH39Mesh,
  fr_amc35: createAMC35Mesh,
  fr_panhard178: createPanhard178Mesh,
  fr_laffly_s20tl: createLafflyS20TLMesh,
  fr_char_b1bis: createCharB1BisMesh,
  ger_panzer2: createPanzerIIMesh,
  ger_panzer3: createPanzerIIIMesh,
  ger_panzer35t: createPanzer35tMesh,
  ger_panzer38t: createPanzer38tMesh,
  ger_sdkfz231: createSdKfz231Mesh,
  ger_opel_blitz: createOpelBlitzMesh,
  ger_panzer4: createPanzerIVMesh
});

export function createFrance1940VehicleMeshFactories(
  assetResolver = FRANCE_1940_ASSET_RESOLVER
) {
  if (assetResolver?.familyId !== 'france-1940') {
    throw new Error(
      `France 1940 vehicle renderers require france-1940 assets, received `
      + `${assetResolver?.familyId ?? 'missing'}`
    );
  }
  const surfaceBinding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.vehicleSurfacePack,
    'vehicle-surface-pack'
  );
  const vehicleSurfacePack = surfaceBinding.provider;
  if (
    !vehicleSurfacePack
    || vehicleSurfacePack.kind !== 'vehicle-surface-pack'
    || typeof vehicleSurfacePack.apply !== 'function'
  ) {
    throw new TypeError(
      `Logical asset ${FRANCE_1940_ASSET_IDS.vehicleSurfacePack} requires a vehicle surface provider`
    );
  }
  if (vehicleSurfacePack.id !== surfaceBinding.record.source.generatorId) {
    throw new Error(
      `Logical asset ${surfaceBinding.logicalId} expected generator `
      + `${surfaceBinding.record.source.generatorId}, received ${vehicleSurfacePack.id ?? 'missing'}`
    );
  }
  const options = Object.freeze({
    vehicleSurfacePack,
    vehicleSurfaceBinding: Object.freeze({
      logicalId: surfaceBinding.logicalId,
      sourcePackId: surfaceBinding.packId
    })
  });
  return Object.freeze(Object.fromEntries(
    Object.entries(BASE_VEHICLE_MESH_FACTORIES).map(([modelId, factory]) => (
      [modelId, () => factory(options)]
    ))
  ));
}

export const FRANCE_1940_VEHICLE_MESH_FACTORIES =
  createFrance1940VehicleMeshFactories();
