import { defineAssetManifest } from '../../../assets/AssetManifest.js';

export const FRANCE_1940_ASSET_IDS = Object.freeze({
  vehicleSurfacePack: 'france1940.vehicle.surface.default',
  terrainSurfaceProvider: 'france1940.terrain.surface.default',
  frenchChasseurInfantryMesh: 'france1940.infantry.french.chasseur.mesh',
  germanGrenadierInfantryMesh: 'france1940.infantry.german.grenadier.mesh',
  germanMg34BunkerMesh: 'france1940.structure.german.mg34-bunker.mesh',
  battlefieldVfxProvider: 'france1940.vfx.battlefield.default',
  somuaSideCalibrationReference:
    'france1940.calibration.vehicle.fr_somua.side.reference'
});

export const FRANCE_1940_ASSET_MANIFEST = defineAssetManifest({
  id: 'france1940-core-assets-v1',
  familyId: 'france-1940',
  replaces: [],
  assets: {
    [FRANCE_1940_ASSET_IDS.vehicleSurfacePack]: {
      id: FRANCE_1940_ASSET_IDS.vehicleSurfacePack,
      kind: 'vehicle-surface-pack',
      source: {
        type: 'procedural',
        generatorId: 'france-1940-procedural-pbr-v1'
      },
      provenance: 'deterministic gameplay approximation; not archival paint matching',
      metadata: {
        channels: ['albedo', 'roughness', 'bump'],
        materialSlots: ['paint', 'track', 'rubber', 'metal', 'canvas', 'wood'],
        lodPolicy: 'detailed PBR channels; albedo-only proxy'
      }
    },
    [FRANCE_1940_ASSET_IDS.terrainSurfaceProvider]: {
      id: FRANCE_1940_ASSET_IDS.terrainSurfaceProvider,
      kind: 'terrain-surface-provider',
      source: {
        type: 'procedural',
        generatorId: 'france-1940-procedural-terrain-surfaces-v1'
      },
      provenance: 'deterministic procedural battlefield surface approximation',
      metadata: {
        materialRoles: [
          'ground',
          'water',
          'bridge-road',
          'masonry',
          'foliage-trunk',
          'foliage-leaves',
          'foliage-leaves-dark'
        ],
        mapStyleSource: 'injected map descriptor surfaces'
      }
    },
    [FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh]: {
      id: FRANCE_1940_ASSET_IDS.frenchChasseurInfantryMesh,
      kind: 'infantry-mesh-factory',
      source: {
        type: 'procedural',
        generatorId: 'france-1940-procedural-french-chasseur-v1'
      },
      provenance: 'authored procedural France 1940 infantry approximation',
      metadata: {
        modelId: 'french_1940_chasseur',
        factionId: 'french',
        lodBands: ['high', 'core', 'proxy', 'ui']
      }
    },
    [FRANCE_1940_ASSET_IDS.germanGrenadierInfantryMesh]: {
      id: FRANCE_1940_ASSET_IDS.germanGrenadierInfantryMesh,
      kind: 'infantry-mesh-factory',
      source: {
        type: 'procedural',
        generatorId: 'france-1940-procedural-german-grenadier-v1'
      },
      provenance: 'authored procedural France 1940 infantry approximation',
      metadata: {
        modelId: 'german_1940_grenadier',
        factionId: 'german',
        lodBands: ['high', 'core', 'proxy', 'ui']
      }
    },
    [FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh]: {
      id: FRANCE_1940_ASSET_IDS.germanMg34BunkerMesh,
      kind: 'structure-mesh-factory',
      source: {
        type: 'procedural',
        generatorId: 'france-1940-procedural-mg34-bunker-v1'
      },
      provenance: 'authored procedural reinforced-concrete bunker approximation',
      metadata: {
        modelId: 'GERMAN_MG34_BUNKER',
        damageStates: ['intact', 'destroyed']
      }
    },
    [FRANCE_1940_ASSET_IDS.battlefieldVfxProvider]: {
      id: FRANCE_1940_ASSET_IDS.battlefieldVfxProvider,
      kind: 'battlefield-vfx-provider',
      source: {
        type: 'procedural',
        generatorId: 'procedural-battlefield-vfx-v1'
      },
      provenance: 'deterministic bounded battlefield VFX approximation',
      metadata: {
        effectRoles: [
          'projectile-impact',
          'explosion',
          'vehicle-smoke',
          'vehicle-fire',
          'vehicle-sparks',
          'vehicle-scorch'
        ],
        simulationAuthority: false
      }
    },
    [FRANCE_1940_ASSET_IDS.somuaSideCalibrationReference]: {
      id: FRANCE_1940_ASSET_IDS.somuaSideCalibrationReference,
      kind: 'calibration-reference-image',
      source: {
        type: 'url',
        url: '/s35-compare.jpg'
      },
      provenance: 'user-supplied SOMUA S35 comparison sheet; calibration use only',
      metadata: {
        modelId: 'fr_somua',
        views: ['side'],
        role: 'orthographic-shape-registration'
      }
    }
  }
});
