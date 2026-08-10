import { VEHICLE_VISUAL_PROFILES } from '../world/vehicles/VehicleVisualProfiles.js';

const emptyCrop = () => Object.freeze({
  left: 0,
  top: 0,
  right: 0,
  bottom: 0
});

const emptyRegistration = () => Object.freeze({
  imageUrl: null,
  crop: emptyCrop(),
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDegrees: 0,
  mirrorX: false,
  landmarks: Object.freeze({})
});

const dimensionLandmarks = dimensions => Object.freeze([
  Object.freeze({
    id: 'ground-origin',
    label: 'Model origin (ground center)',
    world: Object.freeze([0, 0, 0]),
    views: Object.freeze(['side', 'front', 'rear', 'top'])
  }),
  Object.freeze({
    id: 'rigid-front',
    label: 'Rigid front datum',
    world: Object.freeze([0, 0, dimensions.length * 0.5]),
    views: Object.freeze(['side', 'top'])
  }),
  Object.freeze({
    id: 'rigid-rear',
    label: 'Rigid rear datum',
    world: Object.freeze([0, 0, -dimensions.length * 0.5]),
    views: Object.freeze(['side', 'top'])
  }),
  Object.freeze({
    id: 'vehicle-top',
    label: 'Vehicle top datum',
    world: Object.freeze([0, dimensions.height, 0]),
    views: Object.freeze(['side', 'front', 'rear'])
  }),
  Object.freeze({
    id: 'vehicle-left',
    label: 'Vehicle left datum',
    world: Object.freeze([dimensions.width * 0.5, 0, 0]),
    views: Object.freeze(['front', 'rear', 'top'])
  }),
  Object.freeze({
    id: 'vehicle-right',
    label: 'Vehicle right datum',
    world: Object.freeze([-dimensions.width * 0.5, 0, 0]),
    views: Object.freeze(['front', 'rear', 'top'])
  })
]);

const createRecord = (modelId, profile) => Object.freeze({
  modelId,
  designation: profile.designation,
  dimensionsMeters: profile.dimensionsMeters,
  dimensionPolicy: profile.dimensionPolicy,
  sourceUrls: profile.references,
  dataQuality: profile.dataQuality,
  status: 'unregistered',
  views: Object.freeze({
    side: emptyRegistration(),
    front: emptyRegistration(),
    rear: emptyRegistration(),
    top: emptyRegistration()
  }),
  landmarks: Object.freeze([
    ...dimensionLandmarks(profile.dimensionsMeters),
    ...profile.calibrationLandmarks
  ])
});

export const BLUEPRINT_CALIBRATION_RECORDS = Object.freeze(Object.fromEntries(
  Object.entries(VEHICLE_VISUAL_PROFILES).map(([modelId, profile]) => [
    modelId,
    createRecord(modelId, profile)
  ])
));

export function getBlueprintCalibrationRecord(modelId) {
  const record = BLUEPRINT_CALIBRATION_RECORDS[modelId];
  if (!record) throw new Error(`Unknown blueprint calibration record: ${modelId}`);
  return record;
}
