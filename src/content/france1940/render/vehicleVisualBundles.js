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
  HOTCHKISS_H39_VISUAL_DATA
} from '../vehicleData/HotchkissH39VisualData.js';
import {
  CHAR_B1_BIS_VISUAL_DATA
} from '../vehicleData/CharB1BisVisualData.js';
import {
  RENAULT_D2_VISUAL_DATA
} from '../vehicleData/RenaultD2AuthoringData.js';
import {
  SOMUA_S35_VISUAL_DATA
} from '../vehicleData/SomuaS35VisualData.js';
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
const VISUAL_DATA_BY_MODEL_ID = Object.freeze({
  [SOMUA_S35_VISUAL_DATA.modelId]: SOMUA_S35_VISUAL_DATA,
  [RENAULT_R35_VISUAL_DATA.modelId]: RENAULT_R35_VISUAL_DATA,
  [HOTCHKISS_H39_VISUAL_DATA.modelId]: HOTCHKISS_H39_VISUAL_DATA,
  [CHAR_B1_BIS_VISUAL_DATA.modelId]: CHAR_B1_BIS_VISUAL_DATA,
  [RENAULT_D2_VISUAL_DATA.modelId]: RENAULT_D2_VISUAL_DATA
});

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
  const somuaBlueprintBinding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.somuaMultiviewCalibrationReference,
    'calibration-reference-image'
  );
  const d2BlueprintBinding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.renaultD2MultiviewCalibrationReference,
    'calibration-reference-image'
  );
  const blueprintBindings = Object.freeze({
    [SOMUA_S35_VISUAL_DATA.modelId]: somuaBlueprintBinding,
    [RENAULT_R35_VISUAL_DATA.modelId]: r35BlueprintBinding,
    [RENAULT_D2_VISUAL_DATA.modelId]: d2BlueprintBinding
  });

  return Object.freeze(Object.fromEntries(
    Object.values(FRANCE_1940_VEHICLES).map(vehicle => {
      const visualData = VISUAL_DATA_BY_MODEL_ID[vehicle.modelId] ?? null;
      const blueprintBinding = blueprintBindings[vehicle.modelId] ?? null;
      const blueprint = visualData && blueprintBinding
        ? Object.freeze({
            logicalId: blueprintBinding.logicalId,
            sourcePackId: blueprintBinding.packId,
            record: blueprintBinding.record,
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
      VISUAL_DATA_BY_MODEL_ID[vehicle.modelId]?.validation
        ?? Object.freeze({ requiredLodBands: DEFAULT_REQUIRED_LODS })
    ])
  );

  return defineVehicleVisualBundleRegistry({
    vehicles: FRANCE_1940_VEHICLES,
    profiles: VEHICLE_VISUAL_PROFILES,
    calibrations: BLUEPRINT_CALIBRATION_RECORDS,
    meshFactories,
    assetsByModelId: assetRecordsByModelId(assetResolver),
    visualDataByModelId: VISUAL_DATA_BY_MODEL_ID,
    validationByModelId
  });
}

export const FRANCE_1940_VEHICLE_VISUAL_BUNDLES =
  createFrance1940VehicleVisualBundles();
