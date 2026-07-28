export const INFANTRY_COLLISION_RADIUS = 0.32;
export const INFANTRY_SEPARATION_MAX_CANDIDATES = 256;
export const INFANTRY_SEPARATION_MAX_PASSES = 16;
// Two agents may each be projected against the static world's 1e-5 m contact
// threshold, so dynamic overlap convergence uses the combined bound.
export const INFANTRY_SEPARATION_TOLERANCE = 2e-5;

const POSITION_EPSILON = 1e-12;
const MAX_UNRESOLVED_TELEMETRY = 256;
const INFANTRY_MOVER_OPTIONS = Object.freeze({ moverType: 'infantry' });
const UNAVAILABLE_STATUSES = new Set(['KIA', 'INCAPACITATED', 'DEAD']);
const ELIGIBLE_BUILDING_PHASES = new Set(['outside', 'approaching']);
const DIAGONAL = Math.SQRT1_2;
const COINCIDENT_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([DIAGONAL, DIAGONAL]),
  Object.freeze([0, 1]),
  Object.freeze([-DIAGONAL, DIAGONAL]),
  Object.freeze([-1, 0]),
  Object.freeze([-DIAGONAL, -DIAGONAL]),
  Object.freeze([0, -1]),
  Object.freeze([DIAGONAL, -DIAGONAL])
]);

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function stableId(value, label) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : value;
  }
  throw new TypeError(`${label} must be a non-empty stable ID`);
}

function candidateKey(unitId, soldierId) {
  return JSON.stringify([
    [typeof unitId, unitId],
    [typeof soldierId, soldierId]
  ]);
}

function compareStableIds(left, right) {
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) return compareText(leftType, rightType);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function readBuildingLocation(agent) {
  return agent.buildingLocation !== undefined
    ? agent.buildingLocation
    : agent.record?.buildingLocation;
}

function readVehicleLocation(agent) {
  return agent.vehicleLocation !== undefined
    ? agent.vehicleLocation
    : agent.record?.vehicleLocation;
}

function isEligibleAgent(agent) {
  if (!agent || agent.isAlive !== true) return false;
  if (UNAVAILABLE_STATUSES.has(agent.status)) return false;
  if (readVehicleLocation(agent)) return false;
  const buildingLocation = readBuildingLocation(agent);
  return !buildingLocation
    || ELIGIBLE_BUILDING_PHASES.has(buildingLocation.phase);
}

function compareCandidates(left, right) {
  return compareStableIds(left.unitId, right.unitId)
    || compareStableIds(left.soldierId, right.soldierId);
}

function collectCandidates(units) {
  if (!Array.isArray(units)) {
    throw new TypeError('InfantrySeparationSystem requires a units array');
  }
  const candidates = [];
  for (const unit of units) {
    if (unit?.type !== 'infantry_squad') continue;
    for (const agent of unit.soldierAI?.agents ?? []) {
      if (!isEligibleAgent(agent)) continue;
      const unitId = stableId(unit.id, 'Infantry unit ID');
      const soldierId = stableId(agent.id, `Soldier ID in unit ${unitId}`);
      if (!Number.isFinite(agent.position?.x)
          || !Number.isFinite(agent.position?.z)) {
        throw new TypeError(
          `Infantry candidate ${unitId}/${soldierId} requires a finite X/Z position`
        );
      }
      candidates.push({
        agent,
        unitId,
        soldierId,
        key: candidateKey(unitId, soldierId)
      });
      if (candidates.length > INFANTRY_SEPARATION_MAX_CANDIDATES) {
        throw new RangeError(
          'Infantry separation candidate count '
          + `${candidates.length} exceeds supported maximum `
          + `${INFANTRY_SEPARATION_MAX_CANDIDATES}`
        );
      }
    }
  }
  candidates.sort(compareCandidates);
  for (let index = 1; index < candidates.length; index++) {
    if (candidates[index - 1].key === candidates[index].key) {
      throw new Error(
        `Duplicate infantry separation identity ${candidates[index].key}`
      );
    }
  }
  return candidates;
}

function hashPair(firstKey, secondKey) {
  const value = `${firstKey}\u0000${secondKey}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function coincidentDirection(firstKey, secondKey) {
  return COINCIDENT_DIRECTIONS[
    hashPair(firstKey, secondKey) % COINCIDENT_DIRECTIONS.length
  ];
}

function projectCorrection(
  candidate,
  deltaX,
  deltaZ,
  collisionWorld,
  displacement
) {
  const position = candidate.agent.position;
  const startX = position.x;
  const startZ = position.z;
  displacement.x = deltaX;
  displacement.z = deltaZ;
  const projected = collisionWorld.resolveCircleMotion(
    position,
    displacement,
    INFANTRY_COLLISION_RADIUS,
    INFANTRY_MOVER_OPTIONS
  );
  if (!Number.isFinite(projected?.x) || !Number.isFinite(projected?.z)) {
    throw new TypeError(
      `Static collision returned a non-finite correction for ${candidate.key}`
    );
  }
  // A correction that begins exactly on a static contact may land marginally
  // inside the expanded collider because the swept query starts at t=0.
  // Reprojecting the resulting point with zero requested motion invokes the
  // collision world's deterministic penetration recovery before state is
  // accepted.
  displacement.x = 0;
  displacement.z = 0;
  const recovered = collisionWorld.resolveCircleMotion(
    projected,
    displacement,
    INFANTRY_COLLISION_RADIUS,
    INFANTRY_MOVER_OPTIONS
  );
  if (!Number.isFinite(recovered?.x) || !Number.isFinite(recovered?.z)) {
    throw new TypeError(
      `Static collision returned a non-finite recovery for ${candidate.key}`
    );
  }
  position.x = recovered.x;
  position.z = recovered.z;
  return Math.abs(position.x - startX) > POSITION_EPSILON
    || Math.abs(position.z - startZ) > POSITION_EPSILON;
}

function unresolvedTelemetry(candidates) {
  const minimumDistance = INFANTRY_COLLISION_RADIUS * 2;
  const unresolvedPairs = [];
  let unresolvedPairCount = 0;
  for (let first = 0; first < candidates.length; first++) {
    const left = candidates[first];
    for (let second = first + 1; second < candidates.length; second++) {
      const right = candidates[second];
      const distance = Math.hypot(
        left.agent.position.x - right.agent.position.x,
        left.agent.position.z - right.agent.position.z
      );
      if (distance >= minimumDistance - INFANTRY_SEPARATION_TOLERANCE) {
        continue;
      }
      unresolvedPairCount++;
      if (unresolvedPairs.length < MAX_UNRESOLVED_TELEMETRY) {
        unresolvedPairs.push({
          firstKey: left.key,
          secondKey: right.key,
          distance,
          penetration: minimumDistance - distance
        });
      }
    }
  }
  return { unresolvedPairCount, unresolvedPairs };
}

export function resolveInfantrySeparation(units, terrain) {
  const candidates = collectCandidates(units);
  if (candidates.length < 2) {
    return {
      candidateCount: candidates.length,
      candidateKeys: candidates.map(candidate => candidate.key),
      passes: 0,
      correctionCount: 0,
      correctedSoldierKeys: [],
      correctedUnitIds: [],
      unresolvedPairCount: 0,
      unresolvedPairs: [],
      converged: true
    };
  }

  const collisionWorld = terrain?.collisionWorld;
  if (typeof collisionWorld?.resolveCircleMotion !== 'function') {
    throw new TypeError(
      'InfantrySeparationSystem requires terrain.collisionWorld.resolveCircleMotion'
    );
  }
  const sampleHeight = typeof terrain.getMovementHeightAt === 'function'
    ? terrain.getMovementHeightAt
    : terrain.getHeightAt;
  if (typeof sampleHeight !== 'function') {
    throw new TypeError(
      'InfantrySeparationSystem requires a movement-height sampler'
    );
  }

  const minimumDistance = INFANTRY_COLLISION_RADIUS * 2;
  const correctedKeys = new Set();
  const correctedUnitIds = new Set();
  const leftDisplacement = { x: 0, z: 0 };
  const rightDisplacement = { x: 0, z: 0 };
  let passes = 0;
  let correctionCount = 0;

  for (let pass = 0; pass < INFANTRY_SEPARATION_MAX_PASSES; pass++) {
    passes++;
    let movedInPass = false;
    for (let first = 0; first < candidates.length; first++) {
      const left = candidates[first];
      for (let second = first + 1; second < candidates.length; second++) {
        const right = candidates[second];
        const deltaX = left.agent.position.x - right.agent.position.x;
        const deltaZ = left.agent.position.z - right.agent.position.z;
        const distance = Math.hypot(deltaX, deltaZ);
        if (distance >= minimumDistance - INFANTRY_SEPARATION_TOLERANCE) {
          continue;
        }

        let directionX;
        let directionZ;
        if (distance > POSITION_EPSILON) {
          directionX = deltaX / distance;
          directionZ = deltaZ / distance;
        } else {
          [directionX, directionZ] = coincidentDirection(left.key, right.key);
        }
        const correctionDistance = (minimumDistance - distance) * 0.5;
        const leftMoved = projectCorrection(
          left,
          directionX * correctionDistance,
          directionZ * correctionDistance,
          collisionWorld,
          leftDisplacement
        );
        const rightMoved = projectCorrection(
          right,
          -directionX * correctionDistance,
          -directionZ * correctionDistance,
          collisionWorld,
          rightDisplacement
        );
        correctionCount++;
        if (leftMoved) {
          movedInPass = true;
          correctedKeys.add(left.key);
          correctedUnitIds.add(left.unitId);
        }
        if (rightMoved) {
          movedInPass = true;
          correctedKeys.add(right.key);
          correctedUnitIds.add(right.unitId);
        }
      }
    }
    if (!movedInPass) break;
  }

  for (const candidate of candidates) {
    if (!correctedKeys.has(candidate.key)) continue;
    const height = sampleHeight.call(
      terrain,
      candidate.agent.position.x,
      candidate.agent.position.z
    );
    if (!Number.isFinite(height)) {
      throw new TypeError(
        `Movement height is non-finite for ${candidate.key}`
      );
    }
    candidate.agent.position.y = height;
    candidate.agent.syncRecord?.();
  }

  const unresolved = unresolvedTelemetry(candidates);
  return {
    candidateCount: candidates.length,
    candidateKeys: candidates.map(candidate => candidate.key),
    passes,
    correctionCount,
    correctedSoldierKeys: [...correctedKeys].sort(compareText),
    correctedUnitIds: [...correctedUnitIds].sort(compareStableIds),
    unresolvedPairCount: unresolved.unresolvedPairCount,
    unresolvedPairs: unresolved.unresolvedPairs,
    converged: unresolved.unresolvedPairCount === 0
  };
}

export class InfantrySeparationSystem {
  resolve(units, terrain) {
    return resolveInfantrySeparation(units, terrain);
  }
}
