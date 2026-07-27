import {
  createAssetResolver,
  createRuntimeAssetPack
} from '../../../assets/AssetManifest.js';
import {
  FRANCE_1940_ASSET_IDS,
  FRANCE_1940_ASSET_MANIFEST
} from '../assets/index.js';
import {
  PROCEDURAL_VEHICLE_SURFACE_PACK
} from '../../../world/vehicles/VehicleMaterialLibrary.js';
import {
  FRENCH_CHASSEUR_INFANTRY_MESH_PROVIDER,
  GERMAN_GRENADIER_INFANTRY_MESH_PROVIDER,
  GERMAN_MG34_BUNKER_MESH_PROVIDER
} from './unitMeshProviders.js';
import {
  FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION
} from './France1940TerrainSurfaceProvider.js';
import {
  PROCEDURAL_BATTLEFIELD_VFX_PROVIDER
} from '../../../world/vfx/ProceduralBattlefieldVfxProvider.js';
import {
  FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
} from '../audio/France1940ProceduralAudioProvider.js';

export const FRANCE_1940_RUNTIME_ASSET_PACK = createRuntimeAssetPack(
  FRANCE_1940_ASSET_MANIFEST,
  {
    [FRANCE_1940_ASSET_IDS.vehicleSurfacePack]: PROCEDURAL_VEHICLE_SURFACE_PACK,
    [FRANCE_1940_ASSET_IDS.terrainSurfaceProvider]:
      FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION,
    [FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh]:
      FRENCH_CHASSEUR_INFANTRY_MESH_PROVIDER,
    [FRANCE_1940_ASSET_IDS.germanGrenadierInfantryMesh]:
      GERMAN_GRENADIER_INFANTRY_MESH_PROVIDER,
    [FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh]:
      GERMAN_MG34_BUNKER_MESH_PROVIDER,
    [FRANCE_1940_ASSET_IDS.battlefieldVfxProvider]:
      PROCEDURAL_BATTLEFIELD_VFX_PROVIDER,
    [FRANCE_1940_ASSET_IDS.battlefieldAudioProvider]:
      FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
  }
);

export const FRANCE_1940_ASSET_RESOLVER = createAssetResolver([
  FRANCE_1940_RUNTIME_ASSET_PACK
]);
