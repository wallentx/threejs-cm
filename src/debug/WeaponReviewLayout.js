import {
  CALIBRATION_VIEWS,
  assertCalibrationView,
  worldToViewMeters
} from '../calibration/CalibrationMath.js';

const MINIMUM_SPAN_METERS = 0.04;
const PINCH_SCALE_DEAD_ZONE = 0.035;
const PINCH_ROTATION_DEAD_ZONE_RADIANS = 3 * Math.PI / 180;
const MAX_BLUEPRINT_FILE_BYTES = 32 * 1024 * 1024;
const MAX_SVG_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_OVERLAY_STATE = Object.freeze({
  opacity: 0.65,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDegrees: 0,
  mirrorX: false,
  crop: Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 })
});

export const WEAPON_REVIEW_RENDER_MODES = Object.freeze([
  'overlay',
  'difference',
  'silhouette',
  'wireframe',
  'shaded'
]);

export const WEAPON_REVIEW_CAMERA_POSES = Object.freeze({
  side: Object.freeze({
    cameraAxis: CALIBRATION_VIEWS.side.cameraAxis,
    screenAxes: CALIBRATION_VIEWS.side.screenAxes,
    positionAxis: Object.freeze([1, 0, 0]),
    up: Object.freeze([0, 1, 0])
  }),
  front: Object.freeze({
    cameraAxis: CALIBRATION_VIEWS.front.cameraAxis,
    screenAxes: CALIBRATION_VIEWS.front.screenAxes,
    positionAxis: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0])
  }),
  top: Object.freeze({
    cameraAxis: CALIBRATION_VIEWS.top.cameraAxis,
    screenAxes: CALIBRATION_VIEWS.top.screenAxes,
    positionAxis: Object.freeze([0, 1, 0]),
    up: Object.freeze([0, 0, 1])
  })
});

const AXIS_VIEW_LABELS = Object.freeze({
  side: Object.freeze({
    1: Object.freeze({ label: 'SIDE | +X camera | -Z / +Y', flipLabel: 'Other side' }),
    '-1': Object.freeze({ label: 'OPPOSITE SIDE | -X camera | +Z / +Y', flipLabel: 'Side' })
  }),
  front: Object.freeze({
    1: Object.freeze({ label: 'FRONT | +Z camera | +X / +Y', flipLabel: 'Back' }),
    '-1': Object.freeze({ label: 'BACK | -Z camera | -X / +Y', flipLabel: 'Front' })
  }),
  top: Object.freeze({
    1: Object.freeze({ label: 'TOP | +Y camera | -X / +Z', flipLabel: 'Bottom' }),
    '-1': Object.freeze({ label: 'BOTTOM | -Y camera | +X / +Z', flipLabel: 'Top' })
  })
});

function assertBounds(bounds) {
  if (!bounds || bounds.min?.length !== 3 || bounds.max?.length !== 3) {
    throw new Error('Weapon review bounds require min and max XYZ arrays');
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (!Number.isFinite(bounds.min[axis]) || !Number.isFinite(bounds.max[axis])) {
      throw new Error('Weapon review bounds must contain finite coordinates');
    }
    if (bounds.max[axis] < bounds.min[axis]) {
      throw new Error('Weapon review bounds max must not be below min');
    }
  }
}

function getBoundsCenter(bounds) {
  return bounds.min.map((minimum, axis) => (minimum + bounds.max[axis]) * 0.5);
}

function getBoundsCorners(bounds) {
  const corners = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

function finiteClamped(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

function positiveFinite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveWeaponReviewViewportMetrics(source = {}) {
  const visualViewport = source.visualViewport ?? {};
  const width = positiveFinite(visualViewport.width)
    ?? positiveFinite(source.documentWidth)
    ?? positiveFinite(source.innerWidth)
    ?? 1;
  const height = positiveFinite(visualViewport.height)
    ?? positiveFinite(source.documentHeight)
    ?? positiveFinite(source.innerHeight)
    ?? 1;
  const offsetLeft = Number.isFinite(Number(visualViewport.offsetLeft))
    ? Number(visualViewport.offsetLeft)
    : 0;
  const offsetTop = Number.isFinite(Number(visualViewport.offsetTop))
    ? Number(visualViewport.offsetTop)
    : 0;
  return Object.freeze({ width, height, offsetLeft, offsetTop });
}

export function resolveWeaponReviewContentViewport(
  viewport,
  toolbarBottom,
  safeAreaBottom = 0,
  gap = 8
) {
  const height = positiveFinite(viewport?.height) ?? 1;
  const relativeToolbarBottom = Number.isFinite(Number(toolbarBottom))
    ? Number(toolbarBottom) - (Number(viewport?.offsetTop) || 0)
    : 0;
  const contentTop = Math.max(0, Math.min(height - 1, relativeToolbarBottom + gap));
  const bottomInset = Math.max(0, Math.min(height - contentTop - 1, Number(safeAreaBottom) || 0));
  return Object.freeze({
    top: contentTop,
    height: Math.max(1, height - contentTop - bottomInset),
    bottomInset
  });
}

export function resolveWeaponReviewBlueprintFileKind(file = {}) {
  const name = String(file.name ?? '').trim().toLowerCase();
  const type = String(file.type ?? '').trim().toLowerCase();
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size < 0 || size > MAX_BLUEPRINT_FILE_BYTES) {
    throw new Error('Blueprint file must be 32 MB or smaller');
  }
  if (type === 'image/svg+xml' || name.endsWith('.svg')) {
    if (size > MAX_SVG_FILE_BYTES) throw new Error('SVG blueprint must be 5 MB or smaller');
    return 'svg';
  }
  if (
    ['image/png', 'image/jpeg', 'image/webp'].includes(type)
    || /\.(png|jpe?g|webp)$/.test(name)
  ) return 'raster';
  throw new Error('Blueprint must be PNG, JPEG, WebP, or SVG');
}

export function resolveWeaponReviewSvgRasterSize(
  sourceWidth,
  sourceHeight,
  pixelRatio = 1,
  { minimumLongEdge = 2048, maximumLongEdge = 4096 } = {}
) {
  const width = positiveFinite(sourceWidth);
  const height = positiveFinite(sourceHeight);
  if (!width || !height) throw new Error('SVG blueprint requires positive dimensions');
  const longEdge = Math.max(width, height);
  const requestedLongEdge = Math.max(minimumLongEdge, longEdge * Math.max(1, pixelRatio));
  const targetLongEdge = Math.min(maximumLongEdge, requestedLongEdge);
  const scale = targetLongEdge / longEdge;
  return Object.freeze({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  });
}

function normalizeCropPair(first, second) {
  const normalizedFirst = finiteClamped(first, 0, 0, 0.95);
  const normalizedSecond = finiteClamped(second, 0, 0, 0.95);
  const sum = normalizedFirst + normalizedSecond;
  if (sum <= 0.95) return [normalizedFirst, normalizedSecond];
  const factor = 0.95 / sum;
  return [normalizedFirst * factor, normalizedSecond * factor];
}

export function normalizeWeaponReviewOverlayState(source = {}) {
  const crop = source.crop ?? {};
  const [left, right] = normalizeCropPair(crop.left, crop.right);
  const [top, bottom] = normalizeCropPair(crop.top, crop.bottom);
  return Object.freeze({
    opacity: finiteClamped(source.opacity, DEFAULT_OVERLAY_STATE.opacity, 0, 1),
    scale: finiteClamped(source.scale, DEFAULT_OVERLAY_STATE.scale, 0.05, 10),
    offsetX: finiteClamped(source.offsetX, DEFAULT_OVERLAY_STATE.offsetX, -5, 5),
    offsetY: finiteClamped(source.offsetY, DEFAULT_OVERLAY_STATE.offsetY, -5, 5),
    rotationDegrees: finiteClamped(
      source.rotationDegrees,
      DEFAULT_OVERLAY_STATE.rotationDegrees,
      -180,
      180
    ),
    mirrorX: Boolean(source.mirrorX),
    crop: Object.freeze({ left, top, right, bottom })
  });
}

export function createWeaponReviewTextureWindow(source = {}) {
  const state = normalizeWeaponReviewOverlayState(source);
  const visibleWidth = 1 - state.crop.left - state.crop.right;
  const visibleHeight = 1 - state.crop.top - state.crop.bottom;
  return Object.freeze({
    repeat: Object.freeze([
      state.mirrorX ? -visibleWidth : visibleWidth,
      visibleHeight
    ]),
    offset: Object.freeze([
      state.mirrorX ? 1 - state.crop.right : state.crop.left,
      state.crop.bottom
    ]),
    visibleWidth,
    visibleHeight
  });
}

export function resolveWeaponReviewBlueprintPreset(bounds, preset, cameraDirection = 1) {
  assertBounds(bounds);
  assertCalibrationView(preset?.view);
  if (cameraDirection !== 1 && cameraDirection !== -1) {
    throw new Error('Weapon review camera direction must be 1 or -1');
  }
  const imageWidth = positiveFinite(preset.imageSize?.[0]);
  const imageHeight = positiveFinite(preset.imageSize?.[1]);
  const metresPerSourcePixel = positiveFinite(preset.metresPerSourcePixel);
  const planeCenter = preset.planeCenter;
  if (!imageWidth || !imageHeight || !metresPerSourcePixel) {
    throw new Error('Weapon review blueprint preset requires image size and scale');
  }
  if (!Array.isArray(planeCenter) || planeCenter.length !== 3 || planeCenter.some(value => !Number.isFinite(value))) {
    throw new Error('Weapon review blueprint preset requires a finite XYZ plane center');
  }

  const cropPixels = preset.cropPixels ?? {};
  const left = finiteClamped(cropPixels.left, 0, 0, imageWidth - 1);
  const top = finiteClamped(cropPixels.top, 0, 0, imageHeight - 1);
  const right = finiteClamped(cropPixels.right, 0, 0, imageWidth - left - 1);
  const bottom = finiteClamped(cropPixels.bottom, 0, 0, imageHeight - top - 1);
  const cropWidthPixels = imageWidth - left - right;
  const cropHeightPixels = imageHeight - top - bottom;
  const center = getBoundsCenter(bounds);
  let offsetX = 0;
  let offsetY = 0;
  if (preset.view === 'side') {
    offsetX = (center[2] - planeCenter[2]) / cameraDirection;
    offsetY = planeCenter[1] - center[1];
  } else if (preset.view === 'top') {
    offsetX = (center[0] - planeCenter[0]) / cameraDirection;
    offsetY = planeCenter[2] - center[2];
  } else {
    offsetX = (planeCenter[0] - center[0]) / cameraDirection;
    offsetY = planeCenter[1] - center[1];
  }

  return Object.freeze({
    sourceCrop: Object.freeze({
      left: left / imageWidth,
      top: top / imageHeight,
      right: right / imageWidth,
      bottom: bottom / imageHeight
    }),
    physicalSize: Object.freeze([
      cropWidthPixels * metresPerSourcePixel,
      cropHeightPixels * metresPerSourcePixel
    ]),
    state: normalizeWeaponReviewOverlayState({
      opacity: preset.opacity,
      scale: cropHeightPixels * metresPerSourcePixel,
      offsetX,
      offsetY,
      rotationDegrees: preset.rotationDegrees,
      mirrorX: preset.mirrorX,
      crop: { left: 0, top: 0, right: 0, bottom: 0 }
    })
  });
}

export function resolveWeaponReviewModelOpacity(value, mode) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  if (mode === 'overlay') return 0.72;
  if (mode === 'shaded') return 1;
  return 0.94;
}

export function applyWeaponReviewBlueprintTouchGesture(state, gesture) {
  const [viewportWidth, viewportHeight] = gesture.viewportPixels ?? [];
  const [frameWidth, frameHeight] = gesture.frameMeters ?? [];
  const [deltaX = 0, deltaY = 0] = gesture.deltaPixels ?? [];
  if (!(viewportWidth > 0 && viewportHeight > 0 && frameWidth > 0 && frameHeight > 0)) {
    throw new Error('Weapon review touch gesture requires positive viewport and frame dimensions');
  }
  const scaleRatio = Number.isFinite(gesture.scaleRatio) && gesture.scaleRatio > 0
    ? gesture.scaleRatio
    : 1;
  const rotationDeltaRadians = Number.isFinite(gesture.rotationDeltaRadians)
    ? gesture.rotationDeltaRadians
    : 0;
  return normalizeWeaponReviewOverlayState({
    ...state,
    scale: state.scale * scaleRatio,
    offsetX: state.offsetX + (deltaX / viewportWidth) * frameWidth,
    offsetY: state.offsetY - (deltaY / viewportHeight) * frameHeight,
    rotationDegrees: state.rotationDegrees + rotationDeltaRadians * 180 / Math.PI,
    crop: state.crop
  });
}

export function resolveWeaponReviewPinchGesture(
  scaleRatio,
  rotationDeltaRadians,
  currentIntent = 'pending'
) {
  if (!['pending', 'scale', 'rotate'].includes(currentIntent)) {
    throw new Error(`Unknown weapon review pinch intent: ${currentIntent}`);
  }
  const ratio = Number.isFinite(scaleRatio) && scaleRatio > 0 ? scaleRatio : 1;
  const rotation = Number.isFinite(rotationDeltaRadians) ? rotationDeltaRadians : 0;
  let intent = currentIntent;
  if (intent === 'pending') {
    const scaleScore = Math.abs(Math.log(ratio)) / PINCH_SCALE_DEAD_ZONE;
    const rotationScore = Math.abs(rotation) / PINCH_ROTATION_DEAD_ZONE_RADIANS;
    if (Math.max(scaleScore, rotationScore) >= 1) {
      intent = scaleScore >= rotationScore ? 'scale' : 'rotate';
    }
  }
  return Object.freeze({
    intent,
    scaleRatio: intent === 'scale' ? ratio : 1,
    // Blueprint plane rotation is opposite the screen-space finger angle.
    rotationDeltaRadians: intent === 'rotate' ? -rotation : 0
  });
}

export function describeWeaponReviewAxisView(view, cameraDirection = 1) {
  assertCalibrationView(view);
  if (cameraDirection !== 1 && cameraDirection !== -1) {
    throw new Error('Weapon review camera direction must be 1 or -1');
  }
  return AXIS_VIEW_LABELS[view][cameraDirection];
}

export function rectToWeaponReviewViewport(rect, origin = { left: 0, top: 0 }) {
  return {
    x: rect.left - origin.left,
    y: rect.top - origin.top,
    width: rect.width,
    height: rect.height
  };
}

export function resolveWeaponReviewMaximizedView(currentViewId, requestedViewId, viewIds) {
  if (requestedViewId === null) return null;
  if (!viewIds.includes(requestedViewId)) {
    throw new Error(`Unknown weapon review view: ${requestedViewId}`);
  }
  return currentViewId === requestedViewId ? null : requestedViewId;
}

export function createWeaponReviewOrthographicFrame(
  bounds,
  view,
  aspect,
  { marginRatio = 0.16, cameraDirection = 1 } = {}
) {
  assertBounds(bounds);
  assertCalibrationView(view);
  if (!(aspect > 0)) throw new Error('Weapon review viewport aspect must be positive');
  if (cameraDirection !== 1 && cameraDirection !== -1) {
    throw new Error('Weapon review camera direction must be 1 or -1');
  }

  let minimumU = Infinity;
  let maximumU = -Infinity;
  let minimumV = Infinity;
  let maximumV = -Infinity;
  for (const corner of getBoundsCorners(bounds)) {
    const projected = worldToViewMeters(corner, view);
    minimumU = Math.min(minimumU, projected.u);
    maximumU = Math.max(maximumU, projected.u);
    minimumV = Math.min(minimumV, projected.v);
    maximumV = Math.max(maximumV, projected.v);
  }

  const margin = 1 + marginRatio * 2;
  let width = Math.max(MINIMUM_SPAN_METERS, maximumU - minimumU) * margin;
  let height = Math.max(MINIMUM_SPAN_METERS, maximumV - minimumV) * margin;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  const target = getBoundsCenter(bounds);
  const diagonal = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
  const distance = Math.max(1, diagonal * 1.5);
  const pose = WEAPON_REVIEW_CAMERA_POSES[view];

  return Object.freeze({
    view,
    target: Object.freeze(target),
    position: Object.freeze(target.map((coordinate, axis) => (
      coordinate + pose.positionAxis[axis] * distance * cameraDirection
    ))),
    up: pose.up,
    width,
    height,
    distance
  });
}

export function createWeaponReviewPerspectiveFrame(
  bounds,
  aspect,
  { fovDegrees = 45, marginRatio = 0.22 } = {}
) {
  assertBounds(bounds);
  if (!(aspect > 0)) throw new Error('Weapon review viewport aspect must be positive');

  const target = getBoundsCenter(bounds);
  const radius = Math.max(
    MINIMUM_SPAN_METERS,
    Math.hypot(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2]
    ) * 0.5
  );
  const verticalHalfFov = fovDegrees * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const distance = radius * (1 + marginRatio) / Math.sin(limitingHalfFov);

  return Object.freeze({
    target: Object.freeze(target),
    radius,
    distance,
    near: 0.005,
    far: Math.max(10, distance + radius * 4),
    fovDegrees
  });
}
