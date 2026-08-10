const VIEW_NAMES = Object.freeze(['side', 'front', 'rear', 'top']);

export const CALIBRATION_VIEWS = Object.freeze({
  side: Object.freeze({
    id: 'side',
    label: 'Side',
    horizontalDimension: 'length',
    verticalDimension: 'height',
    cameraAxis: '+X',
    screenAxes: '-Z / +Y'
  }),
  front: Object.freeze({
    id: 'front',
    label: 'Front',
    horizontalDimension: 'width',
    verticalDimension: 'height',
    cameraAxis: '+Z',
    screenAxes: '+X / +Y'
  }),
  rear: Object.freeze({
    id: 'rear',
    label: 'Rear',
    horizontalDimension: 'width',
    verticalDimension: 'height',
    cameraAxis: '-Z',
    screenAxes: '-X / +Y'
  }),
  top: Object.freeze({
    id: 'top',
    label: 'Top',
    horizontalDimension: 'width',
    verticalDimension: 'length',
    cameraAxis: '+Y',
    screenAxes: '-X / +Z'
  })
});

export function assertCalibrationView(view) {
  if (!VIEW_NAMES.includes(view)) {
    throw new Error(`Unknown calibration view: ${view}`);
  }
  return view;
}

export function getViewDimensions(dimensionsMeters, view) {
  const definition = CALIBRATION_VIEWS[assertCalibrationView(view)];
  return {
    horizontal: dimensionsMeters[definition.horizontalDimension],
    vertical: dimensionsMeters[definition.verticalDimension]
  };
}

export function createOrthographicFrame(
  dimensionsMeters,
  view,
  aspect,
  { marginRatio = 0.16, weaponMarginRatio = 0.18 } = {}
) {
  if (!(aspect > 0)) throw new Error('Calibration viewport aspect must be positive');
  const dimensions = getViewDimensions(dimensionsMeters, view);
  const margin = 1 + marginRatio * 2;
  let width = dimensions.horizontal * margin;
  let height = dimensions.vertical * margin;

  if (view === 'side') {
    width += dimensions.horizontal * weaponMarginRatio;
  }

  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  const centerV = view === 'top' ? 0 : dimensionsMeters.height * 0.5;
  return Object.freeze({
    left: -width * 0.5,
    right: width * 0.5,
    top: centerV + height * 0.5,
    bottom: centerV - height * 0.5,
    width,
    height,
    aspect,
    view,
    centerU: 0,
    centerV
  });
}

export function worldToViewMeters(point, view) {
  assertCalibrationView(view);
  const [x, y, z] = Array.isArray(point)
    ? point
    : [point.x, point.y, point.z];
  if (view === 'side') return { u: -z, v: y };
  if (view === 'front') return { u: x, v: y };
  if (view === 'rear') return { u: -x, v: y };
  return { u: -x, v: z };
}

export function viewMetersToCanvas(point, frame, width, height) {
  return {
    x: ((point.u - frame.left) / frame.width) * width,
    y: ((frame.top - point.v) / frame.height) * height
  };
}

export function canvasToViewMeters(point, frame, width, height) {
  return {
    u: frame.left + (point.x / width) * frame.width,
    v: frame.top - (point.y / height) * frame.height
  };
}

export function pixelsPerMeter(frame, width, height) {
  return Math.min(width / frame.width, height / frame.height);
}

export function createImageTransform({
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  crop,
  scale = 1,
  scaleX = scale,
  scaleY = scale,
  offsetX = 0,
  offsetY = 0,
  rotationDegrees = 0,
  mirrorX = false
}) {
  if (!(imageWidth > 0 && imageHeight > 0 && canvasWidth > 0 && canvasHeight > 0)) {
    throw new Error('Image and canvas dimensions must be positive');
  }
  const left = Math.max(0, Math.min(0.99, crop.left));
  const top = Math.max(0, Math.min(0.99, crop.top));
  const safeCrop = {
    left,
    top,
    right: Math.max(0, Math.min(0.99 - left, crop.right)),
    bottom: Math.max(0, Math.min(0.99 - top, crop.bottom))
  };
  const sourceWidth = imageWidth * (1 - safeCrop.left - safeCrop.right);
  const sourceHeight = imageHeight * (1 - safeCrop.top - safeCrop.bottom);
  const rotation = Number.isFinite(Number(rotationDegrees))
    ? Number(rotationDegrees) * Math.PI / 180
    : 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const rotatedWidth = Math.abs(sourceWidth * cosine) + Math.abs(sourceHeight * sine);
  const rotatedHeight = Math.abs(sourceWidth * sine) + Math.abs(sourceHeight * cosine);
  const containScale = Math.min(canvasWidth / rotatedWidth, canvasHeight / rotatedHeight);
  const safeScaleX = Number.isFinite(Number(scaleX)) ? Number(scaleX) : scale;
  const safeScaleY = Number.isFinite(Number(scaleY)) ? Number(scaleY) : scale;
  const drawWidth = sourceWidth * containScale * safeScaleX;
  const drawHeight = sourceHeight * containScale * safeScaleY;

  return Object.freeze({
    sourceX: imageWidth * safeCrop.left,
    sourceY: imageHeight * safeCrop.top,
    sourceWidth,
    sourceHeight,
    centerX: canvasWidth * 0.5 + offsetX,
    centerY: canvasHeight * 0.5 + offsetY,
    drawWidth,
    drawHeight,
    scaleX: safeScaleX,
    scaleY: safeScaleY,
    rotation,
    rotationDegrees: rotation * 180 / Math.PI,
    mirrorX
  });
}

export function sourceNormalizedToCanvas(point, transform, imageWidth, imageHeight) {
  let localX = ((point.x * imageWidth) - transform.sourceX) / transform.sourceWidth;
  const localY = ((point.y * imageHeight) - transform.sourceY) / transform.sourceHeight;
  if (transform.mirrorX) localX = 1 - localX;
  const x = (localX - 0.5) * transform.drawWidth;
  const y = (localY - 0.5) * transform.drawHeight;
  const cosine = Math.cos(transform.rotation ?? 0);
  const sine = Math.sin(transform.rotation ?? 0);
  return {
    x: transform.centerX + x * cosine - y * sine,
    y: transform.centerY + x * sine + y * cosine
  };
}

export function canvasToSourceNormalized(point, transform, imageWidth, imageHeight) {
  const x = point.x - transform.centerX;
  const y = point.y - transform.centerY;
  const cosine = Math.cos(transform.rotation ?? 0);
  const sine = Math.sin(transform.rotation ?? 0);
  let localX = ((x * cosine + y * sine) / transform.drawWidth) + 0.5;
  const localY = ((-x * sine + y * cosine) / transform.drawHeight) + 0.5;
  if (transform.mirrorX) localX = 1 - localX;
  return {
    x: (transform.sourceX + localX * transform.sourceWidth) / imageWidth,
    y: (transform.sourceY + localY * transform.sourceHeight) / imageHeight
  };
}

export function landmarkErrorMeters(modelCanvasPoint, referenceCanvasPoint, frame, width, height) {
  const dx = modelCanvasPoint.x - referenceCanvasPoint.x;
  const dy = modelCanvasPoint.y - referenceCanvasPoint.y;
  return Math.hypot(dx, dy) / pixelsPerMeter(frame, width, height);
}

export function fitImageTransformToLandmarks(
  referenceCanvasPoints,
  modelCanvasPoints,
  canvasCenter,
  {
    minimumScale = 0.05,
    maximumScale = 10,
    independentAxes = false,
    rotationDegrees = 0
  } = {}
) {
  if (
    referenceCanvasPoints.length !== modelCanvasPoints.length
    || referenceCanvasPoints.length < 2
  ) {
    throw new Error('At least two matching reference/model landmarks are required.');
  }
  const count = referenceCanvasPoints.length;
  if (independentAxes) {
    const rotation = rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const toLocal = point => {
      const x = point.x - canvasCenter.x;
      const y = point.y - canvasCenter.y;
      return {
        x: x * cosine + y * sine,
        y: -x * sine + y * cosine
      };
    };
    const referenceLocal = referenceCanvasPoints.map(toLocal);
    const modelLocal = modelCanvasPoints.map(toLocal);
    const mean = points => points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / count,
        y: sum.y + point.y / count
      }),
      { x: 0, y: 0 }
    );
    const referenceMean = mean(referenceLocal);
    const modelMean = mean(modelLocal);
    const fitAxis = axis => {
      let numerator = 0;
      let denominator = 0;
      for (let index = 0; index < count; index++) {
        const reference = referenceLocal[index][axis] - referenceMean[axis];
        numerator += reference * (modelLocal[index][axis] - modelMean[axis]);
        denominator += reference ** 2;
      }
      if (denominator < 1e-9) return 1;
      return Math.max(minimumScale, Math.min(maximumScale, numerator / denominator));
    };
    const scaleX = fitAxis('x');
    const scaleY = fitAxis('y');
    const localOffsetX = modelMean.x - referenceMean.x * scaleX;
    const localOffsetY = modelMean.y - referenceMean.y * scaleY;
    const offsetX = localOffsetX * cosine - localOffsetY * sine;
    const offsetY = localOffsetX * sine + localOffsetY * cosine;
    const squaredError = referenceLocal.reduce((sum, reference, index) => {
      const fitted = {
        x: reference.x * scaleX + localOffsetX,
        y: reference.y * scaleY + localOffsetY
      };
      const model = modelLocal[index];
      return sum + (fitted.x - model.x) ** 2 + (fitted.y - model.y) ** 2;
    }, 0);
    return {
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      rmsPixels: Math.sqrt(squaredError / count)
    };
  }
  const referenceMean = referenceCanvasPoints.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 }
  );
  const modelMean = modelCanvasPoints.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 }
  );
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index++) {
    const reference = referenceCanvasPoints[index];
    const model = modelCanvasPoints[index];
    const referenceX = reference.x - referenceMean.x;
    const referenceY = reference.y - referenceMean.y;
    numerator += referenceX * (model.x - modelMean.x)
      + referenceY * (model.y - modelMean.y);
    denominator += referenceX ** 2 + referenceY ** 2;
  }
  if (denominator < 1e-9) {
    throw new Error('Reference landmarks must not occupy the same point.');
  }
  const scale = Math.max(minimumScale, Math.min(maximumScale, numerator / denominator));
  const offsetX = modelMean.x
    - canvasCenter.x
    - (referenceMean.x - canvasCenter.x) * scale;
  const offsetY = modelMean.y
    - canvasCenter.y
    - (referenceMean.y - canvasCenter.y) * scale;
  const squaredError = referenceCanvasPoints.reduce((sum, reference, index) => {
    const fitted = {
      x: canvasCenter.x + (reference.x - canvasCenter.x) * scale + offsetX,
      y: canvasCenter.y + (reference.y - canvasCenter.y) * scale + offsetY
    };
    const model = modelCanvasPoints[index];
    return sum + (fitted.x - model.x) ** 2 + (fitted.y - model.y) ** 2;
  }, 0);
  return {
    scale,
    offsetX,
    offsetY,
    rmsPixels: Math.sqrt(squaredError / count)
  };
}

export function lodBandsForTier(tier) {
  if (tier === 'high') return new Set(['core', 'medium', 'high']);
  if (tier === 'medium') return new Set(['core', 'medium']);
  if (tier === 'core') return new Set(['core']);
  if (tier === 'proxy') return new Set(['proxy']);
  throw new Error(`Unknown calibration LOD tier: ${tier}`);
}
