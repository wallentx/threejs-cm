const VIEW_NAMES = Object.freeze(['side', 'front', 'top']);

const finite = value => (
  Number.isFinite(Number(value)) ? Number(value) : null
);

function imageDimensions(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const width = finite(value[0]);
    const height = finite(value[1]);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (value && typeof value === 'object') {
    const width = finite(value.width);
    const height = finite(value.height);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function commonsImageUrl(url) {
  if (typeof url !== 'string') return null;
  const marker = 'commons.wikimedia.org/wiki/File:';
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const fileName = url.slice(index + marker.length);
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${fileName}`;
}

function rasterUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return url;
  if (/\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url)) {
    return commonsImageUrl(url) ?? url;
  }
  return null;
}

function sourceObjects(metadata, calibration) {
  const result = [];
  const append = value => {
    if (Array.isArray(value)) result.push(...value.filter(Boolean));
    else if (value && typeof value === 'object') result.push(value);
  };
  append(calibration?.source);
  append(calibration?.sources);
  append(calibration?.sourceRecords);
  append(metadata?.sourceRecords);
  append(metadata?.blueprintContract?.sources);
  append(metadata?.visualContract?.sources);
  return result;
}

function sourceImageUrl(metadata, calibration) {
  for (const source of sourceObjects(metadata, calibration)) {
    for (const field of ['imageUrl', 'originalFileUrl', 'previewUrl']) {
      const url = rasterUrl(source?.[field]);
      if (url) return url;
    }
    const artifact = rasterUrl(source?.artifact);
    if (artifact) return artifact.startsWith('/') ? artifact : `/${artifact}`;
    const url = rasterUrl(source?.url);
    if (url) return url;
  }
  return null;
}

function referenceImageUrl(referenceRegistry, modelId, view) {
  if (!referenceRegistry) return null;
  if (typeof referenceRegistry.get !== 'function') {
    throw new TypeError('calibration reference registry requires get(modelId, view)');
  }
  const reference = referenceRegistry.get(modelId, view);
  if (reference == null) return null;
  const imageUrl = rasterUrl(reference.imageUrl);
  if (!imageUrl) {
    throw new Error(`calibration reference ${modelId}:${view} requires a raster imageUrl`);
  }
  return imageUrl;
}

function registrationRoot(calibration) {
  return calibration?.imageRegistration
    ?? calibration?.registration
    ?? calibration?.drawingRegistration
    ?? null;
}

function findDimensions(calibration, registration) {
  const candidates = [
    registration?.sourceImagePixels,
    registration?.imagePixels,
    calibration?.sourceImagePixels,
    calibration?.imagePixels,
    calibration?.source?.imageSizePixels,
    calibration?.source?.sourceImagePixels
  ];
  for (const candidate of candidates) {
    const dimensions = imageDimensions(candidate);
    if (dimensions) return dimensions;
  }
  return null;
}

function viewRegistration(registration, view) {
  if (!registration) return { entry: null, crop: null, cropMode: null };
  if (registration.views?.[view]) {
    return {
      entry: registration.views[view],
      crop: registration.views[view].cropPixels ?? null,
      cropMode: 'rectangle'
    };
  }
  if (registration[view]) {
    return {
      entry: registration[view],
      crop: registration[view].cropPixels
        ?? registration[view].sourceCropPixels
        ?? null,
      cropMode: registration[view].sourceCropPixels ? 'margins' : 'rectangle'
    };
  }
  const namedCrop = registration[`${view}CropPixels`];
  if (namedCrop) {
    return {
      entry: registration,
      crop: namedCrop,
      cropMode: registration.imagePixels ? 'bounds' : 'rectangle'
    };
  }
  if (view === 'side' && registration.cropPixels) {
    return {
      entry: registration,
      crop: registration.cropPixels,
      cropMode: 'margins'
    };
  }
  return { entry: null, crop: null, cropMode: null };
}

function normalizedCrop(crop, dimensions, mode) {
  if (!crop || !dimensions) return null;
  const { width, height } = dimensions;
  let x;
  let y;
  let cropWidth;
  let cropHeight;
  if (Array.isArray(crop)) {
    [x, y, cropWidth, cropHeight] = crop.map(finite);
  } else if ('x' in crop || 'width' in crop) {
    x = finite(crop.x);
    y = finite(crop.y);
    cropWidth = finite(crop.width);
    cropHeight = finite(crop.height);
  } else if (mode === 'bounds') {
    x = finite(crop.left);
    y = finite(crop.top);
    const right = finite(crop.right);
    const bottom = finite(crop.bottom);
    cropWidth = right !== null && x !== null ? right - x : null;
    cropHeight = bottom !== null && y !== null ? bottom - y : null;
  } else {
    const left = finite(crop.left);
    const top = finite(crop.top);
    const right = finite(crop.right);
    const bottom = finite(crop.bottom);
    if ([left, top, right, bottom].some(value => value === null)) return null;
    return {
      left: left / width,
      top: top / height,
      right: right / width,
      bottom: bottom / height
    };
  }
  if ([x, y, cropWidth, cropHeight].some(value => value === null)) return null;
  return {
    left: x / width,
    top: y / height,
    right: Math.max(0, (width - x - cropWidth) / width),
    bottom: Math.max(0, (height - y - cropHeight) / height)
  };
}

function sourcePoint(x, y, dimensions, offset = { x: 0, y: 0 }) {
  const sourceX = finite(x);
  const sourceY = finite(y);
  if (sourceX === null || sourceY === null || !dimensions) return null;
  return {
    x: (sourceX + offset.x) / dimensions.width,
    y: (sourceY + offset.y) / dimensions.height
  };
}

function rigidLandmarks(calibration, registration, viewData, view, dimensions, crop) {
  if (view !== 'side' || !dimensions) return {};
  const entry = viewData.entry ?? {};
  const rigid = entry.rigidDatumPixels
    ?? entry.rigidEnvelopePixels
    ?? registration?.sideDatumPixelsInCrop
    ?? null;
  const cropOffset = registration?.sideDatumPixelsInCrop && crop
    ? {
        x: crop.left * dimensions.width,
        y: crop.top * dimensions.height
      }
    : { x: 0, y: 0 };
  const root = calibration?.drawingRegistration;
  const frontX = rigid?.frontX
    ?? rigid?.rigidFrontX
    ?? root?.rigidFrontPixelX;
  const rearX = rigid?.rearX
    ?? rigid?.rigidRearX
    ?? root?.rigidRearPixelX;
  const topY = rigid?.topY
    ?? rigid?.overallHeightTopY;
  const groundY = rigid?.groundY
    ?? root?.groundLinePixelY
    ?? entry.groundLineY;
  const centerX = finite(frontX) !== null && finite(rearX) !== null
    ? (finite(frontX) + finite(rearX)) * 0.5
    : null;
  const landmarks = {};
  const assign = (id, x, y) => {
    const point = sourcePoint(x, y, dimensions, cropOffset);
    if (point) landmarks[id] = point;
  };
  assign('rigid-front', frontX, groundY);
  assign('rigid-rear', rearX, groundY);
  assign('vehicle-top', centerX, topY);
  assign('ground-origin', centerX, groundY);
  return landmarks;
}

function cloneRegistration(registration) {
  return {
    imageUrl: registration.imageUrl,
    crop: { ...registration.crop },
    scale: registration.scale,
    offsetX: registration.offsetX,
    offsetY: registration.offsetY,
    rotationDegrees: registration.rotationDegrees ?? 0,
    mirrorX: registration.mirrorX,
    autoFit: Boolean(registration.autoFit),
    landmarks: structuredClone(registration.landmarks)
  };
}

/**
 * Converts renderer-owned source metadata into the jig's editable schema.
 * Unavailable or qualitative views remain explicitly empty.
 */
export function createVehicleOwnedRegistrations(
  model,
  record,
  { referenceRegistry = null } = {}
) {
  const metadata = model?.userData?.modelMetadata ?? {};
  const calibration = metadata.blueprintCalibration
    ?? metadata.calibration
    ?? metadata.blueprintContract
    ?? metadata.blueprintFit
    ?? model?.userData?.blueprintCalibration
    ?? null;
  const registration = registrationRoot(calibration);
  const dimensions = findDimensions(calibration, registration);
  const modelImageUrl = sourceImageUrl(metadata, calibration);
  const views = {};

  for (const view of VIEW_NAMES) {
    const imageUrl = referenceImageUrl(referenceRegistry, record.modelId, view)
      ?? modelImageUrl;
    const fallback = cloneRegistration(record.views[view]);
    const viewData = viewRegistration(registration, view);
    const crop = normalizedCrop(viewData.crop, dimensions, viewData.cropMode);
    const hasAuthoredTransform = Boolean(crop || viewData.entry);
    if (!imageUrl || !hasAuthoredTransform) {
      views[view] = fallback;
      continue;
    }
    const landmarks = {
      ...fallback.landmarks,
      ...rigidLandmarks(
        calibration,
        registration,
        viewData,
        view,
        dimensions,
        crop
      )
    };
    views[view] = {
      ...fallback,
      imageUrl,
      crop: crop ?? fallback.crop,
      rotationDegrees: finite(
        viewData.entry?.rotationDegrees
        ?? viewData.entry?.rotateDegrees
      ) ?? 0,
      mirrorX: Boolean(
        viewData.entry?.mirrorX
        ?? registration?.mirrorX
        ?? registration?.mirrorForLocalSideView
        ?? false
      ),
      autoFit: Object.keys(landmarks).length >= 2,
      landmarks
    };
  }
  return views;
}
