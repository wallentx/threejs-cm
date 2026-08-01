const AIM_MODEL_VERSION = 'vehicle-local-aim-v1';

function finiteCoordinate(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function coordinate(value, key, index, label) {
  if (Array.isArray(value)) return finiteCoordinate(value[index], label);
  return finiteCoordinate(value?.[key], label);
}

function stableIdCompare(left, right) {
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) return leftType.localeCompare(rightType);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function stableChannelOffset(channelId) {
  let hash = 2166136261;
  for (const character of String(channelId ?? 'main')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createVehicleLocalAimPoint(target, worldPoint) {
  if (!target?.position || !worldPoint) return null;
  const yaw = finiteCoordinate(target.rotation ?? 0, 'vehicle rotation');
  const dx = coordinate(worldPoint, 'x', 0, 'aim x')
    - coordinate(target.position, 'x', 0, 'vehicle x');
  const dy = coordinate(worldPoint, 'y', 1, 'aim y')
    - coordinate(target.position, 'y', 1, 'vehicle y');
  const dz = coordinate(worldPoint, 'z', 2, 'aim z')
    - coordinate(target.position, 'z', 2, 'vehicle z');
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return Object.freeze({
    modelVersion: AIM_MODEL_VERSION,
    point: Object.freeze([
      dx * cosine - dz * sine,
      dy,
      dx * sine + dz * cosine
    ])
  });
}

export function resolveVehicleLocalAimPoint(target, intent) {
  if (!target?.position || !intent) return null;
  if (intent.modelVersion !== AIM_MODEL_VERSION) {
    throw new TypeError(`unsupported vehicle aim model ${intent.modelVersion}`);
  }
  const localX = coordinate(intent.point, 'x', 0, 'local aim x');
  const localY = coordinate(intent.point, 'y', 1, 'local aim y');
  const localZ = coordinate(intent.point, 'z', 2, 'local aim z');
  const yaw = finiteCoordinate(target.rotation ?? 0, 'vehicle rotation');
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    coordinate(target.position, 'x', 0, 'vehicle x')
      + localX * cosine + localZ * sine,
    coordinate(target.position, 'y', 1, 'vehicle y') + localY,
    coordinate(target.position, 'z', 2, 'vehicle z')
      - localX * sine + localZ * cosine
  ];
}

export function captureVehicleAimIntent(intent) {
  if (!intent) return null;
  const point = resolveVehicleLocalAimPoint(
    { position: [0, 0, 0], rotation: 0 },
    intent
  );
  return {
    modelVersion: AIM_MODEL_VERSION,
    point
  };
}

export function selectVehicleTargetSoldier({
  livingSoldiers = [],
  preferredSoldierId = null,
  channelId = 'main',
  roundsFired = 0
} = {}) {
  const living = [...livingSoldiers]
    .filter(soldier => soldier?.id != null)
    .sort((left, right) => stableIdCompare(left.id, right.id));
  if (living.length === 0) return null;
  const preferred = living.find(soldier =>
    String(soldier.id) === String(preferredSoldierId)
  );
  if (preferred) return preferred;
  const shotIndex = Number.isSafeInteger(roundsFired) && roundsFired >= 0
    ? roundsFired
    : 0;
  return living[(stableChannelOffset(channelId) + shotIndex) % living.length];
}

export { AIM_MODEL_VERSION as VEHICLE_AIM_MODEL_VERSION };
