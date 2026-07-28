const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;
const MAX_HULL_TILT_RADIANS = Math.PI * (32 / 180);
const HULL_SUSPENSION_FREQUENCY_RADIANS = 8;
const TURRET_GROUND_RESTITUTION = 0.22;
const TURRET_GROUND_FRICTION = 0.68;
const MAX_TURRET_BOUNCES = 2;
const MAX_TURRET_SUBSTEP_SECONDS = 1 / 60;

export const VEHICLE_PHYSICS_MODEL =
  'terrain-support-and-catastrophic-turret-separation-v1';

export const VEHICLE_PHYSICS_DATA_QUALITY =
  'deterministic gameplay approximation derived from the vehicle rigid envelope; '
  + 'not a per-vehicle suspension or explosive impulse measurement';

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function copyVector3(value, fallback = [0, 0, 0]) {
  return [0, 1, 2].map(index => finite(value?.[index], fallback[index]));
}

function createHullState(saved = null) {
  return {
    initialized: Boolean(saved?.initialized),
    pitch: finite(saved?.pitch),
    roll: finite(saved?.roll),
    pitchVelocity: finite(saved?.pitchVelocity),
    rollVelocity: finite(saved?.rollVelocity),
    rideHeight: finite(saved?.rideHeight),
    verticalVelocity: finite(saved?.verticalVelocity),
    targetPitch: finite(saved?.targetPitch),
    targetRoll: finite(saved?.targetRoll),
    targetRideHeight: finite(saved?.targetRideHeight)
  };
}

function createTurretState(saved = null) {
  const status = ['ATTACHED', 'AIRBORNE', 'BOUNCING', 'SETTLED']
    .includes(saved?.status)
    ? saved.status
    : 'ATTACHED';
  return {
    status,
    offset: copyVector3(saved?.offset),
    velocity: copyVector3(saved?.velocity),
    rotation: copyVector3(saved?.rotation),
    angularVelocity: copyVector3(saved?.angularVelocity),
    baseYaw: finite(saved?.baseYaw),
    ageSeconds: Math.max(0, finite(saved?.ageSeconds)),
    bounceCount: Math.max(0, Math.floor(finite(saved?.bounceCount))),
    separationEventVersion: saved?.separationEventVersion == null
      ? null
      : Math.max(0, Math.floor(finite(saved.separationEventVersion)))
  };
}

export function createVehiclePhysicsState(saved = null) {
  return {
    modelVersion: VEHICLE_PHYSICS_MODEL,
    dataQuality: VEHICLE_PHYSICS_DATA_QUALITY,
    hull: createHullState(saved?.hull),
    turret: createTurretState(saved?.turret)
  };
}

export function captureVehiclePhysicsState(state) {
  const normalized = createVehiclePhysicsState(state);
  return {
    ...normalized,
    hull: { ...normalized.hull },
    turret: {
      ...normalized.turret,
      offset: [...normalized.turret.offset],
      velocity: [...normalized.turret.velocity],
      rotation: [...normalized.turret.rotation],
      angularVelocity: [...normalized.turret.angularVelocity]
    }
  };
}

function movementHeightSampler(terrain) {
  if (typeof terrain?.getMovementHeightAt === 'function') {
    return terrain.getMovementHeightAt.bind(terrain);
  }
  if (typeof terrain?.getHeightAt === 'function') {
    return terrain.getHeightAt.bind(terrain);
  }
  return null;
}

function localOffsetToWorld(position, yaw, localX, localZ) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return {
    x: finite(position?.x) + cosine * localX + sine * localZ,
    z: finite(position?.z) - sine * localX + cosine * localZ
  };
}

export function sampleVehicleTerrainPose({
  position,
  yaw = 0,
  dimensions,
  terrain
}) {
  const sampleHeight = movementHeightSampler(terrain);
  if (!sampleHeight) return null;

  // The rigid envelope includes overhangs. These dimension-derived contact
  // spans are an explicit first-order approximation until each vehicle owns
  // suspension support coordinates.
  const supportLength = Math.max(0.8, finite(dimensions?.length, 4) * 0.72);
  const supportWidth = Math.max(0.7, finite(dimensions?.width, 2) * 0.82);
  const halfLength = supportLength * 0.5;
  const halfWidth = supportWidth * 0.5;
  const sample = (localX, localZ) => {
    const world = localOffsetToWorld(position, yaw, localX, localZ);
    return finite(sampleHeight(world.x, world.z), finite(position?.y));
  };

  const frontLeft = sample(halfWidth, halfLength);
  const frontRight = sample(-halfWidth, halfLength);
  const rearLeft = sample(halfWidth, -halfLength);
  const rearRight = sample(-halfWidth, -halfLength);
  const frontHeight = (frontLeft + frontRight) * 0.5;
  const rearHeight = (rearLeft + rearRight) * 0.5;
  const leftHeight = (frontLeft + rearLeft) * 0.5;
  const rightHeight = (frontRight + rearRight) * 0.5;

  return {
    pitch: clamp(
      -Math.atan2(frontHeight - rearHeight, supportLength),
      -MAX_HULL_TILT_RADIANS,
      MAX_HULL_TILT_RADIANS
    ),
    roll: clamp(
      Math.atan2(leftHeight - rightHeight, supportWidth),
      -MAX_HULL_TILT_RADIANS,
      MAX_HULL_TILT_RADIANS
    ),
    rideHeight: (frontLeft + frontRight + rearLeft + rearRight) * 0.25,
    supportLength,
    supportWidth,
    samples: { frontLeft, frontRight, rearLeft, rearRight },
    dataQuality: VEHICLE_PHYSICS_DATA_QUALITY
  };
}

function advanceCriticallyDamped(current, velocity, target, deltaSeconds) {
  const error = current - target;
  const velocityPlusError = velocity + HULL_SUSPENSION_FREQUENCY_RADIANS * error;
  const decay = Math.exp(-HULL_SUSPENSION_FREQUENCY_RADIANS * deltaSeconds);
  return {
    value: target + (error + velocityPlusError * deltaSeconds) * decay,
    velocity: (
      velocity
      - HULL_SUSPENSION_FREQUENCY_RADIANS
        * velocityPlusError
        * deltaSeconds
    ) * decay
  };
}

function advanceHull(state, target, deltaSeconds) {
  state.targetPitch = target.pitch;
  state.targetRoll = target.roll;
  state.targetRideHeight = target.rideHeight;
  if (!state.initialized) {
    state.initialized = true;
    state.pitch = target.pitch;
    state.roll = target.roll;
    state.rideHeight = target.rideHeight;
    state.pitchVelocity = 0;
    state.rollVelocity = 0;
    state.verticalVelocity = 0;
    return;
  }

  const pitch = advanceCriticallyDamped(
    state.pitch,
    state.pitchVelocity,
    target.pitch,
    deltaSeconds
  );
  const roll = advanceCriticallyDamped(
    state.roll,
    state.rollVelocity,
    target.roll,
    deltaSeconds
  );
  const ride = advanceCriticallyDamped(
    state.rideHeight,
    state.verticalVelocity,
    target.rideHeight,
    deltaSeconds
  );
  state.pitch = pitch.value;
  state.pitchVelocity = pitch.velocity;
  state.roll = roll.value;
  state.rollVelocity = roll.velocity;
  state.rideHeight = ride.value;
  state.verticalVelocity = ride.velocity;
}

function beginTurretSeparation(turret, dimensions, damageEventVersion, baseYaw) {
  const height = Math.max(1, finite(dimensions?.height, 2));
  const width = Math.max(1, finite(dimensions?.width, 2));
  const length = Math.max(1, finite(dimensions?.length, 4));
  const targetRise = height * 0.72;
  const verticalSpeed = Math.sqrt(
    2 * GRAVITY_METERS_PER_SECOND_SQUARED * targetRise
  );
  const flightSeconds = Math.max(
    0.5,
    2 * verticalSpeed / GRAVITY_METERS_PER_SECOND_SQUARED
  );
  const lateralSign = damageEventVersion % 2 === 0 ? -1 : 1;

  turret.status = 'AIRBORNE';
  turret.offset = [0, 0, 0];
  turret.velocity = [
    lateralSign * width * 0.72 / flightSeconds,
    verticalSpeed,
    length * 0.22 / flightSeconds
  ];
  turret.rotation = [0, 0, 0];
  turret.angularVelocity = [
    lateralSign * Math.PI * 0.62,
    Math.PI * 0.38,
    lateralSign * Math.PI * 1.35
  ];
  turret.baseYaw = finite(baseYaw);
  turret.ageSeconds = 0;
  turret.bounceCount = 0;
  turret.separationEventVersion = damageEventVersion;
}

function turretGroundOffset({
  turret,
  position,
  yaw,
  dimensions,
  terrain
}) {
  const sampleHeight = movementHeightSampler(terrain);
  if (!sampleHeight) return -Math.max(0.5, finite(dimensions?.height, 2) * 0.5);
  const world = localOffsetToWorld(
    position,
    yaw,
    turret.offset[0],
    turret.offset[2]
  );
  const groundHeight = finite(sampleHeight(world.x, world.z), finite(position?.y));
  const mountHeight = Math.max(0.7, finite(dimensions?.height, 2) * 0.68);
  const turretHalfHeight = Math.max(0.22, finite(dimensions?.height, 2) * 0.14);
  return groundHeight - finite(position?.y) - mountHeight + turretHalfHeight;
}

function advanceSeparatedTurret({
  turret,
  deltaSeconds,
  position,
  yaw,
  dimensions,
  terrain
}) {
  if (turret.status === 'ATTACHED' || turret.status === 'SETTLED') return;
  turret.ageSeconds += deltaSeconds;
  turret.velocity[1] -= GRAVITY_METERS_PER_SECOND_SQUARED * deltaSeconds;
  for (let axis = 0; axis < 3; axis++) {
    turret.offset[axis] += turret.velocity[axis] * deltaSeconds;
    turret.rotation[axis] += turret.angularVelocity[axis] * deltaSeconds;
  }

  const floor = turretGroundOffset({
    turret,
    position,
    yaw,
    dimensions,
    terrain
  });
  if (turret.offset[1] > floor || turret.velocity[1] >= 0) return;

  turret.offset[1] = floor;
  if (
    turret.bounceCount < MAX_TURRET_BOUNCES
    && Math.abs(turret.velocity[1]) > 1.15
  ) {
    turret.status = 'BOUNCING';
    turret.bounceCount++;
    turret.velocity[1] = -turret.velocity[1] * TURRET_GROUND_RESTITUTION;
    turret.velocity[0] *= TURRET_GROUND_FRICTION;
    turret.velocity[2] *= TURRET_GROUND_FRICTION;
    turret.angularVelocity = turret.angularVelocity.map(
      value => value * TURRET_GROUND_FRICTION
    );
    return;
  }

  turret.status = 'SETTLED';
  turret.velocity = [0, 0, 0];
  turret.angularVelocity = [0, 0, 0];
}

export function advanceVehiclePhysicsState({
  state,
  deltaSeconds,
  position,
  yaw = 0,
  dimensions,
  terrain,
  damageState,
  hasDetachableTurret = false,
  turretYaw = 0
}) {
  const delta = Math.max(0, finite(deltaSeconds));
  const terrainPose = sampleVehicleTerrainPose({
    position,
    yaw,
    dimensions,
    terrain
  });
  if (terrainPose) advanceHull(state.hull, terrainPose, delta);
  const resolvedPosition = state.hull.initialized
    ? {
        x: finite(position?.x),
        y: state.hull.rideHeight,
        z: finite(position?.z)
      }
    : position;

  let separatedNow = false;
  if (
    hasDetachableTurret
    && damageState?.secondaryExplosion
    && state.turret.status === 'ATTACHED'
  ) {
    beginTurretSeparation(
      state.turret,
      dimensions,
      Math.max(0, Math.floor(finite(damageState.eventVersion))),
      turretYaw
    );
    separatedNow = true;
  }
  let remainingSeconds = delta;
  while (remainingSeconds > 1e-12) {
    const stepSeconds = Math.min(
      MAX_TURRET_SUBSTEP_SECONDS,
      remainingSeconds
    );
    advanceSeparatedTurret({
      turret: state.turret,
      deltaSeconds: stepSeconds,
      position: resolvedPosition,
      yaw,
      dimensions,
      terrain
    });
    remainingSeconds -= stepSeconds;
  }

  return {
    terrainPose,
    separatedNow,
    state
  };
}
