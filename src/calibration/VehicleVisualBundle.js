const BUNDLE_TYPE = 'vehicle-visual-bundle-v1';

const dictionary = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-array object dictionary`);
  }
  return value;
};

const dimensionsMatch = (left, right) => (
  left
  && right
  && left.length === right.length
  && left.width === right.width
  && left.height === right.height
);

const freezeNested = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeNested(child);
  return Object.freeze(value);
};

export function defineVehicleVisualBundle({
  modelId,
  vehicle,
  profile,
  calibration,
  createMesh,
  assets = {},
  visualData = null,
  validation = {}
}) {
  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new TypeError('vehicle visual bundle requires modelId');
  }
  if (!vehicle || vehicle.modelId !== modelId) {
    throw new Error(`vehicle visual bundle ${modelId} requires matching canonical vehicle statistics`);
  }
  if (!profile || typeof profile.designation !== 'string') {
    throw new Error(`vehicle visual bundle ${modelId} requires a visual profile`);
  }
  if (!calibration || calibration.modelId !== modelId) {
    throw new Error(`vehicle visual bundle ${modelId} requires matching blueprint calibration`);
  }
  if (typeof createMesh !== 'function') {
    throw new TypeError(`vehicle visual bundle ${modelId} requires a mesh factory`);
  }
  if (!dimensionsMatch(vehicle.dimensionsMeters, profile.dimensionsMeters)) {
    throw new Error(`vehicle visual bundle ${modelId} statistics/profile dimensions diverge`);
  }
  if (!dimensionsMatch(vehicle.dimensionsMeters, calibration.dimensionsMeters)) {
    throw new Error(`vehicle visual bundle ${modelId} statistics/calibration dimensions diverge`);
  }
  if (
    visualData
    && (
      visualData.modelId !== modelId
      || !dimensionsMatch(vehicle.dimensionsMeters, visualData.dimensionsMeters)
    )
  ) {
    throw new Error(`vehicle visual bundle ${modelId} renderer data identity or dimensions diverge`);
  }

  return Object.freeze({
    type: BUNDLE_TYPE,
    modelId,
    vehicle,
    profile,
    calibration,
    createMesh,
    assets: freezeNested({ ...assets }),
    visualData,
    validation: freezeNested({ ...validation })
  });
}

export function defineVehicleVisualBundleRegistry({
  vehicles,
  profiles,
  calibrations,
  meshFactories,
  assetsByModelId = {},
  visualDataByModelId = {},
  validationByModelId = {}
}) {
  dictionary(vehicles, 'vehicles');
  dictionary(profiles, 'profiles');
  dictionary(calibrations, 'calibrations');
  dictionary(meshFactories, 'meshFactories');
  dictionary(assetsByModelId, 'assetsByModelId');
  dictionary(visualDataByModelId, 'visualDataByModelId');
  dictionary(validationByModelId, 'validationByModelId');

  const vehiclesByModelId = {};
  for (const vehicle of Object.values(vehicles)) {
    if (!vehicle?.modelId) throw new Error('vehicle registry entry requires modelId');
    if (vehiclesByModelId[vehicle.modelId]) {
      throw new Error(`duplicate vehicle modelId ${vehicle.modelId}`);
    }
    vehiclesByModelId[vehicle.modelId] = vehicle;
  }

  const modelIds = Object.keys(vehiclesByModelId).sort();
  for (const [label, registry] of [
    ['profiles', profiles],
    ['calibrations', calibrations],
    ['meshFactories', meshFactories]
  ]) {
    const ids = Object.keys(registry).sort();
    if (
      ids.length !== modelIds.length
      || ids.some((id, index) => id !== modelIds[index])
    ) {
      throw new Error(
        `vehicle visual bundle ${label} registry IDs [${ids.join(', ')}] `
        + `do not match vehicle model IDs [${modelIds.join(', ')}]`
      );
    }
  }

  return Object.freeze(Object.fromEntries(modelIds.map(modelId => [
    modelId,
    defineVehicleVisualBundle({
      modelId,
      vehicle: vehiclesByModelId[modelId],
      profile: profiles[modelId],
      calibration: calibrations[modelId],
      createMesh: meshFactories[modelId],
      assets: assetsByModelId[modelId] ?? {},
      visualData: visualDataByModelId[modelId] ?? null,
      validation: validationByModelId[modelId] ?? {}
    })
  ])));
}

export function isVehicleVisualBundle(value) {
  return value?.type === BUNDLE_TYPE;
}
