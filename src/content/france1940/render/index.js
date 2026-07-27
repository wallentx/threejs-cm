import {
  createFrance1940VehicleMeshFactories,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from './vehicleMeshFactories.js';
import {
  createFrance1940UnitMeshFactories,
  FRANCE_1940_INFANTRY_MESH_FACTORIES,
  FRANCE_1940_STRUCTURE_MESH_FACTORIES
} from './unitMeshFactories.js';
import {
  FRANCE_1940_ASSET_RESOLVER,
  FRANCE_1940_RUNTIME_ASSET_PACK
} from './assetPack.js';
import {
  createFrance1940TerrainSurfaceProvider,
  FRANCE_1940_TERRAIN_SURFACE_PROVIDER
} from './terrainSurfaceBinding.js';
import {
  createFrance1940CalibrationReferenceRegistry,
  FRANCE_1940_CALIBRATION_REFERENCES
} from './calibrationReferenceBinding.js';
import {
  createFrance1940VfxProvider,
  FRANCE_1940_VFX_PROVIDER
} from './vfxBinding.js';
import {
  createFrance1940AudioProvider,
  FRANCE_1940_AUDIO_PROVIDER
} from './audioBinding.js';
import { FRANCE_1940_FACTIONS } from '../factions.js';
import { FRANCE_1940_PRESENTATION } from '../presentation.js';
import {
  createFrance1940BunkerMesh,
  createFrance1940InfantrySquadMesh
} from './France1940UnitMeshFactory.js';
import {
  createFrance1940InfantryWeaponRig,
  FRANCE_1940_INFANTRY_WEAPON_VISUALS
} from './France1940InfantryWeaponFactory.js';

export const FRANCE_1940_FACTION_PRESENTATION = Object.freeze(
  Object.fromEntries(Object.entries(FRANCE_1940_FACTIONS).map(([factionId, faction]) => [
    factionId,
    FRANCE_1940_PRESENTATION[faction.presentationId]
  ]))
);

export function createFrance1940VisualFactories({
  assetResolver = FRANCE_1940_ASSET_RESOLVER
} = {}) {
  const unitMeshes = assetResolver === FRANCE_1940_ASSET_RESOLVER
    ? {
        infantryMeshes: FRANCE_1940_INFANTRY_MESH_FACTORIES,
        structureMeshes: FRANCE_1940_STRUCTURE_MESH_FACTORIES
      }
    : createFrance1940UnitMeshFactories(assetResolver);
  const terrainSurfaceProvider = assetResolver === FRANCE_1940_ASSET_RESOLVER
    ? FRANCE_1940_TERRAIN_SURFACE_PROVIDER
    : createFrance1940TerrainSurfaceProvider(assetResolver);
  return Object.freeze({
    familyId: 'france-1940',
    assetPackIds: assetResolver.packIds,
    factionPresentation: FRANCE_1940_FACTION_PRESENTATION,
    terrainSurfaceProvider,
    audioProvider: assetResolver === FRANCE_1940_ASSET_RESOLVER
      ? FRANCE_1940_AUDIO_PROVIDER
      : createFrance1940AudioProvider(assetResolver),
    vfxProvider: assetResolver === FRANCE_1940_ASSET_RESOLVER
      ? FRANCE_1940_VFX_PROVIDER
      : createFrance1940VfxProvider(assetResolver),
    infantryMeshes: unitMeshes.infantryMeshes,
    structureMeshes: unitMeshes.structureMeshes,
    vehicleMeshes: assetResolver === FRANCE_1940_ASSET_RESOLVER
      ? FRANCE_1940_VEHICLE_MESH_FACTORIES
      : createFrance1940VehicleMeshFactories(assetResolver)
  });
}

export const FRANCE_1940_VISUAL_FACTORIES = createFrance1940VisualFactories();

export {
  createFrance1940BunkerMesh,
  createFrance1940AudioProvider,
  createFrance1940CalibrationReferenceRegistry,
  createFrance1940InfantryWeaponRig,
  createFrance1940InfantrySquadMesh,
  createFrance1940TerrainSurfaceProvider,
  createFrance1940UnitMeshFactories,
  createFrance1940VehicleMeshFactories,
  createFrance1940VfxProvider,
  FRANCE_1940_INFANTRY_MESH_FACTORIES,
  FRANCE_1940_INFANTRY_WEAPON_VISUALS,
  FRANCE_1940_ASSET_RESOLVER,
  FRANCE_1940_AUDIO_PROVIDER,
  FRANCE_1940_CALIBRATION_REFERENCES,
  FRANCE_1940_RUNTIME_ASSET_PACK,
  FRANCE_1940_STRUCTURE_MESH_FACTORIES,
  FRANCE_1940_TERRAIN_SURFACE_PROVIDER,
  FRANCE_1940_VFX_PROVIDER,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
};
