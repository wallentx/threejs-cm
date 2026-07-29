const MODEL_VERSION = 'mortar-target-order-v1';
const SUPPORTED_AMMUNITION_TYPES = new Set(['HE']);

function finitePoint(value, label) {
  const point = value?.toArray?.() ?? value;
  if (
    !Array.isArray(point)
    || point.length < 3
    || !point.slice(0, 3).every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain three finite coordinates`);
  }
  return point.slice(0, 3);
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be positive and finite`);
  }
  return value;
}

export function createMortarTargetOrder({
  ammunitionType,
  center,
  radiusMeters,
  defaultDispersionRadiusMeters,
  firstRoundDelaySeconds = 1
}) {
  if (!SUPPORTED_AMMUNITION_TYPES.has(ammunitionType)) {
    throw new Error(`unsupported mortar ammunition type ${ammunitionType}`);
  }
  const defaultRadius = positiveFinite(
    defaultDispersionRadiusMeters,
    'mortar default dispersion radius'
  );
  const radius = positiveFinite(radiusMeters, 'mortar target radius');
  if (radius + 1e-9 < defaultRadius) {
    throw new Error('mortar target radius cannot be smaller than default dispersion');
  }
  positiveFinite(firstRoundDelaySeconds, 'mortar first-round delay');
  return {
    version: MODEL_VERSION,
    ammunitionType,
    center: finitePoint(center, 'mortar target center'),
    radiusMeters: radius,
    defaultDispersionRadiusMeters: defaultRadius,
    firstRoundDelayRemainingSeconds: firstRoundDelaySeconds,
    shotsFired: 0,
    dataQuality:
      'area radius and one-second first-round laying delay are gameplay approximations'
  };
}

export function advanceMortarTargetOrder(order, deltaSeconds) {
  validateMortarTargetOrder(order);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new TypeError('mortar target-order delta must be finite and non-negative');
  }
  order.firstRoundDelayRemainingSeconds = Math.max(
    0,
    order.firstRoundDelayRemainingSeconds - deltaSeconds
  );
  return order;
}

export function sampleMortarTargetPoint(order, random) {
  validateMortarTargetOrder(order);
  if (typeof random !== 'function') {
    throw new TypeError('mortar target dispersion requires deterministic random');
  }
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * order.radiusMeters;
  return [
    order.center[0] + Math.cos(angle) * distance,
    order.center[1],
    order.center[2] + Math.sin(angle) * distance
  ];
}

export function recordMortarTargetOrderShot(order) {
  validateMortarTargetOrder(order);
  order.shotsFired++;
  return order.shotsFired;
}

export function captureMortarTargetOrder(order) {
  if (!order) return null;
  validateMortarTargetOrder(order);
  return {
    ...order,
    center: order.center.slice()
  };
}

export function restoreMortarTargetOrder(snapshot) {
  if (!snapshot) return null;
  const restored = {
    ...snapshot,
    center: finitePoint(snapshot.center, 'mortar target center')
  };
  validateMortarTargetOrder(restored);
  return restored;
}

export function validateMortarTargetOrder(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    throw new TypeError('mortar target order must be a record');
  }
  if (order.version !== MODEL_VERSION) {
    throw new Error(`unsupported mortar target-order version ${order.version}`);
  }
  if (!SUPPORTED_AMMUNITION_TYPES.has(order.ammunitionType)) {
    throw new Error(`unsupported mortar ammunition type ${order.ammunitionType}`);
  }
  finitePoint(order.center, 'mortar target center');
  const defaultRadius = positiveFinite(
    order.defaultDispersionRadiusMeters,
    'mortar default dispersion radius'
  );
  const radius = positiveFinite(order.radiusMeters, 'mortar target radius');
  if (radius + 1e-9 < defaultRadius) {
    throw new Error('mortar target radius cannot be smaller than default dispersion');
  }
  if (
    !Number.isFinite(order.firstRoundDelayRemainingSeconds)
    || order.firstRoundDelayRemainingSeconds < 0
  ) {
    throw new TypeError('mortar first-round delay remaining must be finite and non-negative');
  }
  if (!Number.isSafeInteger(order.shotsFired) || order.shotsFired < 0) {
    throw new TypeError('mortar shotsFired must be a non-negative safe integer');
  }
  if (
    typeof order.dataQuality !== 'string'
    || !order.dataQuality.includes('gameplay approximations')
  ) {
    throw new Error('mortar target-order data quality must label gameplay approximations');
  }
  return order;
}
