import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import { getVehicleVisualProfile } from '../src/world/vehicles/VehicleVisualProfiles.js';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import { renderVehicleSilhouetteSvg } from '../src/calibration/SoftwareSilhouette.js';

const [
  modelId = 'fr_somua',
  view = 'side',
  output = 'screenshots/fr_somua-side-silhouette.svg',
  lod = 'high'
] = process.argv.slice(2);

const profile = getVehicleVisualProfile(modelId);
const model = UnitFactory.createTankMesh(
  modelId,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
);
detachNestedProxyMeshes(model);
setCalibrationLodVisibility(model, lod);
const result = renderVehicleSilhouetteSvg(model, profile.dimensionsMeters, view);
const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, result.svg, 'utf8');
await writeFile(
  outputPath.replace(/\.svg$/i, '.json'),
  `${JSON.stringify({ modelId, lod, ...result.manifest }, null, 2)}\n`,
  'utf8'
);
console.log(`${modelId} ${view} ${lod}: ${result.manifest.triangleCount} triangles -> ${outputPath}`);
