import { CALIBRATION_VIEWS } from './CalibrationMath.js';

const finiteNumber = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const bounded = (value, fallback, minimum, maximum) => (
  Math.max(minimum, Math.min(maximum, finiteNumber(value, fallback)))
);

function normalizeLandmarks(landmarks, allowedIds) {
  if (!landmarks || typeof landmarks !== 'object') return {};
  const normalized = {};
  for (const [id, point] of Object.entries(landmarks)) {
    if (!allowedIds.has(id) || !point || typeof point !== 'object') continue;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    normalized[id] = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }
  return normalized;
}

export function normalizeImportedCalibration(payload, record) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Calibration import must contain a JSON object.');
  }
  if (payload.modelId !== record.modelId) {
    throw new Error(
      `Calibration import is for ${payload.modelId ?? 'an unknown model'}, not ${record.modelId}.`
    );
  }
  if (!payload.views || typeof payload.views !== 'object') {
    throw new Error('Calibration import has no view registrations.');
  }

  const allowedIds = new Set(record.landmarks.map(landmark => landmark.id));
  return Object.fromEntries(Object.keys(CALIBRATION_VIEWS).map(viewName => {
    const fallback = record.views[viewName];
    const source = payload.views[viewName] ?? {};
    const left = bounded(source.crop?.left, fallback.crop.left, 0, 0.99);
    const top = bounded(source.crop?.top, fallback.crop.top, 0, 0.99);
    return [viewName, {
      imageUrl: typeof source.imageUrl === 'string' ? source.imageUrl : null,
      crop: {
        left,
        top,
        right: bounded(source.crop?.right, fallback.crop.right, 0, 0.99 - left),
        bottom: bounded(source.crop?.bottom, fallback.crop.bottom, 0, 0.99 - top)
      },
      scale: bounded(source.scale, fallback.scale, 0.05, 10),
      offsetX: finiteNumber(source.offsetX, fallback.offsetX),
      offsetY: finiteNumber(source.offsetY, fallback.offsetY),
      mirrorX: Boolean(source.mirrorX),
      landmarks: normalizeLandmarks(source.landmarks, allowedIds)
    }];
  }));
}
