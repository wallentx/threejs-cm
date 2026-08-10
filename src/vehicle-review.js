import {
  FRANCE_1940_CALIBRATION_REFERENCES,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from './content/france1940/render/index.js';
import { BLUEPRINT_CALIBRATION_RECORDS } from './calibration/BlueprintCalibrationRecords.js';
import {
  createImageTransform,
  createOrthographicFrame,
  fitImageTransformToLandmarks,
  sourceNormalizedToCanvas,
  viewMetersToCanvas,
  worldToViewMeters
} from './calibration/CalibrationMath.js';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from './calibration/CalibrationModel.js';
import {
  SILHOUETTE_REVIEW_MODES,
  compareSilhouetteMasks,
  composeSilhouetteReviewPixels,
  createLineArtSilhouetteMask,
  resolveLineArtMaskCanvasPolicy,
  resolveSilhouetteReviewOpacity
} from './calibration/SilhouetteComparison.js';
import { renderVehicleSilhouetteMask } from './calibration/SoftwareSilhouette.js';
import { createVehicleOwnedRegistrations } from './calibration/VehicleOwnedRegistration.js';
import {
  resolveWeaponReviewContentViewport,
  resolveWeaponReviewMaximizedView,
  resolveWeaponReviewViewportMetrics
} from './debug/WeaponReviewLayout.js';
import { UnitFactory } from './world/UnitFactory.js';

const REVIEW_WIDTH = 900;
const REVIEW_HEIGHT = 700;
const VIEWS = Object.freeze(['side', 'top', 'front', 'rear']);
const LOD_TIERS = Object.freeze(['high', 'medium', 'core', 'proxy']);

const toolbar = document.getElementById('controls');
const grid = document.getElementById('grid');
const safeAreaProbe = document.getElementById('safe-area-probe');
const vehicleSelect = document.getElementById('vehicle-select');
const lodSelect = document.getElementById('lod-select');
const modeSelect = document.getElementById('render-mode-select');
const modelOpacityInput = document.getElementById('model-opacity');
const modelOpacityOutput = document.getElementById('model-opacity-output');
const panels = Object.fromEntries(VIEWS.map(view => {
  const root = document.querySelector(`[data-view="${view}"]`);
  return [view, {
    root,
    canvas: root.querySelector('.view-canvas'),
    score: root.querySelector('.view-score'),
    sourceRgba: null,
    modelRgba: null,
    comparison: null
  }];
}));

const params = new URLSearchParams(window.location.search);
let modelId = BLUEPRINT_CALIBRATION_RECORDS[params.get('vehicle')]
  ? params.get('vehicle')
  : vehicleSelect.value;
let lodTier = LOD_TIERS.includes(params.get('lod')) ? params.get('lod') : 'high';
let reviewMode = SILHOUETTE_REVIEW_MODES.includes(params.get('mode'))
  ? params.get('mode')
  : 'difference';
const queryModelOpacity = params.get('modelOpacity');
let modelOpacity = resolveSilhouetteReviewOpacity(queryModelOpacity);
let currentModel = null;
let currentImage = null;
let registrations = null;
let maximizedViewId = null;
let viewportLayoutFrame = null;
let viewportSettleTimeouts = [];

vehicleSelect.value = modelId;
lodSelect.value = lodTier;
modeSelect.value = reviewMode;
modelOpacityInput.value = String(modelOpacity);
modelOpacityOutput.value = modelOpacity.toFixed(2);

function readViewportMetrics() {
  return resolveWeaponReviewViewportMetrics({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    documentWidth: document.documentElement.clientWidth,
    documentHeight: document.documentElement.clientHeight,
    visualViewport: window.visualViewport
  });
}

function applyViewportLayout() {
  viewportLayoutFrame = null;
  const viewport = readViewportMetrics();
  const style = document.documentElement.style;
  style.setProperty('--review-viewport-left', `${viewport.offsetLeft}px`);
  style.setProperty('--review-viewport-top', `${viewport.offsetTop}px`);
  style.setProperty('--review-viewport-width', `${viewport.width}px`);
  style.setProperty('--review-viewport-height', `${viewport.height}px`);
  const content = resolveWeaponReviewContentViewport(
    viewport,
    toolbar.getBoundingClientRect().bottom,
    safeAreaProbe.getBoundingClientRect().height
  );
  style.setProperty('--review-content-top', `${content.top}px`);
  style.setProperty('--review-content-height', `${content.height}px`);
  document.body.dataset.viewportWidth = String(Math.round(viewport.width));
  document.body.dataset.viewportHeight = String(Math.round(viewport.height));
}

function scheduleViewportLayout(settle = false) {
  if (viewportLayoutFrame === null) {
    viewportLayoutFrame = requestAnimationFrame(applyViewportLayout);
  }
  if (!settle) return;
  for (const timeout of viewportSettleTimeouts) clearTimeout(timeout);
  viewportSettleTimeouts = [120, 360].map(delay => (
    setTimeout(() => scheduleViewportLayout(false), delay)
  ));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Could not load ${url}`)), {
      once: true
    });
    image.src = url;
  });
}

function fittedImageTransform(record, registration, view) {
  const baseline = createImageTransform({
    imageWidth: currentImage.naturalWidth,
    imageHeight: currentImage.naturalHeight,
    canvasWidth: REVIEW_WIDTH,
    canvasHeight: REVIEW_HEIGHT,
    crop: registration.crop,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDegrees: registration.rotationDegrees ?? 0,
    mirrorX: registration.mirrorX
  });
  const frame = createOrthographicFrame(
    record.dimensionsMeters,
    view,
    REVIEW_WIDTH / REVIEW_HEIGHT
  );
  const fitLandmarkIds = registration.fitLandmarkIds
    ? new Set(registration.fitLandmarkIds)
    : null;
  const matching = record.landmarks.filter(landmark => (
    landmark.views.includes(view)
    && registration.landmarks[landmark.id]
    && (!fitLandmarkIds || fitLandmarkIds.has(landmark.id))
  ));
  if (matching.length < 2) {
    throw new Error(`${view} review requires at least two registered landmarks`);
  }
  const fit = fitImageTransformToLandmarks(
    matching.map(landmark => sourceNormalizedToCanvas(
      registration.landmarks[landmark.id],
      baseline,
      currentImage.naturalWidth,
      currentImage.naturalHeight
    )),
    matching.map(landmark => viewMetersToCanvas(
      worldToViewMeters(landmark.world, view),
      frame,
      REVIEW_WIDTH,
      REVIEW_HEIGHT
    )),
    { x: REVIEW_WIDTH * 0.5, y: REVIEW_HEIGHT * 0.5 },
    {
      independentAxes: true,
      rotationDegrees: registration.rotationDegrees ?? 0
    }
  );
  return createImageTransform({
    imageWidth: currentImage.naturalWidth,
    imageHeight: currentImage.naturalHeight,
    canvasWidth: REVIEW_WIDTH,
    canvasHeight: REVIEW_HEIGHT,
    crop: registration.crop,
    scaleX: fit.scaleX,
    scaleY: fit.scaleY,
    offsetX: fit.offsetX,
    offsetY: fit.offsetY,
    rotationDegrees: registration.rotationDegrees ?? 0,
    mirrorX: registration.mirrorX
  });
}

function createSourceMask(record, registration, view) {
  if (registration.sourceMask?.mode !== 'line-art-fill') {
    throw new Error(`${record.designation} ${view} view has no line-art mask policy`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = REVIEW_WIDTH;
  canvas.height = REVIEW_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const transform = fittedImageTransform(record, registration, view);
  context.save();
  context.translate(transform.centerX, transform.centerY);
  context.rotate(transform.rotation);
  context.scale(transform.mirrorX ? -1 : 1, 1);
  context.drawImage(
    currentImage,
    transform.sourceX,
    transform.sourceY,
    transform.sourceWidth,
    transform.sourceHeight,
    -transform.drawWidth * 0.5,
    -transform.drawHeight * 0.5,
    transform.drawWidth,
    transform.drawHeight
  );
  context.restore();
  return createLineArtSilhouetteMask(
    context.getImageData(0, 0, REVIEW_WIDTH, REVIEW_HEIGHT).data,
    REVIEW_WIDTH,
    REVIEW_HEIGHT,
    resolveLineArtMaskCanvasPolicy(
      registration.sourceMask,
      transform,
      currentImage.naturalWidth,
      currentImage.naturalHeight
    )
  );
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('vehicle', modelId);
  url.searchParams.set('lod', lodTier);
  url.searchParams.set('mode', reviewMode);
  url.searchParams.set('modelOpacity', modelOpacity.toFixed(2));
  window.history.replaceState(null, '', url);
}

function renderPanels() {
  for (const view of VIEWS) {
    const panel = panels[view];
    if (!panel.sourceRgba || !panel.modelRgba || !panel.comparison) continue;
    const pixels = composeSilhouetteReviewPixels(
      panel.sourceRgba,
      panel.modelRgba,
      REVIEW_WIDTH,
      REVIEW_HEIGHT,
      reviewMode,
      { modelOpacity }
    );
    panel.canvas.getContext('2d').putImageData(
      new ImageData(pixels, REVIEW_WIDTH, REVIEW_HEIGHT),
      0,
      0
    );
    const score = panel.comparison;
    panel.score.textContent = [
      `IoU ${(score.iou * 100).toFixed(2)}%`,
      `source-only ${score.sourceOnlyPixels.toLocaleString()}`,
      `model-only ${score.modelOnlyPixels.toLocaleString()}`
    ].join(' | ');
    document.body.dataset[`${view}Iou`] = score.iou.toFixed(6);
    document.body.dataset[`${view}SourceOnlyPixels`] = String(score.sourceOnlyPixels);
    document.body.dataset[`${view}ModelOnlyPixels`] = String(score.modelOnlyPixels);
  }
  document.body.dataset.vehicleReviewMode = reviewMode;
  document.body.dataset.vehicleReviewLod = lodTier;
}

function rebuildModelMasks(record) {
  setCalibrationLodVisibility(currentModel, lodTier);
  currentModel.updateMatrixWorld(true);
  for (const view of VIEWS) {
    const panel = panels[view];
    panel.modelRgba = renderVehicleSilhouetteMask(
      currentModel,
      record.dimensionsMeters,
      view,
      { width: REVIEW_WIDTH, height: REVIEW_HEIGHT }
    ).rgba;
    panel.comparison = compareSilhouetteMasks(
      panel.sourceRgba,
      panel.modelRgba,
      REVIEW_WIDTH,
      REVIEW_HEIGHT
    );
  }
  renderPanels();
}

async function loadVehicle(nextModelId) {
  document.body.dataset.gameStatus = 'loading';
  modelId = nextModelId;
  const record = BLUEPRINT_CALIBRATION_RECORDS[modelId];
  if (!record) throw new Error(`Unknown vehicle review model: ${modelId}`);
  currentModel = UnitFactory.createTankMesh(modelId, FRANCE_1940_VEHICLE_MESH_FACTORIES);
  detachNestedProxyMeshes(currentModel);
  currentModel.position.set(0, 0, 0);
  currentModel.rotation.set(0, 0, 0);
  currentModel.updateMatrixWorld(true);
  registrations = createVehicleOwnedRegistrations(currentModel, record, {
    referenceRegistry: FRANCE_1940_CALIBRATION_REFERENCES
  });
  const imageUrl = registrations.side.imageUrl;
  if (!imageUrl || !VIEWS.every(view => registrations[view].imageUrl === imageUrl)) {
    throw new Error(`${record.designation} requires one registered four-view raster`);
  }
  currentImage = await loadImage(imageUrl);
  for (const view of VIEWS) {
    panels[view].sourceRgba = createSourceMask(record, registrations[view], view);
  }
  rebuildModelMasks(record);
  document.body.dataset.gameStatus = 'ready';
  document.body.dataset.rendererBackend = 'cpu-silhouette';
  document.body.dataset.vehicleReviewModel = modelId;
  updateUrl();
}

function applyMaximizedView(nextViewId) {
  maximizedViewId = nextViewId;
  grid.classList.toggle('is-maximized', nextViewId !== null);
  document.body.classList.toggle('has-maximized-view', nextViewId !== null);
  for (const panel of Object.values(panels)) {
    const maximized = panel.root.id === nextViewId;
    panel.root.classList.toggle('is-maximized', maximized);
    const button = panel.root.querySelector('.view-fullscreen-button');
    button.textContent = maximized ? 'Exit' : 'Full';
    button.setAttribute('aria-pressed', String(maximized));
  }
  if (nextViewId) document.body.dataset.maximizedView = nextViewId;
  else delete document.body.dataset.maximizedView;
  scheduleViewportLayout(true);
}

async function toggleMaximizedView(requestedViewId) {
  const nextViewId = resolveWeaponReviewMaximizedView(
    maximizedViewId,
    requestedViewId,
    VIEWS.map(view => panels[view].root.id)
  );
  applyMaximizedView(nextViewId);
  try {
    if (nextViewId && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else if (!nextViewId && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // CSS maximization remains the fallback when native fullscreen is blocked.
  }
}

vehicleSelect.addEventListener('change', () => {
  void loadVehicle(vehicleSelect.value).catch(handleFailure);
});
lodSelect.addEventListener('change', () => {
  lodTier = LOD_TIERS.includes(lodSelect.value) ? lodSelect.value : 'high';
  rebuildModelMasks(BLUEPRINT_CALIBRATION_RECORDS[modelId]);
  updateUrl();
});
modeSelect.addEventListener('change', () => {
  reviewMode = SILHOUETTE_REVIEW_MODES.includes(modeSelect.value)
    ? modeSelect.value
    : 'difference';
  renderPanels();
  updateUrl();
});
modelOpacityInput.addEventListener('input', () => {
  modelOpacity = Math.max(0, Math.min(1, Number(modelOpacityInput.value)));
  modelOpacityOutput.value = modelOpacity.toFixed(2);
  renderPanels();
  updateUrl();
});
for (const button of document.querySelectorAll('.view-fullscreen-button')) {
  button.addEventListener('click', () => toggleMaximizedView(button.dataset.viewId));
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && maximizedViewId) applyMaximizedView(null);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && maximizedViewId && !document.fullscreenElement) {
    applyMaximizedView(null);
  }
});

function handleFailure(error) {
  document.body.dataset.gameStatus = 'error';
  document.body.dataset.gameError = error instanceof Error ? error.message : String(error);
  console.error('[vehicle-review] Failed to initialize.', error);
}

applyViewportLayout();
const toolbarResizeObserver = new ResizeObserver(() => scheduleViewportLayout(false));
toolbarResizeObserver.observe(toolbar);
const resizeViewport = () => scheduleViewportLayout(true);
window.addEventListener('resize', resizeViewport);
window.addEventListener('orientationchange', resizeViewport);
window.visualViewport?.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('scroll', resizeViewport);
window.addEventListener('pagehide', () => {
  if (viewportLayoutFrame !== null) cancelAnimationFrame(viewportLayoutFrame);
  for (const timeout of viewportSettleTimeouts) clearTimeout(timeout);
  toolbarResizeObserver.disconnect();
});

loadVehicle(modelId).catch(handleFailure);
