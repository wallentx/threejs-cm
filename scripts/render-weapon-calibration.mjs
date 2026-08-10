import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { createFrance1940InfantryWeaponRig } from '../src/content/france1940/render/France1940InfantryWeaponFactory.js';
import { BERTHIER_M1892_M16_VISUAL_DATA } from '../src/content/france1940/render/BerthierM1892M16VisualData.js';
import { KAR98K_VISUAL_DATA } from '../src/content/france1940/render/Kar98kVisualData.js';
import { MAS36_VISUAL_DATA } from '../src/content/france1940/render/Mas36VisualData.js';
import {
  collectWeaponSideSilhouetteTriangles,
  compareWeaponSilhouetteMasks,
  isolateConnectedAlphaComponent
} from '../src/debug/WeaponSilhouetteCalibration.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CALIBRATION_TARGETS = Object.freeze({
  mas36: Object.freeze({ weaponName: 'MAS-36 Rifle', data: MAS36_VISUAL_DATA }),
  berthier1892m16: Object.freeze({
    weaponName: 'Berthier Mousqueton Mle 1892 M16',
    data: BERTHIER_M1892_M16_VISUAL_DATA
  }),
  kar98k: Object.freeze({ weaponName: 'Kar98k', data: KAR98K_VISUAL_DATA })
});

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function runMagick(args, input = undefined) {
  const result = spawnSync('magick', args, {
    cwd: repositoryRoot,
    input,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024
  });
  if (result.error) {
    throw new Error(`ImageMagick could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ImageMagick failed: ${result.stderr.toString('utf8').trim()}`);
  }
  return result.stdout;
}

function modelSvg(projection) {
  const paths = projection.triangles.map(triangle => (
    `<path d="M${triangle[0].x.toFixed(3)},${triangle[0].y.toFixed(3)}`
    + `L${triangle[1].x.toFixed(3)},${triangle[1].y.toFixed(3)}`
    + `L${triangle[2].x.toFixed(3)},${triangle[2].y.toFixed(3)}Z"/>`
  )).join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${projection.width}" height="${projection.height}" viewBox="0 0 ${projection.width} ${projection.height}">`
    + `<g fill="#000000" stroke="none">${paths}</g></svg>`,
    'utf8'
  );
}

function writeRgbaPng(rgba, width, height, outputPath) {
  runMagick([
    '-size', `${width}x${height}`,
    '-depth', '8',
    'rgba:-',
    outputPath
  ], Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
}

function createOverlay(source, model, width, height) {
  const output = new Uint8ClampedArray(source.length);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const sourceAlpha = source[offset + 3];
    const modelAlpha = model[offset + 3];
    if (sourceAlpha > 8) {
      output[offset] = source[offset];
      output[offset + 1] = source[offset + 1];
      output[offset + 2] = source[offset + 2];
      output[offset + 3] = 150;
    }
    if (modelAlpha > 8) {
      if (sourceAlpha > 8) {
        output[offset] = Math.round(output[offset] * 0.42);
        output[offset + 1] = Math.round(output[offset + 1] * 0.42);
        output[offset + 2] = Math.round(output[offset + 2] * 0.42);
        output[offset + 3] = 245;
      } else {
        output[offset] = 6;
        output[offset + 1] = 182;
        output[offset + 2] = 212;
        output[offset + 3] = 215;
      }
    }
  }
  return output;
}

function renderReferenceMask(registration, projection, visualData) {
  const crop = registration.cropPixels;
  const cropWidth = registration.imageSize[0] - crop.left - crop.right;
  const cropHeight = registration.imageSize[1] - crop.top - crop.bottom;
  const sourcePath = path.resolve(repositoryRoot, visualData.source.localPath);
  const args = [
    '-background', 'none',
    '-density', '384',
    sourcePath,
    '-resize', `${registration.imageSize[0]}x${registration.imageSize[1]}!`,
    '-crop', `${cropWidth}x${cropHeight}+${crop.left}+${crop.top}`,
    '+repage'
  ];
  if (visualData.sourceMask?.mode === 'edge-flood') {
    args.push(
      '-bordercolor', visualData.sourceMask.borderColor,
      '-border', '1x1',
      '-alpha', 'set',
      '-channel', 'RGBA',
      '-fuzz', `${visualData.sourceMask.fuzzPercent}%`,
      '-fill', 'none',
      '-draw', 'color 0,0 floodfill',
      '+channel',
      '-shave', '1x1'
    );
  }
  args.push(
    '-resize', `${projection.width}x${projection.height}!`,
    '-depth', '8',
    'rgba:-'
  );
  const buffer = runMagick(args);
  const rgba = new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const seedX = (
    (registration.componentSeedPixel[0] - crop.left) / cropWidth
  ) * projection.width;
  const seedY = (
    (registration.componentSeedPixel[1] - crop.top) / cropHeight
  ) * projection.height;
  isolateConnectedAlphaComponent(
    rgba,
    projection.width,
    projection.height,
    seedX,
    seedY
  );
  return rgba;
}

const outputDirectory = path.resolve(readOption(
  '--output',
  path.join(process.env.TMPDIR || os.tmpdir(), 'threejs-cm-weapon-calibration')
));
const label = readOption('--label', 'current').replace(/[^a-zA-Z0-9_-]+/g, '-');
const targetId = readOption('--weapon', 'mas36').toLowerCase().replace(/[^a-z0-9]+/g, '');
const target = CALIBRATION_TARGETS[targetId];
if (!target) {
  throw new Error(`Unknown calibration weapon "${targetId}". Expected: ${Object.keys(CALIBRATION_TARGETS).join(', ')}`);
}
const { weaponName, data: visualData } = target;
fs.mkdirSync(outputDirectory, { recursive: true });

const materials = {
  wood: new THREE.MeshBasicMaterial(),
  metal: new THREE.MeshBasicMaterial()
};
const rig = createFrance1940InfantryWeaponRig(weaponName, materials);
const model = rig.userData.weaponModel;
rig.remove(model);
const registration = visualData.silhouetteCalibration.side;
const projection = collectWeaponSideSilhouetteTriangles(model, registration);
const referenceRgba = renderReferenceMask(registration, projection, visualData);
const modelBuffer = runMagick([
  '-background', 'none',
  'svg:-',
  '-resize', `${projection.width}x${projection.height}!`,
  '-depth', '8',
  'rgba:-'
], modelSvg(projection));
const modelRgba = new Uint8ClampedArray(
  modelBuffer.buffer,
  modelBuffer.byteOffset,
  modelBuffer.byteLength
);
const comparison = compareWeaponSilhouetteMasks(
  referenceRgba,
  modelRgba,
  projection.width,
  projection.height
);
const files = {
  source: path.join(outputDirectory, `${label}-source.png`),
  model: path.join(outputDirectory, `${label}-model.png`),
  difference: path.join(outputDirectory, `${label}-difference.png`),
  overlay: path.join(outputDirectory, `${label}-overlay.png`),
  metrics: path.join(outputDirectory, `${label}-metrics.json`)
};
writeRgbaPng(referenceRgba, projection.width, projection.height, files.source);
writeRgbaPng(modelRgba, projection.width, projection.height, files.model);
writeRgbaPng(comparison.pixels, projection.width, projection.height, files.difference);
writeRgbaPng(
  createOverlay(referenceRgba, modelRgba, projection.width, projection.height),
  projection.width,
  projection.height,
  files.overlay
);
const manifest = {
  weapon: weaponName,
  view: 'side +X',
  output: { width: projection.width, height: projection.height },
  lockedRegistration: {
    overallLengthMeters: visualData.visualSpec.overallLength,
    buttPixelX: registration.buttPixelX,
    muzzlePixelX: registration.muzzlePixelX,
    barrelAxisPixelY: registration.barrelAxisPixelY,
    metresPerSourcePixel: registration.metresPerSourcePixel
  },
  triangleCount: projection.triangles.length,
  sourcePixels: comparison.sourcePixels,
  modelPixels: comparison.modelPixels,
  overlapPixels: comparison.overlapPixels,
  sourceOnlyPixels: comparison.sourceOnlyPixels,
  modelOnlyPixels: comparison.modelOnlyPixels,
  unionPixels: comparison.unionPixels,
  iou: comparison.iou,
  files
};
fs.writeFileSync(files.metrics, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

model.traverse(object => object.geometry?.dispose());
materials.wood.dispose();
materials.metal.dispose();
