import {
  defineVehicleVisualBundleRegistry
} from '../../../calibration/VehicleVisualBundle.js';
import {
  BLUEPRINT_CALIBRATION_RECORDS
} from '../../../calibration/BlueprintCalibrationRecords.js';
import {
  VEHICLE_VISUAL_PROFILES
} from '../../../world/vehicles/VehicleVisualProfiles.js';
import {
  FRANCE_1940_ASSET_IDS
} from '../assets/index.js';
import {
  RENAULT_R35_VISUAL_DATA
} from '../vehicleData/RenaultR35VisualData.js';
import {
  FRANCE_1940_VEHICLES
} from '../vehicles.js';
import {
  FRANCE_1940_ASSET_RESOLVER
} from './assetPack.js';
import {
  createFrance1940VehicleMeshFactories
} from './vehicleMeshFactories.js';

const DEFAULT_REQUIRED_LODS = Object.freeze(['high', 'medium', 'core', 'proxy']);

function assetRecordsByModelId(assetResolver) {
  const surfaceBinding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.vehicleSurfacePack,
    'vehicle-surface-pack'
  );
  const surface = Object.freeze({
    logicalId: surfaceBinding.logicalId,
    sourcePackId: surfaceBinding.packId,
    record: surfaceBinding.record
  });
  const r35BlueprintBinding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.renaultR35MultiviewCalibrationReference,
    'calibration-reference-image'
  );

  return Object.freeze(Object.fromEntries(
    Object.values(FRANCE_1940_VEHICLES).map(vehicle => {
      const visualData = vehicle.modelId === RENAULT_R35_VISUAL_DATA.modelId
        ? RENAULT_R35_VISUAL_DATA
        : null;
      const blueprint = visualData
        ? Object.freeze({
            logicalId: r35BlueprintBinding.logicalId,
            sourcePackId: r35BlueprintBinding.packId,
            record: r35BlueprintBinding.record,
            registration: visualData.blueprint
          })
        : Object.freeze({
            sourcePageUrls: VEHICLE_VISUAL_PROFILES[vehicle.modelId].references
          });
      return [
        vehicle.modelId,
        Object.freeze({ surface, blueprint })
      ];
    })
  ));
}

export function createFrance1940VehicleVisualBundles({
  assetResolver = FRANCE_1940_ASSET_RESOLVER,
  meshFactories = createFrance1940VehicleMeshFactories(assetResolver)
} = {}) {
  if (assetResolver?.familyId !== 'france-1940') {
    throw new Error('France 1940 vehicle visual bundles require France 1940 assets');
  }

  const validationByModelId = Object.fromEntries(
    Object.values(FRANCE_1940_VEHICLES).map(vehicle => [
      vehicle.modelId,
      vehicle.modelId === RENAULT_R35_VISUAL_DATA.modelId
        ? RENAULT_R35_VISUAL_DATA.validation
        : Object.freeze({ requiredLodBands: DEFAULT_REQUIRED_LODS })
    ])
  );

  return defineVehicleVisualBundleRegistry({
    vehicles: FRANCE_1940_VEHICLES,
    profiles: VEHICLE_VISUAL_PROFILES,
    calibrations: BLUEPRINT_CALIBRATION_RECORDS,
    meshFactories,
    assetsByModelId: assetRecordsByModelId(assetResolver),
    visualDataByModelId: {
      [RENAULT_R35_VISUAL_DATA.modelId]: RENAULT_R35_VISUAL_DATA
    },
    validationByModelId
  });
}

export const FRANCE_1940_VEHICLE_VISUAL_BUNDLES =
  createFrance1940VehicleVisualBundles();
