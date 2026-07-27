import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import {
  VEHICLE_VISUAL_PROFILES
} from '../src/world/vehicles/VehicleVisualProfiles.js';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import { renderVehicleSilhouetteSvg } from '../src/calibration/SoftwareSilhouette.js';

const output = resolve(
  process.argv[2]
    ?? `${process.env.TMPDIR ?? '.'}/vehicle-silhouette-audit.json`
);
const views = ['side', 'front', 'top'];
const lods = ['high', 'medium', 'core', 'proxy'];
const report = {
  generatedBy: 'scripts/audit-vehicle-silhouettes.mjs',
  vehicleCount: Object.keys(VEHICLE_VISUAL_PROFILES).length,
  failures: [],
  vehicles: {}
};

for (const [modelId, profile] of Object.entries(VEHICLE_VISUAL_PROFILES)) {
  const model = UnitFactory.createTankMesh(
    modelId,
    FRANCE_1940_VEHICLE_MESH_FACTORIES
  );
  detachNestedProxyMeshes(model);
  const vehicle = {
    designation: profile.designation,
    dimensionsMeters: profile.dimensionsMeters,
    views: {}
  };
  report.vehicles[modelId] = vehicle;

  for (const view of views) {
    vehicle.views[view] = {};
    for (const lod of lods) {
      setCalibrationLodVisibility(model, lod);
      const { manifest } = renderVehicleSilhouetteSvg(
        model,
        profile.dimensionsMeters,
        view,
        { width: 700, height: 450, showEnvelope: false }
      );
      vehicle.views[view][lod] = {
        triangleCount: manifest.triangleCount,
        projectedBoundsMeters: manifest.projectedBoundsMeters
      };
      if (manifest.triangleCount <= 0 || !manifest.projectedBoundsMeters) {
        report.failures.push(`${modelId}:${view}:${lod} produced no silhouette`);
      }
    }
  }
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  `${report.vehicleCount} vehicles x ${views.length} views x ${lods.length} LODs`
  + ` -> ${output}`
);
if (report.failures.length) {
  for (const failure of report.failures) console.error(failure);
  process.exitCode = 1;
}
