import { defineAssetManifest } from '../../../assets/AssetManifest.js';

export const FRANCE_1940_ASSET_IDS = Object.freeze({
  vehicleSurfacePack: 'france1940.vehicle.surface.default',
  terrainSurfaceProvider: 'france1940.terrain.surface.default',
  frenchChasseurInfantryMesh: 'france1940.infantry.french.chasseur.mesh',
  germanGrenadierInfantryMesh: 'france1940.infantry.german.grenadier.mesh',
  germanMg34BunkerMesh: 'france1940.structure.german.mg34-bunker.mesh',
  battlefieldVfxProvider: 'france1940.vfx.battlefield.default',
  battlefieldAudioProvider: 'france1940.audio.battlefield.default',
  somuaMultiviewCalibrationReference:
    'france1940.calibration.vehicle.fr_somua.multiview.reference',
  renaultR35MultiviewCalibrationReference:
    'france1940.calibration.vehicle.fr_renault_r35.multiview.reference',
  renaultD2MultiviewCalibrationReference:
    'france1940.calibration.vehicle.fr_renault_d2.multiview.reference'
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
        generatorId: 'france-1940-procedural-terrain-surfaces-v4'
      },
      provenance: 'deterministic procedural battlefield surface approximation',
      metadata: {
        materialRoles: [
          'ground',
          'water',
          'bridge-road',
          'masonry',
          'fence-card',
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
        generatorId: 'procedural-battlefield-vfx-v2'
      },
      provenance: 'deterministic bounded battlefield VFX approximation',
      metadata: {
        effectRoles: [
          'projectile-tracer',
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
    [FRANCE_1940_ASSET_IDS.battlefieldAudioProvider]: {
      id: FRANCE_1940_ASSET_IDS.battlefieldAudioProvider,
      kind: 'battlefield-audio-provider',
      source: {
        type: 'procedural',
        generatorId: 'france-1940-procedural-battlefield-audio-v2'
      },
      provenance: 'procedural presentation approximation derived from weapon class and caliber',
      metadata: {
        eventRoles: [
          'rifle-shot',
          'machine-gun-shot',
          'submachine-gun-shot',
          'light-cannon-shot',
          'medium-cannon-shot',
          'explosion',
          'ui-click'
        ],
        simulationAuthority: false
      }
    },
    [FRANCE_1940_ASSET_IDS.somuaMultiviewCalibrationReference]: {
      id: FRANCE_1940_ASSET_IDS.somuaMultiviewCalibrationReference,
      kind: 'calibration-reference-image',
      source: {
        type: 'url',
        url: '/assets/blueprints/france1940/s35-4view.webp'
      },
      provenance: 'user-supplied SOMUA S35 four-elevation drawing; calibration use only',
      metadata: {
        modelId: 'fr_somua',
        views: ['side', 'front', 'rear', 'top'],
        role: 'orthographic-shape-registration',
        sha256:
          '6a9e9268b514039429e7d0a84485f3773a1d230edad1532f32266a785332909d'
      }
    },
    [FRANCE_1940_ASSET_IDS.renaultR35MultiviewCalibrationReference]: {
      id: FRANCE_1940_ASSET_IDS.renaultR35MultiviewCalibrationReference,
      kind: 'calibration-reference-image',
      source: {
        type: 'url',
        url: '/assets/blueprints/france1940/renault-r-35-2.png'
      },
      provenance:
        'user-supplied Renault R35 four-elevation drawing; calibration use only',
      metadata: {
        modelId: 'fr_renault_r35',
        views: ['side', 'front', 'top'],
        role: 'orthographic-shape-registration',
        sha256:
          '11ef1ab07dcfc0672016c5ebad845894c5750d056c682419fb5177b033ba8df5'
      }
    },
    [FRANCE_1940_ASSET_IDS.renaultD2MultiviewCalibrationReference]: {
      id: FRANCE_1940_ASSET_IDS.renaultD2MultiviewCalibrationReference,
      kind: 'calibration-reference-image',
      source: {
        type: 'url',
        url: '/assets/blueprints/france1940/renault-d2-tourelle-apx-4.png'
      },
      provenance:
        'secondary Renault D2 five-view drawing; LLM-authored registration pending human review',
      metadata: {
        modelId: 'fr_renault_d2',
        views: ['side', 'front', 'top'],
        role: 'orthographic-shape-registration',
        sha256:
          '93cf038753a8510e80907e2bcadd267da7dc594ddba081c4619bd486a2cc19d9'
      }
    }
  }
});
