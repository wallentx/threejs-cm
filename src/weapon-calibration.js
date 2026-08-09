import * as THREE from 'three';
import { createFrance1940InfantryWeaponRig } from './content/france1940/render/France1940InfantryWeaponFactory.js';
import { MAS36_VISUAL_DATA } from './content/france1940/render/Mas36VisualData.js';
import {
  collectWeaponSideSilhouetteTriangles,
  compareWeaponSilhouetteMasks,
  isolateConnectedAlphaComponent
} from './debug/WeaponSilhouetteCalibration.js';

const referenceUrl = new URL(
  '../reference/mas36-bp/Fusil modele 1936.svg',
  import.meta.url
).href;
const registration = MAS36_VISUAL_DATA.silhouetteCalibration.side;
const canvas = document.getElementById('comparison-canvas');
const modeSelect = document.getElementById('comparison-mode');
const metrics = document.getElementById('comparison-metrics');
const sourceCanvas = document.createElement('canvas');
const modelCanvas = document.createElement('canvas');
let sourceImageData = null;
let comparison = null;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('MAS-36 SVG could not be decoded')), {
      once: true
    });
    image.src = url;
  });
}

function drawModelMask(model, projection) {
  modelCanvas.width = projection.width;
  modelCanvas.height = projection.height;
  const context = modelCanvas.getContext('2d');
  context.clearRect(0, 0, projection.width, projection.height);
  context.fillStyle = '#000000';
  for (const triangle of projection.triangles) {
    context.beginPath();
    context.moveTo(triangle[0].x, triangle[0].y);
    context.lineTo(triangle[1].x, triangle[1].y);
    context.lineTo(triangle[2].x, triangle[2].y);
    context.closePath();
    context.fill();
  }
  return context.getImageData(0, 0, projection.width, projection.height);
}

function drawComparison() {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (modeSelect.value === 'difference') {
    context.putImageData(new ImageData(comparison.pixels, canvas.width, canvas.height), 0, 0);
  } else if (modeSelect.value === 'source') {
    context.putImageData(sourceImageData, 0, 0);
  } else if (modeSelect.value === 'model') {
    context.drawImage(modelCanvas, 0, 0);
  } else {
    context.globalAlpha = 0.55;
    context.putImageData(sourceImageData, 0, 0);
    context.globalAlpha = 0.58;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(modelCanvas, 0, 0);
    context.globalAlpha = 1;
  }
}

async function initialize() {
  const materials = {
    wood: new THREE.MeshBasicMaterial(),
    metal: new THREE.MeshBasicMaterial()
  };
  // Geometry construction only: the calibration surface never creates a GPU renderer.
  const rig = createFrance1940InfantryWeaponRig('MAS-36 Rifle', materials);
  const model = rig.userData.weaponModel;
  rig.remove(model);
  const projection = collectWeaponSideSilhouetteTriangles(model, registration);
  canvas.width = projection.width;
  canvas.height = projection.height;
  sourceCanvas.width = projection.width;
  sourceCanvas.height = projection.height;

  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const image = await loadImage(referenceUrl);
  const crop = registration.cropPixels;
  const cropWidth = registration.imageSize[0] - crop.left - crop.right;
  const cropHeight = registration.imageSize[1] - crop.top - crop.bottom;
  sourceContext.drawImage(
    image,
    crop.left,
    crop.top,
    cropWidth,
    cropHeight,
    0,
    0,
    projection.width,
    projection.height
  );
  sourceImageData = sourceContext.getImageData(0, 0, projection.width, projection.height);
  const seedX = (
    (registration.componentSeedPixel[0] - crop.left) / cropWidth
  ) * projection.width;
  const seedY = (
    (registration.componentSeedPixel[1] - crop.top) / cropHeight
  ) * projection.height;
  isolateConnectedAlphaComponent(
    sourceImageData.data,
    projection.width,
    projection.height,
    seedX,
    seedY
  );
  sourceContext.putImageData(sourceImageData, 0, 0);
  const modelImageData = drawModelMask(model, projection);
  comparison = compareWeaponSilhouetteMasks(
    sourceImageData.data,
    modelImageData.data,
    projection.width,
    projection.height
  );
  metrics.textContent = [
    `IoU ${(comparison.iou * 100).toFixed(2)}%`,
    `source-only ${comparison.sourceOnlyPixels.toLocaleString()} px`,
    `model-only ${comparison.modelOnlyPixels.toLocaleString()} px`,
    `${projection.triangles.length.toLocaleString()} triangles`,
    `locked 1.020 m / bore Y=${registration.barrelAxisPixelY}px`
  ].join(' | ');
  drawComparison();
  document.body.dataset.calibrationStatus = 'ready';
  model.traverse(object => object.geometry?.dispose());
  materials.wood.dispose();
  materials.metal.dispose();
}

modeSelect.addEventListener('change', drawComparison);
initialize().catch(error => {
  document.body.dataset.calibrationStatus = 'error';
  metrics.textContent = error instanceof Error ? error.message : String(error);
  console.error('[weapon-calibration] Failed to initialize.', error);
});
