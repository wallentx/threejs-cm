import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import {
  auditModelSurfaceCoverage,
  renderModelSurfaceDiagnostic,
  surfaceAuditRgba,
  MODEL_SURFACE_AUDIT_VIEWS
} from '../src/calibration/ModelSurfaceAudit.js';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import { getVehicleVisualProfile } from '../src/world/vehicles/VehicleVisualProfiles.js';

const [
  modelId = 'fr_somua',
  output = `${process.env.TMPDIR}/model-surface-audit/${modelId}`,
  lodList = 'high,medium,core,proxy',
  size = '256'
] = process.argv.slice(2);
const outputDirectory = resolve(output);
const dimensions = getVehicleVisualProfile(modelId).dimensionsMeters;
const lods = lodList.split(',').map(value => value.trim()).filter(Boolean);
const width = Number.parseInt(size, 10);
const height = width;
if (!Number.isInteger(width) || width < 64 || width > 2048) {
  throw new RangeError(`Surface-audit size must be an integer from 64 to 2048, got ${size}`);
}
await mkdir(outputDirectory, { recursive: true });

function ppm(audit) {
  return rgbaPpm(surfaceAuditRgba(audit), audit.width, audit.height);
}

function rgbaPpm(rgba, width, height) {
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source];
    rgb[target++] = rgba[source + 1];
    rgb[target++] = rgba[source + 2];
  }
  return Buffer.concat([
    Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'),
    Buffer.from(rgb)
  ]);
}

const report = [];
for (const lod of lods) {
  const model = UnitFactory.createTankMesh(
    modelId,
    FRANCE_1940_VEHICLE_MESH_FACTORIES
  );
  detachNestedProxyMeshes(model);
  setCalibrationLodVisibility(model, lod);
  for (const view of MODEL_SURFACE_AUDIT_VIEWS) {
    const audit = auditModelSurfaceCoverage(model, dimensions, view, { width, height });
    const diagnostic = renderModelSurfaceDiagnostic(
      model,
      dimensions,
      view,
      { width, height }
    );
    const basename = `${lod}-${view.id}`;
    await writeFile(resolve(outputDirectory, `${basename}.ppm`), ppm(audit));
    await writeFile(
      resolve(outputDirectory, `${basename}-material.ppm`),
      rgbaPpm(diagnostic.rgba, diagnostic.width, diagnostic.height)
    );
    report.push({
      modelId,
      lod,
      view: view.id,
      triangleCount: audit.triangleCount,
      frontPixelCount: audit.frontPixelCount,
      twoSidedPixelCount: audit.twoSidedPixelCount,
      doubleOnlyPixelCount: audit.doubleOnlyPixelCount,
      doubleOnlyRatio: audit.doubleOnlyRatio,
      likelyAssemblies: audit.assemblyLeaks.slice(0, 5)
    });
  }
}
await writeFile(
  resolve(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);
console.log(`${report.length} fixed ${modelId} LOD/view surface audits -> ${outputDirectory}`);
console.table(report.map(({ lod, view, doubleOnlyPixelCount, doubleOnlyRatio }) => ({
  lod,
  view,
  doubleOnlyPixelCount,
  doubleOnlyPercent: (doubleOnlyRatio * 100).toFixed(2)
})));
