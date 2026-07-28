function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function multiply(left, right) {
  const result = new Array(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      for (let index = 0; index < 3; index++) {
        result[row * 3 + column] +=
          left[row * 3 + index] * right[index * 3 + column];
      }
    }
  }
  return result;
}

function rotationX(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    1, 0, 0,
    0, cosine, -sine,
    0, sine, cosine
  ];
}

function rotationY(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    cosine, 0, sine,
    0, 1, 0,
    -sine, 0, cosine
  ];
}

function rotationZ(angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    cosine, -sine, 0,
    sine, cosine, 0,
    0, 0, 1
  ];
}

export function transformDirection(orientation, vector) {
  const x = finite(vector?.[0] ?? vector?.x);
  const y = finite(vector?.[1] ?? vector?.y);
  const z = finite(vector?.[2] ?? vector?.z);
  return [
    orientation[0] * x + orientation[1] * y + orientation[2] * z,
    orientation[3] * x + orientation[4] * y + orientation[5] * z,
    orientation[6] * x + orientation[7] * y + orientation[8] * z
  ];
}

export function inverseTransformDirection(orientation, vector) {
  const x = finite(vector?.[0] ?? vector?.x);
  const y = finite(vector?.[1] ?? vector?.y);
  const z = finite(vector?.[2] ?? vector?.z);
  return [
    orientation[0] * x + orientation[3] * y + orientation[6] * z,
    orientation[1] * x + orientation[4] * y + orientation[7] * z,
    orientation[2] * x + orientation[5] * y + orientation[8] * z
  ];
}

export function vehicleHullOrientation(unit) {
  const pitch = unit?.vehiclePhysics?.hull?.initialized
    ? finite(unit.vehiclePhysics.hull.pitch)
    : 0;
  const roll = unit?.vehiclePhysics?.hull?.initialized
    ? finite(unit.vehiclePhysics.hull.roll)
    : 0;
  return multiply(
    multiply(rotationY(finite(unit?.rotation)), rotationX(pitch)),
    rotationZ(roll)
  );
}

export function vehicleVolumeTransform(unit, volume) {
  const hullOrientation = vehicleHullOrientation(unit);
  const turretYaw = volume?.followsTurret
    ? finite(unit?.vehicleWeapon?.turretYaw)
    : 0;
  const localYaw = turretYaw + finite(volume?.rotation);
  const orientation = multiply(hullOrientation, rotationY(localYaw));
  const center = transformDirection(
    hullOrientation,
    volume?.center ?? [0, 0, 0]
  );
  const offset = transformDirection(
    orientation,
    volume?.offset ?? [0, 0, 0]
  );
  return {
    centerX: finite(unit?.position?.x) + center[0] + offset[0],
    centerY: finite(unit?.position?.y) + center[1] + offset[1],
    centerZ: finite(unit?.position?.z) + center[2] + offset[2],
    rotation: finite(unit?.rotation) + localYaw,
    orientation
  };
}

export function isVehicleTurretSeparated(unit) {
  const status = unit?.vehiclePhysics?.turret?.status;
  return status != null && status !== 'ATTACHED';
}
