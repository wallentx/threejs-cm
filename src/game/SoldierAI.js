import * as THREE from 'three';
import { SoldierAgent } from './SoldierAgent.js';
import {
  advanceInfantryAnimation,
  applyInfantrySecondaryPose,
  bindInfantryHandsToWeapon
} from '../world/infantry/index.js';
import {
  advanceInfantryAmmunitionTransfer,
  captureInfantryAmmunitionTransferState
} from '../simulation/infantry/InfantryAmmunitionTransfer.js';
import {
  cloneThreatMemoryState
} from '../simulation/infantry/ThreatMemory.js';
import {
  getInfantryMovementOrderProfile,
  getInfantryMovementFormationOffset,
  isInfantryOrderMovingFireProhibited
} from '../simulation/infantry/InfantryMovementOrders.js';
import {
  InfantryDangerMap
} from '../simulation/infantry/InfantryDangerMap.js';
import {
  evaluateInfantryWithdrawal,
  INFANTRY_WITHDRAWAL_POLICY
} from '../simulation/infantry/InfantryWithdrawal.js';
import {
  INFANTRY_COLLISION_RADIUS
} from '../simulation/infantry/InfantrySeparationSystem.js';
import {
  evaluateInfantrySurrender
} from '../simulation/infantry/InfantrySurrender.js';
import {
  classifyIndividualMorale
} from '../simulation/infantry/InfantrySuppression.js';
import {
  canParticipateInInfantryFireMovement,
  evaluateInfantryFireMovementOrder,
  planHaltedHuntMoverGoal
} from '../simulation/infantry/InfantryFireMovement.js';
import {
  INFANTRY_BUDDY_BOUND_MODEL
} from '../simulation/infantry/InfantryBuddyBounds.js';
import {
  appendProcessedCasualtyEvent,
  evaluateInfantryCasualtyReaction,
  INFANTRY_CASUALTY_REACTION_POLICY
} from '../simulation/infantry/InfantryCasualtyReaction.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchGoal = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchVelocity = new THREE.Vector3();
const scratchThreat = new THREE.Vector3();
const scratchImpact = new THREE.Vector3();
const scratchSpacing = { x: 0, z: 0, nearest: Infinity };

function hash01(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function copySoldier(soldier) {
  const copy = {
    ...soldier,
    worldPosition: [...soldier.worldPosition],
    velocity: [...soldier.velocity],
    slotOffset: [...soldier.slotOffset],
    processedCasualtyEvents: Array.isArray(soldier.processedCasualtyEvents)
      ? soldier.processedCasualtyEvents.slice(
          -INFANTRY_CASUALTY_REACTION_POLICY.maxProcessedCasualtyEvents
        )
      : [],
    lastCasualtyState: soldier.lastCasualtyState ?? 'OK',
    casualtyEventEvidence: soldier.casualtyEventEvidence
      ? {
          ...soldier.casualtyEventEvidence,
          position: Array.isArray(soldier.casualtyEventEvidence.position)
            ? [...soldier.casualtyEventEvidence.position]
            : null
        }
      : null,
    incomingThreatPosition: soldier.incomingThreatPosition
      ? [...soldier.incomingThreatPosition]
      : null,
    incomingImpactPosition: soldier.incomingImpactPosition
      ? [...soldier.incomingImpactPosition]
      : null,
    tacticalDecision: soldier.tacticalDecision
      ? {
          ...soldier.tacticalDecision,
          threatPosition: soldier.tacticalDecision.threatPosition
            ? [...soldier.tacticalDecision.threatPosition]
            : null,
          impactPosition: soldier.tacticalDecision.impactPosition
            ? [...soldier.tacticalDecision.impactPosition]
            : null,
          threatMemoryPosition: soldier.tacticalDecision.threatMemoryPosition
            ? [...soldier.tacticalDecision.threatMemoryPosition]
            : null,
          goal: soldier.tacticalDecision.goal ? [...soldier.tacticalDecision.goal] : null,
          dangerFactors: soldier.tacticalDecision.dangerFactors
            ? { ...soldier.tacticalDecision.dangerFactors }
            : null,
          dangerSources: soldier.tacticalDecision.dangerSources
            ? [...soldier.tacticalDecision.dangerSources]
            : null,
          withdrawalActive: soldier.tacticalDecision.withdrawalActive ?? false,
          facingEnemy: soldier.tacticalDecision.facingEnemy ?? false,
          withdrawalVector: soldier.tacticalDecision.withdrawalVector
            ? [...soldier.tacticalDecision.withdrawalVector]
            : null,
          withdrawalGoal: soldier.tacticalDecision.withdrawalGoal
            ? [...soldier.tacticalDecision.withdrawalGoal]
            : null,
          surrendered: soldier.tacticalDecision.surrendered ?? false,
          casualtyProximityResponse: soldier.tacticalDecision.casualtyProximityResponse ?? false,
          casualtyDistanceMeters: soldier.tacticalDecision.casualtyDistanceMeters ?? null
        }
      : null,
    supportAmmunitionTransfer:
      captureInfantryAmmunitionTransferState(
        soldier.supportAmmunitionTransfer
      ),
    threatMemory: cloneThreatMemoryState(soldier.threatMemory)
  };
  if (!copy.supportAmmunitionTransfer) {
    delete copy.supportAmmunitionTransfer;
  }
  delete copy.dangerMapState;
  return copy;
}

function stableIdCompare(left, right) {
  const leftKey = String(left);
  const rightKey = String(right);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return 0;
}

function isCasualtyEventEvidence(event) {
  return Boolean(
    event
    && ((typeof event.eventId === 'string' && event.eventId.length > 0)
      || (typeof event.eventId === 'number' && Number.isFinite(event.eventId)))
    && ((typeof event.unitId === 'string' && event.unitId.length > 0)
      || (typeof event.unitId === 'number' && Number.isFinite(event.unitId)))
    && ((typeof event.casualtyId === 'string' && event.casualtyId.length > 0)
      || (typeof event.casualtyId === 'number' && Number.isFinite(event.casualtyId)))
    && Array.isArray(event.position)
    && event.position.length >= 3
    && event.position.slice(0, 3).every(Number.isFinite)
  );
}

function casualtyState(agent) {
  if (!agent.isAlive || agent.status === 'KIA' || agent.status === 'DEAD') {
    return 'KIA';
  }
  if (agent.status === 'INCAPACITATED') return 'INCAPACITATED';
  if (agent.status === 'WOUNDED') return 'WOUNDED';
  return 'OK';
}

function obstacleVerticalBounds(obstacle, terrain) {
  const centerX = Number.isFinite(obstacle.centerX)
    ? obstacle.centerX
    : Number.isFinite(obstacle.x)
      ? obstacle.x
      : ((obstacle.minX ?? 0) + (obstacle.maxX ?? 0)) * 0.5;
  const centerZ = Number.isFinite(obstacle.centerZ)
    ? obstacle.centerZ
    : Number.isFinite(obstacle.z)
      ? obstacle.z
      : ((obstacle.minZ ?? 0) + (obstacle.maxZ ?? 0)) * 0.5;
  const groundY = typeof terrain?.getHeightAt === 'function'
    ? terrain.getHeightAt(centerX, centerZ)
    : 0;
  const minY = Number.isFinite(obstacle.minY) ? obstacle.minY : groundY;
  const maxY = Number.isFinite(obstacle.maxY)
    ? obstacle.maxY
    : minY + Math.max(0, Number(obstacle.height) || 2);
  return [minY, maxY];
}

function segmentIntersectsObstacle3D(start, end, obstacle, terrain) {
  const minX = Number.isFinite(obstacle.minX)
    ? obstacle.minX
    : ((obstacle.centerX ?? obstacle.x ?? 0)
      - (obstacle.halfX ?? (obstacle.width ?? 1) * 0.5));
  const maxX = Number.isFinite(obstacle.maxX)
    ? obstacle.maxX
    : ((obstacle.centerX ?? obstacle.x ?? 0)
      + (obstacle.halfX ?? (obstacle.width ?? 1) * 0.5));
  const minZ = Number.isFinite(obstacle.minZ)
    ? obstacle.minZ
    : ((obstacle.centerZ ?? obstacle.z ?? 0)
      - (obstacle.halfZ ?? (obstacle.depth ?? 1) * 0.5));
  const maxZ = Number.isFinite(obstacle.maxZ)
    ? obstacle.maxZ
    : ((obstacle.centerZ ?? obstacle.z ?? 0)
      + (obstacle.halfZ ?? (obstacle.depth ?? 1) * 0.5));
  const [minY, maxY] = obstacleVerticalBounds(obstacle, terrain);

  let t0 = 0;
  let t1 = 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;

  const p = [-dx, dx, -dy, dy, -dz, dz];
  const q = [
    start.x - minX,
    maxX - start.x,
    start.y - minY,
    maxY - start.y,
    start.z - minZ,
    maxZ - start.z
  ];

  for (let i = 0; i < 6; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

function checkCasualtyLOS(observerPos, casualtyPos, terrain) {
  const start = {
    x: observerPos.x ?? observerPos[0],
    y: (observerPos.y ?? observerPos[1] ?? 0) + 1.45,
    z: observerPos.z ?? observerPos[2] ?? observerPos[1]
  };
  const end = {
    x: casualtyPos.x ?? casualtyPos[0],
    y: (casualtyPos.y ?? casualtyPos[1] ?? 0) + 0.9,
    z: casualtyPos.z ?? casualtyPos[2] ?? casualtyPos[1]
  };
  if (![start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)) {
    return false;
  }

  let obstacles;
  if (typeof terrain?.getSightOccluderSnapshot === 'function') {
    const snapshot = terrain.getSightOccluderSnapshot();
    if (!snapshot || !Number.isSafeInteger(snapshot.revision)
        || !Array.isArray(snapshot.records)) return false;
    obstacles = snapshot.records;
  } else {
    obstacles = terrain?.bocageObstacles ?? [];
  }
  for (const obstacle of obstacles) {
    if (obstacle?.occludesSight === false) continue;
    if (segmentIntersectsObstacle3D(start, end, obstacle, terrain)) return false;
  }

  if (typeof terrain?.getHeightAt === 'function') {
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const samples = Math.floor(distance / 2);
    for (let sample = 1; sample < samples; sample++) {
      const t = sample / samples;
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;
      const sightY = start.y + (end.y - start.y) * t;
      if (terrain.getHeightAt(x, z) >= sightY) return false;
    }
  }
  return true;
}

function readPosition(value, target) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value) && value.length >= 3) return target.fromArray(value);
  return null;
}

function isFinitePosition(position) {
  return Boolean(
    position
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z)
  );
}

function isStableIncomingFireEventId(value) {
  return (typeof value === 'string' && value.length > 0)
    || (typeof value === 'number' && Number.isFinite(value));
}

function normalizeObservedThreatEvidenceId(value) {
  if (!isStableIncomingFireEventId(value)) {
    throw new TypeError(
      'observed threat requires a non-empty stable observation, target, or source ID'
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizeObservedThreatPosition(value) {
  let x;
  let z;
  if (Array.isArray(value)) {
    if (value.length === 2) {
      [x, z] = value;
    } else if (value.length === 3) {
      x = value[0];
      z = value[2];
    }
  } else {
    x = value?.x;
    z = value?.z;
  }
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError(
      'observed threat position must contain finite X and Z components'
    );
  }
  return [Object.is(x, -0) ? 0 : x, Object.is(z, -0) ? 0 : z];
}

function canReactToThreat(agent) {
  return Boolean(
    agent.isAlive
    && !['INCAPACITATED', 'DEAD', 'SURRENDERED'].includes(agent.status)
    && agent.state !== 'SURRENDERED'
  );
}

function hasStableUnitId(unit) {
  return (typeof unit?.id === 'string' && unit.id.length > 0)
    || (typeof unit?.id === 'number' && Number.isFinite(unit.id));
}

function hasValidRetainedDirectTarget(unit) {
  const target = unit.targetUnit;
  return Boolean(
    target
    && target !== unit
    && hasStableUnitId(target)
    && typeof target.faction === 'string'
    && target.faction.length > 0
    && target.faction !== unit.faction
    && typeof target.isCombatEffective === 'function'
    && target.isCombatEffective()
  );
}

function isBuildingTransitActive(agents) {
  return agents.some(agent => {
    const phase = agent.buildingLocation?.phase;
    return phase && !['outside', 'approaching'].includes(phase);
  });
}

function segmentIntersectsBounds(start, end, bounds) {
  let minimum = 0;
  let maximum = 1;
  for (const [origin, delta, low, high] of [
    [start.x, end.x - start.x, bounds.minX, bounds.maxX],
    [start.z, end.z - start.z, bounds.minZ, bounds.maxZ]
  ]) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const first = (low - origin) / delta;
    const second = (high - origin) / delta;
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    minimum = Math.max(minimum, near);
    maximum = Math.min(maximum, far);
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
}

function coverCandidates(bounds, clearance, agentPosition) {
  const projectedX = THREE.MathUtils.clamp(agentPosition.x, bounds.minX, bounds.maxX);
  const projectedZ = THREE.MathUtils.clamp(agentPosition.z, bounds.minZ, bounds.maxZ);
  return [
    { side: 'west', x: bounds.minX - clearance, z: projectedZ },
    { side: 'east', x: bounds.maxX + clearance, z: projectedZ },
    { side: 'north', x: projectedX, z: bounds.minZ - clearance },
    { side: 'south', x: projectedX, z: bounds.maxZ + clearance }
  ];
}

export function selectNearbyCover(agent, terrain, threatPosition, neighbors = [], maximumDistance = 9, dangerMap = null, preferRearVector = null) {
  const obstacles = terrain?.bocageObstacles ?? [];
  let best = null;
  for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
    const obstacle = obstacles[obstacleIndex];
    if (![obstacle.minX, obstacle.maxX, obstacle.minZ, obstacle.maxZ].every(Number.isFinite)) continue;
    const obstacleId = obstacle.id ?? `${obstacle.type ?? 'cover'}:${obstacleIndex}`;
    for (const candidate of coverCandidates(obstacle, 0.42, agent.position)) {
      const travelDistance = Math.hypot(candidate.x - agent.position.x, candidate.z - agent.position.z);
      if (travelDistance > maximumDistance) continue;
      const shielded = threatPosition
        ? segmentIntersectsBounds(threatPosition, candidate, obstacle)
        : false;
      let nearestNeighbor = Infinity;
      for (const neighbor of neighbors) {
        if (neighbor === agent || !neighbor.isAlive) continue;
        nearestNeighbor = Math.min(
          nearestNeighbor,
          Math.hypot(candidate.x - neighbor.position.x, candidate.z - neighbor.position.z)
        );
      }
      const crowdPenalty = nearestNeighbor < 1.1 ? (1.1 - nearestNeighbor) * 1.8 : 0;
      const protection = obstacle.type === 'building' ? 1.35 : obstacle.type === 'stonewall' ? 1.0 : 0.7;
      let score = protection * (shielded ? 5 : 1.7) - travelDistance * 0.32 - crowdPenalty;
      if (preferRearVector) {
        const dx = candidate.x - agent.position.x;
        const dz = candidate.z - agent.position.z;
        const dot = dx * preferRearVector.x + dz * preferRearVector.z;
        if (dot > 0) score += dot * 1.5;
      }
      if (dangerMap?.size > 0) {
        const dangerRes = dangerMap.queryPoint([candidate.x, candidate.z]);
        if (dangerRes.known && dangerRes.danger > 0) {
          score -= dangerRes.danger * 3.5;
        }
      }
      const key = `${obstacleId}:${candidate.side}`;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && key < best.key)) {
        best = {
          key,
          obstacleId,
          obstacleType: obstacle.type ?? 'cover',
          side: candidate.side,
          score,
          shielded,
          travelDistance,
          position: new THREE.Vector3(
            candidate.x,
            terrain.getHeightAt(candidate.x, candidate.z),
            candidate.z
          )
        };
      }
    }
  }
  return best;
}

function createWithdrawalRouteCandidate({
  collisionWorld,
  terrain,
  agent,
  destination,
  id,
  kind,
  score
}) {
  if (typeof collisionWorld?.getNavigationPath !== 'function') return null;
  const path = collisionWorld.getNavigationPath(
    agent.position,
    destination,
    INFANTRY_COLLISION_RADIUS,
    'infantry',
    { clearance: 0.05, waypointClearance: 0.05 }
  );
  const next = path?.[0];
  const final = path?.[path.length - 1];
  if (!Number.isFinite(next?.x)
      || !Number.isFinite(next?.z)
      || !Number.isFinite(final?.x)
      || !Number.isFinite(final?.z)) {
    return null;
  }
  return {
    id,
    kind,
    score,
    navigable: true,
    goal: [next.x, next.z],
    destination: [final.x, final.z],
    height: terrain.getHeightAt(next.x, next.z)
  };
}

function spacingCorrection(agent, neighbors, desiredSpacing = 1.05, result = scratchSpacing) {
  let x = 0;
  let z = 0;
  let nearest = Infinity;
  for (const neighbor of neighbors) {
    if (neighbor === agent || !neighbor.isAlive) continue;
    const dx = agent.position.x - neighbor.position.x;
    const dz = agent.position.z - neighbor.position.z;
    const distance = Math.hypot(dx, dz);
    nearest = Math.min(nearest, distance);
    if (distance > 1e-4 && distance < desiredSpacing) {
      const weight = (desiredSpacing - distance) / desiredSpacing;
      x += dx / distance * weight;
      z += dz / distance * weight;
    }
  }
  result.x = x;
  result.z = z;
  result.nearest = nearest;
  return result;
}

export class SoldierAI {
  constructor(unit) {
    this.unit = unit;
    this.debugLines = null;
    this.dangerMap = new InfantryDangerMap();
    this.initialize();
  }

  initialize() {
    const meshes = this.unit.mesh?.userData.soldiers ?? [];
    this.unit.roster.forEach((soldier, index) => {
      const mesh = meshes[index];
      const slotOffset = mesh?.userData.slotOffset ?? this.getFormationOffset(index, 'QUICK').toArray();
      scratchPosition
        .fromArray(slotOffset)
        .applyAxisAngle(UP, this.unit.rotation)
        .add(this.unit.position);

      const variation = hash01(`${this.unit.id}:${soldier.id}`);
      const initialStatus = soldier.status ?? 'OK';
      const initialHealth = soldier.health ?? 100;
      const initialCasualtyState = (initialHealth <= 0 || initialStatus === 'KIA' || initialStatus === 'DEAD')
        ? 'KIA'
        : (initialStatus === 'INCAPACITATED')
          ? 'INCAPACITATED'
          : (initialStatus === 'WOUNDED')
            ? 'WOUNDED'
            : 'OK';

      Object.assign(soldier, {
        role: soldier.role ?? this.getRole(soldier.weapon),
        health: soldier.health ?? 100,
        suppression: soldier.suppression ?? 0,
        stance: soldier.stance ?? 'STANDING',
        state: soldier.state ?? 'READY',
        lastCasualtyState: soldier.lastCasualtyState ?? initialCasualtyState,
        casualtyEventVersion: Number.isSafeInteger(soldier.casualtyEventVersion)
          ? Math.max(0, soldier.casualtyEventVersion)
          : 0,
        casualtyEventEvidence: soldier.casualtyEventEvidence
          ? {
              ...soldier.casualtyEventEvidence,
              position: Array.isArray(soldier.casualtyEventEvidence.position)
                ? [...soldier.casualtyEventEvidence.position]
                : null
            }
          : null,
        processedCasualtyEvents: Array.isArray(soldier.processedCasualtyEvents)
          ? soldier.processedCasualtyEvents.slice(
              -INFANTRY_CASUALTY_REACTION_POLICY.maxProcessedCasualtyEvents
            )
          : [],
        worldPosition: soldier.worldPosition ?? scratchPosition.toArray(),
        velocity: soldier.velocity ?? [0, 0, 0],
        facing: soldier.facing ?? this.unit.rotation,
        reactionDelay: soldier.reactionDelay ?? variation * 0.65,
        pace: soldier.pace ?? 0.9 + variation * 0.2,
        stridePhase: soldier.stridePhase ?? variation * Math.PI * 2,
        poseTime: soldier.poseTime ?? 0,
        idlePhase: soldier.idlePhase ?? variation * Math.PI * 2,
        fireCooldown: soldier.fireCooldown ?? variation * 1.4,
        slotOffset: soldier.slotOffset ?? [...slotOffset],
        commandWaypoint: soldier.commandWaypoint ?? -1,
        incomingFireTimer: soldier.incomingFireTimer ?? 0,
        incomingFireIntensity: soldier.incomingFireIntensity ?? 0,
        incomingFireEventVersion: soldier.incomingFireEventVersion ?? 0,
        incomingThreatPosition: soldier.incomingThreatPosition
          ? [...soldier.incomingThreatPosition]
          : null,
        incomingImpactPosition: soldier.incomingImpactPosition
          ? [...soldier.incomingImpactPosition]
          : null,
        casualtyResponseTimer: soldier.casualtyResponseTimer ?? 0,
        casualtyResponseTicksRemaining: Number.isSafeInteger(
          soldier.casualtyResponseTicksRemaining
        )
          ? Math.max(0, soldier.casualtyResponseTicksRemaining)
          : Math.max(0, Math.round(
              (soldier.casualtyResponseTimer ?? 0)
              * INFANTRY_CASUALTY_REACTION_POLICY.timerTicksPerSecond
            )),
        casualtyResponseTickRemainder: Number.isFinite(
          soldier.casualtyResponseTickRemainder
        )
          ? Math.max(0, Math.min(1, soldier.casualtyResponseTickRemainder))
          : 0,
        lastSuppression: soldier.lastSuppression ?? soldier.suppression ?? 0,
        tacticalDecision: soldier.tacticalDecision ?? {
          reason: 'formation',
          coverId: null,
          coverScore: null,
          shielded: false,
          nearestNeighborMeters: null
        },
        status: soldier.status ?? 'OK'
      });
      if (mesh) mesh.userData.soldierId = soldier.id;
    });
    this.agents = this.unit.roster.map((soldier, index) =>
      new SoldierAgent(this.unit, soldier, meshes[index], index)
    );
    this.formationGoals = this.agents.map(() => new THREE.Vector3());
    this.syncMeshes();
  }

  getRole(weapon) {
    if (/FM 24\/29|MG34/.test(weapon)) return 'GUNNER';
    if (/MAS-38|MP40/.test(weapon)) return 'LEADER';
    return 'RIFLEMAN';
  }

  getFormationOffset(index, orderType = 'QUICK') {
    const profiledOffset =
      getInfantryMovementFormationOffset(orderType, index);
    if (profiledOffset) {
      return new THREE.Vector3(
        profiledOffset.x,
        profiledOffset.y,
        profiledOffset.z
      );
    }
    if (orderType === 'FAST') {
      return new THREE.Vector3(index % 2 === 0 ? -0.48 : 0.48, 0, -Math.floor(index / 2) * 1.2);
    }
    if (orderType === 'HUNT') {
      const huntSlots = [
        [0, 0],
        [-1.25, -1.25],
        [1.25, -1.25],
        [-2.2, -2.5],
        [0, -2.5],
        [2.2, -2.5]
      ];
      const slot = huntSlots[index] ?? [((index % 3) - 1) * 1.35, -Math.floor(index / 3) * 1.5];
      return new THREE.Vector3(slot[0], 0, slot[1]);
    }
    return new THREE.Vector3(((index % 3) - 1) * 1.35, 0, (Math.floor(index / 3) - 0.5) * 1.7);
  }

  getAnchorSpeedLimit(
    orderType = 'QUICK',
    { hasDirectPrecisionObservation = false } = {}
  ) {
    if (
      orderType === 'QUICK'
      && hasDirectPrecisionObservation
      && hasValidRetainedDirectTarget(this.unit)
    ) {
      return Infinity;
    }
    const profile = getInfantryMovementOrderProfile(orderType);
    const baseSpeed = profile?.individual.speedMetersPerSecond
      ?? (orderType === 'FAST'
        ? 5.1
        : (orderType === 'HUNT' ? 1.75 : 2.75));
    const eligible = this.getLivingAgents().filter(agent =>
      !agent.buildingLocation
      || ['outside', 'approaching'].includes(agent.buildingLocation.phase));
    if (eligible.length === 0) return baseSpeed;
    return Math.min(...eligible.map(agent =>
      baseSpeed * agent.pace * (agent.isWounded ? 0.55 : 1)));
  }

  getAnchorCohesionScale(
    orderType = 'QUICK',
    { hasDirectPrecisionObservation = false } = {}
  ) {
    if (getInfantryMovementOrderProfile(orderType)) return 1;
    if (
      orderType === 'QUICK'
      && hasDirectPrecisionObservation
      && hasValidRetainedDirectTarget(this.unit)
    ) {
      return 1;
    }
    const cosine = Math.cos(this.unit.rotation);
    const sine = Math.sin(this.unit.rotation);
    let maximumLag = 0;
    for (const agent of this.getLivingAgents()) {
      // BuildingInteractionSystem owns approach, door, and stair routing.
      // Its assigned soldiers can intentionally occupy different sides of the
      // footprint, so they must not deadlock the ordinary squad-anchor tether.
      if (agent.buildingLocation) continue;
      const offset = this.getFormationOffset(agent.index, orderType);
      const goalX =
        this.unit.position.x + cosine * offset.x + sine * offset.z;
      const goalZ =
        this.unit.position.z - sine * offset.x + cosine * offset.z;
      maximumLag = Math.max(
        maximumLag,
        Math.hypot(agent.position.x - goalX, agent.position.z - goalZ)
      );
    }
    const softTetherMeters = 1.5;
    const hardTetherMeters = 4;
    const blockedRouteCrawlScale = 0.2;
    if (maximumLag <= softTetherMeters) return 1;
    if (maximumLag >= hardTetherMeters) return blockedRouteCrawlScale;
    const progress =
      (maximumLag - softTetherMeters)
      / (hardTetherMeters - softTetherMeters);
    return 1 - progress * (1 - blockedRouteCrawlScale);
  }

  recordCasualtyTransitions() {
    const victims = [...this.agents]
      .sort((left, right) => stableIdCompare(left.id, right.id));
    for (const victim of victims) {
      const currentState = casualtyState(victim);
      const previousState = victim.record.lastCasualtyState ?? 'OK';
      if (currentState === previousState) continue;
      victim.record.lastCasualtyState = currentState;
      if (currentState === 'OK') continue;

      const version = Math.max(
        0,
        Number.isSafeInteger(victim.record.casualtyEventVersion)
          ? victim.record.casualtyEventVersion
          : 0
      ) + 1;
      if (!Number.isSafeInteger(version)) {
        throw new RangeError(`casualty event version exhausted for ${victim.id}`);
      }
      const eventId = `casualty:${this.unit.id}:${victim.id}:v${version}:${currentState}`;
      const evidence = {
        eventId,
        unitId: this.unit.id,
        casualtyId: victim.id,
        version,
        state: currentState,
        position: [victim.position.x, victim.position.y, victim.position.z]
      };
      victim.record.casualtyEventVersion = version;
      victim.record.casualtyEventEvidence = evidence;
      this.dangerMap.recordCasualty({
        sourceId: eventId,
        casualtyPosition: [victim.position.x, victim.position.z],
        radiusMeters: 10,
        intensity: 0.8,
        confidence: 1.0,
        lifetimeTicks: 20
      });
    }
  }

  update(delta, terrain, context = {}) {
    const { anchorMoving = false, orderType = 'QUICK' } = context;
    const dt = Math.max(0, Number.isFinite(delta) ? delta : 0);
    this.dangerMap.advanceSeconds(dt);
    const livingCount = this.getLivingAgents().length;
    const fallbackThreatPosition = context.threatPosition
      ?? this.unit.targetUnit?.position
      ?? this.unit.targetPos
      ?? null;
    const cosine = Math.cos(this.unit.rotation);
    const sine = Math.sin(this.unit.rotation);
    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const formationOffset = this.getFormationOffset(index, orderType);
      agent.slotOffset.copy(formationOffset);
      const formationGoal = this.formationGoals[index];
      formationGoal.set(
        this.unit.position.x
          + cosine * formationOffset.x
          + sine * formationOffset.z,
        0,
        this.unit.position.z
          - sine * formationOffset.x
          + cosine * formationOffset.z
      );
      formationGoal.y = terrain.getHeightAt(
        formationGoal.x,
        formationGoal.z
      );
    }

    const waypointIndex = this.unit.currentWaypointIndex;
    const activeWaypoint = this.unit.waypoints[waypointIndex] ?? null;
    const finalWaypoint = waypointIndex === this.unit.waypoints.length - 1;
    const nearFinalWaypoint = Boolean(
      activeWaypoint
      && finalWaypoint
      && Math.hypot(
        activeWaypoint.position.x - this.unit.position.x,
        activeWaypoint.position.z - this.unit.position.z
      ) < 0.8
    );
    const currentOrderType = activeWaypoint?.orderType ?? orderType;
    const fireMovement = evaluateInfantryFireMovementOrder({
      waypointOrderType: activeWaypoint?.orderType ?? null,
      requestedOrderType: currentOrderType,
      hasValidDirectTarget: hasValidRetainedDirectTarget(this.unit),
      hasDirectPrecisionObservation:
        context.hasDirectPrecisionObservation === true,
      buildingTransitActive: isBuildingTransitActive(this.agents),
      nearFinalWaypoint
    });
    const waypointKey = activeWaypoint
      ? [
          waypointIndex,
          activeWaypoint.orderType,
          activeWaypoint.position.x,
          activeWaypoint.position.y,
          activeWaypoint.position.z
        ].join(':')
      : null;
    const boundMembers = fireMovement.active
      ? this.agents
          .map((agent, index) => ({
            agent,
            goal: this.formationGoals[index]
          }))
          .filter(({ agent }) =>
            canParticipateInInfantryFireMovement({
              alive: agent.isAlive,
              status: agent.status,
              state: agent.state,
              buildingPhase: agent.buildingLocation?.phase ?? null,
              reloadSeconds: agent.reloadTimer,
              magazineAmmo: agent.magazineAmmo,
              suppression: agent.suppression,
              moraleTier: agent.moraleTier,
              unitMorale: this.unit.morale,
              incomingFireSeconds: agent.record.incomingFireTimer,
              casualtyResponseSeconds:
                agent.record.casualtyResponseTimer,
              suppressionDelta:
                agent.suppression
                - (agent.record.lastSuppression ?? agent.suppression)
            }))
          .map(({ agent, goal }) => ({
            id: agent.id,
            x: agent.position.x,
            z: agent.position.z,
            goalX: goal.x,
            goalZ: goal.z
          }))
      : [];
    const boundDirectives = this.unit.infantryBuddyBounds?.update({
      active: fireMovement.active,
      reform: fireMovement.reform,
      waypointKey,
      members: boundMembers
    }) ?? new Map();
    const haltedHuntPairs = (
      context.haltAnchorMovement === true
      && currentOrderType === 'HUNT'
      && fireMovement.active
    )
      ? new Map(
          (this.unit.infantryBuddyBounds?.captureState().pairs ?? [])
            .map(pair => [pair.pairId, pair])
        )
      : null;

    if (hasValidRetainedDirectTarget(this.unit) && context.hasDirectPrecisionObservation === true) {
      const target = this.unit.targetUnit;
      this.registerObservedThreat(target.position, {
        targetId: target.id,
        intensity: 0.8,
        confidence: 0.9,
        lifetimeTicks: 15
      });
    }

    this.recordCasualtyTransitions();
    const casualtyEvents = [...this.agents]
      .sort((left, right) => stableIdCompare(left.id, right.id))
      .map(victim => victim.record.casualtyEventEvidence)
      .filter(isCasualtyEventEvidence);

    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const soldier = agent.record;
      advanceInfantryAnimation(soldier, dt);
      const canReact = canReactToThreat(agent);
      const currentMemory = agent.isAlive
        ? agent.threatMemory.advance(dt)
        : null;
      const rememberedThreat = canReact ? currentMemory : null;

      const dangerResult = canReact
        ? this.dangerMap.queryPoint([agent.position.x, agent.position.z])
        : null;

      soldier.incomingFireTimer = Math.max(0, (soldier.incomingFireTimer ?? 0) - dt);
      if (soldier.incomingFireTimer === 0) soldier.incomingFireIntensity = 0;
      const suppressionIncrease = agent.suppression - (soldier.lastSuppression ?? agent.suppression);
      if (suppressionIncrease >= 4) soldier.incomingFireTimer = Math.max(soldier.incomingFireTimer, 2.4);

      if (!Array.isArray(soldier.processedCasualtyEvents)) {
        soldier.processedCasualtyEvents = [];
      }

      let casualtyProximityResponse = false;
      let minCasualtyDist = Infinity;
      let casualtyShock = 0;
      let newCasualtyReaction = false;
      const responseActiveAtStepStart =
        (soldier.casualtyResponseTicksRemaining ?? 0) > 0;
      const suppressionBeforeCasualtyReaction = agent.suppression;

      for (const cEvent of casualtyEvents) {
        const alreadyProcessed = soldier.processedCasualtyEvents.includes(cEvent.eventId);
        const isDead = !agent.isAlive || agent.status === 'KIA' || agent.status === 'DEAD';
        const isIncapped = agent.status === 'INCAPACITATED';
        const isSurrendered = agent.status === 'SURRENDERED' || agent.state === 'SURRENDERED';
        const hasLOS = checkCasualtyLOS(agent.position, cEvent.position, terrain);
        const reactionInput = {
          soldierId: agent.id,
          casualtyId: cEvent.casualtyId,
          eventId: cEvent.eventId,
          observerPosition: [agent.position.x, agent.position.z],
          casualtyPosition: [cEvent.position[0], cEvent.position[2]],
          available: agent.isAlive && !isBuildingTransitActive([agent]),
          living: !isDead,
          incapacitated: isIncapped,
          surrendered: isSurrendered,
          sameUnit: cEvent.unitId === this.unit.id,
          awareOfCasualty: hasLOS,
          hasLOS,
          alreadyProcessed
        };
        const reaction = evaluateInfantryCasualtyReaction(reactionInput);
        if (reaction.active) {
          soldier.processedCasualtyEvents = appendProcessedCasualtyEvent(
            soldier.processedCasualtyEvents,
            cEvent.eventId
          );
          casualtyShock += reaction.shock;
          soldier.casualtyResponseTicksRemaining = Math.max(
            soldier.casualtyResponseTicksRemaining ?? 0,
            Math.round(
              reaction.timerSeconds
              * INFANTRY_CASUALTY_REACTION_POLICY.timerTicksPerSecond
            )
          );
          newCasualtyReaction = true;
          casualtyProximityResponse = true;
          minCasualtyDist = Math.min(minCasualtyDist, reaction.distanceMeters);
        } else if (reaction.reason === 'already-processed') {
          const dist = Math.hypot(
            agent.position.x - cEvent.position[0],
            agent.position.z - cEvent.position[2]
          );
          if (dist <= INFANTRY_CASUALTY_REACTION_POLICY.maximumDistanceMeters
              && (soldier.casualtyResponseTicksRemaining ?? 0) > 0) {
            casualtyProximityResponse = true;
            minCasualtyDist = Math.min(minCasualtyDist, dist);
          }
        }
      }
      if ((soldier.casualtyResponseTicksRemaining ?? 0) > 0) {
        const priorRemainder = newCasualtyReaction && !responseActiveAtStepStart
          ? 0
          : Math.max(0, soldier.casualtyResponseTickRemainder ?? 0);
        const tickProgress = priorRemainder
          + dt * INFANTRY_CASUALTY_REACTION_POLICY.timerTicksPerSecond;
        const elapsedResponseTicks = Math.floor(tickProgress + 1e-9);
        soldier.casualtyResponseTickRemainder = Number(
          Math.max(0, tickProgress - elapsedResponseTicks).toFixed(12)
        );
        soldier.casualtyResponseTicksRemaining = Math.max(
          0,
          soldier.casualtyResponseTicksRemaining - elapsedResponseTicks
        );
        if (soldier.casualtyResponseTicksRemaining === 0) {
          soldier.casualtyResponseTickRemainder = 0;
        }
      } else {
        soldier.casualtyResponseTickRemainder = 0;
      }
      soldier.casualtyResponseTimer = Number((
        soldier.casualtyResponseTicksRemaining
        / INFANTRY_CASUALTY_REACTION_POLICY.timerTicksPerSecond
      ).toFixed(9));
      casualtyProximityResponse = casualtyProximityResponse
        && soldier.casualtyResponseTicksRemaining > 0;
      const goal = scratchGoal
        .copy(this.formationGoals[index]);
      const boundDirective =
        this.unit.infantryBuddyBounds?.getDirective(
          boundDirectives,
          agent.id
        ) ?? null;
      const hasBoundRole = boundDirective?.role === 'mover'
        || boundDirective?.role === 'coverer';
      const haltedHuntPair = haltedHuntPairs?.get(
        boundDirective?.pairId
      ) ?? null;
      const haltedHuntGoal = planHaltedHuntMoverGoal({
        active: fireMovement.active,
        orderType: currentOrderType,
        haltAnchorMovement: context.haltAnchorMovement === true,
        role: boundDirective?.role ?? null,
        moverStart: haltedHuntPair?.moverStart ?? null,
        formationGoal: [goal.x, goal.z],
        anchorPosition: [this.unit.position.x, this.unit.position.z],
        waypointPosition: activeWaypoint
          ? [activeWaypoint.position.x, activeWaypoint.position.z]
          : null,
        maximumAdvanceMeters:
          INFANTRY_BUDDY_BOUND_MODEL.boundDistanceMeters
      });
      if (haltedHuntGoal) {
        goal.set(
          haltedHuntGoal.x,
          terrain.getHeightAt(haltedHuntGoal.x, haltedHuntGoal.z),
          haltedHuntGoal.z
        );
      }

      const spacing = spacingCorrection(agent, this.agents);
      if (
        !hasBoundRole
        && Number.isFinite(spacing.nearest)
        && spacing.nearest < 1.05
      ) {
        goal.x += spacing.x * 0.55;
        goal.z += spacing.z * 0.55;
        goal.y = terrain.getHeightAt(goal.x, goal.z);
      }

      const hasLeader = this.agents.some(other =>
        other !== agent && other.isAlive
        && (other.role === 'LEADER' || other.index === 0)
        && agent.position.distanceTo(other.position) <= 25
      );
      const casualtyRatio = 1 - livingCount / Math.max(1, this.unit.roster.length);
      const alreadySurrendered =
        agent.status === 'SURRENDERED'
        || agent.state === 'SURRENDERED';

      const isHighSuppression =
        agent.suppression >= INFANTRY_WITHDRAWAL_POLICY.suppressionThreshold;
      const isHeavyCasualtyWithdrawal =
        casualtyRatio >= INFANTRY_WITHDRAWAL_POLICY.casualtyRatioThreshold
        && soldier.casualtyResponseTimer > 0;
      const hasWithdrawalPressure =
        isHighSuppression || isHeavyCasualtyWithdrawal;

      let reactionReason = null;
      if (alreadySurrendered) {
        reactionReason = 'surrender';
      } else if (hasWithdrawalPressure && rememberedThreat) {
        reactionReason = 'withdrawal';
      } else if (soldier.incomingFireTimer > 0) {
        reactionReason = 'incoming-fire';
      } else if (soldier.casualtyResponseTimer > 0) {
        reactionReason = 'casualty-response';
      } else if (rememberedThreat) {
        reactionReason = 'threat-memory';
      } else if (agent.suppression >= 35) {
        reactionReason = 'suppression-reaction';
      }

      const threatPosition = (
        reactionReason === 'threat-memory'
        || reactionReason === 'withdrawal'
      )
        ? (
            readPosition(rememberedThreat.threatPosition, scratchThreat)
            ?? fallbackThreatPosition
          )
        : (soldier.incomingFireTimer > 0 || agent.suppression >= 35)
          ? (
              readPosition(soldier.incomingThreatPosition, scratchThreat)
              ?? fallbackThreatPosition
            )
          : fallbackThreatPosition;

      let backwardVector = null;
      if (hasWithdrawalPressure && rememberedThreat && threatPosition) {
        const dx = agent.position.x - threatPosition.x;
        const dz = agent.position.z - threatPosition.z;
        const len = Math.hypot(dx, dz);
        backwardVector = len > 0.01
          ? { x: dx / len, z: dz / len }
          : null;
      }

      const cover = reactionReason && canReact
        ? selectNearbyCover(agent, terrain, threatPosition, this.agents, 12, this.dangerMap, backwardVector)
        : null;

      const withdrawalCandidates = [];
      if (hasWithdrawalPressure && rememberedThreat && backwardVector) {
        if (cover) {
          const coverCandidate = createWithdrawalRouteCandidate({
            collisionWorld: terrain.collisionWorld,
            terrain,
            agent,
            destination: cover.position,
            id: `cover:${cover.key}`,
            kind: 'cover',
            score: cover.score
          });
          if (coverCandidate) withdrawalCandidates.push(coverCandidate);
        }
        const fallbackDestination = {
          x: agent.position.x
            + backwardVector.x
              * INFANTRY_WITHDRAWAL_POLICY.fallbackDistanceMeters,
          z: agent.position.z
            + backwardVector.z
              * INFANTRY_WITHDRAWAL_POLICY.fallbackDistanceMeters
        };
        const fallbackCandidate = createWithdrawalRouteCandidate({
          collisionWorld: terrain.collisionWorld,
          terrain,
          agent,
          destination: fallbackDestination,
          id: `fallback:${typeof rememberedThreat.eventId}:${String(rememberedThreat.eventId)}:${agent.id}`,
          kind: 'fallback',
          score: 0
        });
        if (fallbackCandidate) withdrawalCandidates.push(fallbackCandidate);
      }
      const buildingPhase = agent.buildingLocation?.phase ?? null;
      const withdrawal = evaluateInfantryWithdrawal({
        soldierId: agent.id,
        available: canReact,
        casualty: !agent.isAlive
          || ['INCAPACITATED', 'DEAD'].includes(agent.status),
        surrendered: alreadySurrendered,
        buildingTransit: Boolean(
          buildingPhase
          && !['outside', 'approaching'].includes(buildingPhase)
        ),
        explicitOrder: Boolean(activeWaypoint),
        buddyBound: hasBoundRole,
        suppression: agent.suppression,
        casualtyRatio,
        casualtyResponseActive: soldier.casualtyResponseTimer > 0,
        position: [agent.position.x, agent.position.z],
        threat: rememberedThreat
          ? {
              id: rememberedThreat.eventId,
              position: [
                rememberedThreat.threatPosition[0],
                rememberedThreat.threatPosition[2]
              ]
            }
          : null,
        candidates: withdrawalCandidates
      });
      const surrender = evaluateInfantrySurrender({
        soldierId: agent.id,
        alreadySurrendered,
        retainedThreatId: soldier.tacticalDecision?.surrenderThreatId,
        living: agent.isAlive
          && !['INCAPACITATED', 'DEAD'].includes(agent.status),
        routed: classifyIndividualMorale(agent.suppression) === 'ROUTED'
          || agent.state === 'FLEEING',
        buildingTransit: Boolean(
          buildingPhase
          && !['outside', 'approaching'].includes(buildingPhase)
        ),
        escaping: Boolean(activeWaypoint || hasBoundRole),
        suppression: agent.suppression,
        casualtyRatio,
        leaderNearby: hasLeader,
        position: [agent.position.x, agent.position.z],
        threat: rememberedThreat
          ? {
              id: rememberedThreat.eventId,
              position: [
                rememberedThreat.threatPosition[0],
                rememberedThreat.threatPosition[2]
              ]
            }
          : null,
        escapeAssessmentKnown:
          typeof terrain.collisionWorld?.getNavigationPath === 'function',
        escapeAvailable: withdrawalCandidates.length > 0
      });
      const surrenderActive = surrender.active;
      if (surrenderActive && !alreadySurrendered) {
        agent.status = 'SURRENDERED';
        agent.state = 'SURRENDERED';
        agent.moraleTier = 'SURRENDERED';
        agent.stance = 'KNEELING';
        agent.velocity.set(0, 0, 0);
        agent.syncRecord();
        reactionReason = 'surrender';
      }
      const withdrawalActive = withdrawal.active && !surrenderActive;
      if (withdrawalActive) {
        goal.set(
          withdrawal.goal[0],
          terrain.getHeightAt(withdrawal.goal[0], withdrawal.goal[1]),
          withdrawal.goal[1]
        );
        if (threatPosition) {
          soldier.facing = Math.atan2(threatPosition.x - agent.position.x, threatPosition.z - agent.position.z);
        }
      } else if (reactionReason !== 'withdrawal' && cover && !hasBoundRole) {
        goal.copy(cover.position);
      }

      const buildingApproachPosition =
        agent.buildingLocation?.phase === 'approaching'
          && Array.isArray(
            agent.buildingLocation.approachGoal
              ?? agent.buildingLocation.approachPosition
          )
          && (
            agent.buildingLocation.approachGoal
              ?? agent.buildingLocation.approachPosition
          ).length >= 3
          && (
            agent.buildingLocation.approachGoal
              ?? agent.buildingLocation.approachPosition
          ).every(Number.isFinite)
          ? (
              agent.buildingLocation.approachGoal
                ?? agent.buildingLocation.approachPosition
            )
          : null;
      const followingBuildingApproach = Boolean(
        buildingApproachPosition && !surrenderActive && !withdrawalActive
      );
      if (followingBuildingApproach) {
        goal.set(
          buildingApproachPosition[0],
          buildingApproachPosition[1],
          buildingApproachPosition[2]
        );
      }

      const spacingReaction = !hasBoundRole && spacing.nearest < 1.05;
      const reactingToEnvironment = Boolean(
        ((reactionReason !== 'withdrawal' && cover) || spacingReaction || withdrawalActive)
        && agent.position.distanceToSquared(goal) > 0.18 * 0.18
      );
      const decision = soldier.tacticalDecision ?? {};
      decision.reason = surrenderActive
        ? 'surrender'
        : withdrawalActive
          ? withdrawal.reason
          : followingBuildingApproach
            ? 'building-approach'
          : reactionReason === 'withdrawal'
            ? `withdrawal-${withdrawal.reason}`
          : cover
            ? `${reactionReason}-cover`
            : spacingReaction
              ? 'spacing-clearance'
              : reactionReason
                ? `${reactionReason}-hold`
                : 'formation';
      decision.surrendered = surrenderActive;
      decision.surrenderReason = surrender.reason;
      decision.surrenderThreatId = surrender.threatId;
      decision.surrenderThreatDistanceMeters = surrender.threatDistanceMeters;
      decision.surrenderApproximation = surrender.approximationLabel;
      decision.withdrawalActive = withdrawalActive;
      decision.withdrawalReason = withdrawal.reason;
      decision.withdrawalTrigger = withdrawal.trigger;
      decision.withdrawalThreatId = withdrawal.threatId;
      decision.withdrawalGoalId = withdrawal.goalId;
      decision.withdrawalGoalKind = withdrawal.goalKind;
      decision.withdrawalApproximation = withdrawal.approximationLabel;
      decision.facingEnemy = Boolean(withdrawalActive && threatPosition);
      decision.casualtyProximityResponse = casualtyProximityResponse;
      decision.casualtyDistanceMeters = Number.isFinite(minCasualtyDist)
        ? Number(minCasualtyDist.toFixed(4))
        : null;
      decision.withdrawalVector = withdrawal.backwardVector
        ? Object.freeze(withdrawal.backwardVector.map(value => Number(value.toFixed(4))))
        : null;
      decision.withdrawalGoal = withdrawalActive
        ? Object.freeze([Number(goal.x.toFixed(4)), Number(goal.y.toFixed(4)), Number(goal.z.toFixed(4))])
        : null;
      decision.coverId = cover?.obstacleId ?? null;
      decision.coverType = cover?.obstacleType ?? null;
      decision.coverSide = cover?.side ?? null;
      decision.coverScore = cover ? Number(cover.score.toFixed(4)) : null;
      decision.shielded = cover?.shielded ?? false;
      decision.buddyId = boundDirective?.buddyId ?? null;
      decision.boundPairId = boundDirective?.pairId ?? null;
      decision.boundRole = boundDirective?.role ?? null;
      decision.boundSequence = boundDirective?.sequence ?? null;
      decision.nearestNeighborMeters = Number.isFinite(spacing.nearest)
        ? Number(spacing.nearest.toFixed(4))
        : null;
      decision.incomingFireIntensity = Number(
        (soldier.incomingFireIntensity ?? 0).toFixed(4)
      );
      decision.incomingFireEventVersion = soldier.incomingFireEventVersion ?? 0;
      decision.threatMemoryEventId = rememberedThreat?.eventId ?? null;
      decision.threatMemoryAgeSeconds = rememberedThreat
        ? Number(rememberedThreat.ageSeconds.toFixed(9))
        : null;
      decision.threatMemoryScore = rememberedThreat
        ? Number(rememberedThreat.score.toFixed(9))
        : null;
      decision.danger = dangerResult
        ? Number(dangerResult.danger.toFixed(4))
        : 0;
      decision.dangerFactors = (dangerResult && dangerResult.known)
        ? Object.freeze({
            exposure: Number(dangerResult.factors.exposure.toFixed(4)),
            recency: Number(dangerResult.factors.recency.toFixed(4)),
            intensity: Number(dangerResult.factors.intensity.toFixed(4)),
            confidence: Number(dangerResult.factors.confidence.toFixed(4))
          })
        : null;
      decision.dangerSources = dangerResult
        ? Object.freeze(dangerResult.contributions.map(c => String(c.sourceId)))
        : Object.freeze([]);
      if (rememberedThreat) {
        const memoryPosition = decision.threatMemoryPosition ?? [0, 0, 0];
        memoryPosition[0] = rememberedThreat.threatPosition[0];
        memoryPosition[1] = rememberedThreat.threatPosition[1];
        memoryPosition[2] = rememberedThreat.threatPosition[2];
        decision.threatMemoryPosition = memoryPosition;
      } else {
        decision.threatMemoryPosition = null;
      }
      if (threatPosition?.isVector3) {
        const threatArray = decision.threatPosition ?? [0, 0, 0];
        threatArray[0] = threatPosition.x;
        threatArray[1] = threatPosition.y;
        threatArray[2] = threatPosition.z;
        decision.threatPosition = threatArray;
      } else {
        decision.threatPosition = null;
      }
      const decisionImpactPosition = reactionReason === 'threat-memory'
        ? rememberedThreat?.impactPosition
        : soldier.incomingImpactPosition;
      if (decisionImpactPosition) {
        const impactArray = decision.impactPosition ?? [0, 0, 0];
        impactArray[0] = decisionImpactPosition[0];
        impactArray[1] = decisionImpactPosition[1];
        impactArray[2] = decisionImpactPosition[2];
        decision.impactPosition = impactArray;
      } else {
        decision.impactPosition = null;
      }
      const goalArray = decision.goal ?? [0, 0, 0];
      goalArray[0] = goal.x;
      goalArray[1] = goal.y;
      goalArray[2] = goal.z;
      decision.goal = goalArray;
      soldier.tacticalDecision = decision;

      const threatDir = threatPosition?.isVector3
        ? new THREE.Vector3().subVectors(threatPosition, agent.position)
        : null;

      const hasLeaderNearby = this.agents.some(other =>
        other.isAlive && (other.role === 'LEADER' || other.index === 0)
        && other.position.distanceTo(agent.position) <= 25
      );

      agent.updateMovement(delta, terrain, {
        anchorMoving: boundDirective?.holdMovement
          ? false
          : anchorMoving || reactingToEnvironment || Boolean(haltedHuntGoal)
            || followingBuildingApproach,
        orderType,
        goal,
        neighbors: this.agents,
        squadPinned: this.unit.morale === 'Pinned' || this.unit.morale === 'Broken',
        waypointIndex: this.unit.currentWaypointIndex,
        threatDirection: threatDir,
        cover,
        isShielded: cover?.shielded ?? false,
        hasLeaderNearby,
        coveringHold: boundDirective?.holdMovement ?? false,
        coveringStance: fireMovement.coveringStance,
        buddyBoundMover: boundDirective?.blockFire ?? false
      });
      if (casualtyShock > 0) {
        let recoveryRate = soldier.incomingFireTimer > 0 ? 4 : 18;
        if (cover?.shielded || agent.buildingLocation) recoveryRate += 8;
        if (hasLeaderNearby) recoveryRate += 6;
        const reactionSuppression = Math.max(
          0,
          Math.min(
            100,
            suppressionBeforeCasualtyReaction + casualtyShock
          ) - dt * recoveryRate
        );
        agent.suppression = Math.max(
          agent.suppression,
          reactionSuppression
        );
      }
      if (soldier.casualtyResponseTicksRemaining > 0 || casualtyShock > 0) {
        agent.suppression = Number(agent.suppression.toFixed(9));
        agent.moraleTier = classifyIndividualMorale(agent.suppression);
        agent.syncRecord();
      }
      if (withdrawalActive && threatPosition) {
        agent.facing = Math.atan2(threatPosition.x - agent.position.x, threatPosition.z - agent.position.z);
        agent.syncRecord();
      }
      soldier.lastSuppression = agent.suppression;
    }

    this.syncMeshes();
  }

  advanceSupportAmmunitionTransfers(deltaSeconds) {
    const byId = new Map(this.agents.map(agent => [agent.id, agent]));
    const donors = this.agents
      .filter(agent => agent.supportAmmunitionTransfer)
      .sort((left, right) =>
        String(left.id).localeCompare(String(right.id)));
    let transferredRounds = 0;
    for (const donor of donors) {
      const state = donor.supportAmmunitionTransfer;
      const recipient = byId.get(state.recipientSoldierId) ?? null;
      const distanceMeters = recipient
        ? donor.position.distanceTo(recipient.position)
        : Infinity;
      const result = advanceInfantryAmmunitionTransfer(
        state,
        { donor, recipient, distanceMeters },
        deltaSeconds
      );
      donor.supportAmmunitionTransfer = result.state;
      if (result.transferRounds > 0 && recipient) {
        recipient.reserveAmmo += result.transferRounds;
        recipient.syncRecord();
        transferredRounds += result.transferRounds;
      }
      donor.syncRecord();
    }
    return transferredRounds;
  }

  registerIncomingFire(threatPosition, impactPosition, options = {}) {
    const readThreat = readPosition(threatPosition, scratchThreat);
    const readImpact = readPosition(impactPosition, scratchImpact);
    const threat = isFinitePosition(readThreat) ? readThreat : null;
    const impact = isFinitePosition(readImpact) ? readImpact : null;
    if (!impact) return 0;
    if (options.projectileId !== undefined
        && options.projectileId !== null
        && !isStableIncomingFireEventId(options.projectileId)) {
      throw new TypeError('incoming-fire projectileId must be a non-empty stable ID');
    }
    const radius = Math.max(0.5, Number.isFinite(options.radius) ? options.radius : 10);
    const intensity = THREE.MathUtils.clamp(
      Number.isFinite(options.intensity) ? options.intensity : 1,
      0,
      2
    );
    let reacting = 0;
    for (const agent of this.agents) {
      if (!canReactToThreat(agent)) continue;
      const distance = agent.position.distanceTo(impact);
      if (distance > radius) continue;
      const exposure = 1 - distance / radius;
      const variation = hash01(
        `${this.unit.id}:${agent.id}:incoming:${agent.record.incomingFireEventVersion ?? 0}`
      );
      const timer = 1.35 + exposure * 1.85 + variation * 0.3;
      const suppression = intensity * exposure * 9;
      const incomingFireEventVersion =
        (agent.record.incomingFireEventVersion ?? 0) + 1;
      const eventId = options.projectileId ?? [
        'local-incoming-fire',
        this.unit.id,
        agent.id,
        incomingFireEventVersion
      ].join(':');
      agent.suppression = Math.min(100, agent.suppression + suppression);
      Object.assign(agent.record, {
        incomingFireTimer: Math.max(agent.record.incomingFireTimer ?? 0, timer),
        incomingFireIntensity: Math.max(agent.record.incomingFireIntensity ?? 0, intensity * exposure),
        incomingFireEventVersion,
        incomingThreatPosition: threat ? threat.toArray() : null,
        incomingImpactPosition: impact.toArray()
      });
      if (threat) {
        agent.threatMemory.record({
          eventId,
          threatPosition: threat,
          impactPosition: impact,
          intensity: intensity * exposure
        });
      }
      agent.syncRecord();
      reacting++;
    }

    if (reacting > 0) {
      const sourceId = options.projectileId
        ? `impact:${options.projectileId}`
        : `incoming-impact:${this.unit.id}:${impact.x.toFixed(2)}:${impact.z.toFixed(2)}`;
      this.dangerMap.recordIncomingImpact({
        sourceId,
        impactPosition: [impact.x, impact.z],
        radiusMeters: radius,
        intensity: THREE.MathUtils.clamp(intensity, 0, 1),
        confidence: 1.0,
        lifetimeTicks: 15
      });
    }
    return reacting;
  }

  registerObservedThreat(threatPosition, options = {}) {
    const position = normalizeObservedThreatPosition(threatPosition);
    const evidenceId = normalizeObservedThreatEvidenceId(
      options.observationId ?? options.targetId ?? options.sourceId
    );
    const sourceId = options.sourceId === undefined
      ? `observed-threat:${this.unit.id}:${typeof evidenceId}:${String(evidenceId)}`
      : normalizeObservedThreatEvidenceId(options.sourceId);
    return this.dangerMap.recordObservedThreat({
      sourceId,
      threatPosition: position,
      radiusMeters: options.radiusMeters ?? 12,
      intensity: THREE.MathUtils.clamp(options.intensity ?? 0.8, 0, 1),
      confidence: THREE.MathUtils.clamp(options.confidence ?? 0.8, 0, 1),
      lifetimeTicks: options.lifetimeTicks ?? 15
    });
  }

  updateCombat(delta, context) {
    for (const agent of this.agents) agent.updateCombat(delta, context);
    this.syncMeshes();
  }

  syncMeshes() {
    const meshes = this.unit.mesh?.userData.soldiers ?? [];
    this.unit.roster.forEach((soldier, index) => {
      const mesh = meshes[index];
      if (!mesh) return;
      scratchPosition.fromArray(soldier.worldPosition).sub(this.unit.position).applyAxisAngle(UP, -this.unit.rotation);
      mesh.position.copy(scratchPosition);
      mesh.userData.poseBaseY = scratchPosition.y;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = soldier.facing - this.unit.rotation;
      this.applyPose(mesh, soldier);
    });
    for (let index = this.unit.roster.length; index < meshes.length; index++) {
      meshes[index].visible = false;
    }
    this.unit.mesh?.userData.infantryProxyInstances?.sync(
      this.unit.roster.length
    );
    this.updateDebug();
  }

  setDebug(enabled) {
    if (!enabled) {
      if (this.debugLines) this.debugLines.visible = false;
      return;
    }
    if (!this.debugLines) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(this.unit.roster.length * 6), 3)
      );
      this.debugLines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true, opacity: 0.85 })
      );
      this.debugLines.name = 'SoldierFormationDebug';
      this.debugLines.renderOrder = 20;
      this.unit.mesh.add(this.debugLines);
    }
    this.debugLines.visible = true;
    this.updateDebug();
  }

  updateDebug() {
    if (!this.debugLines?.visible) return;
    const positions = this.debugLines.geometry.attributes.position;
    const meshes = this.unit.mesh.userData.soldiers ?? [];
    this.unit.roster.forEach((soldier, index) => {
      const meshPosition = meshes[index]?.position ?? scratchPosition.set(0, 0, 0);
      positions.setXYZ(index * 2, meshPosition.x, meshPosition.y + 0.08, meshPosition.z);
      positions.setXYZ(index * 2 + 1, soldier.slotOffset[0], 0.08, soldier.slotOffset[2]);
    });
    positions.needsUpdate = true;
    this.debugLines.geometry.computeBoundingSphere();
  }

  applyPose(mesh, soldier) {
    const parts = mesh.userData.parts;
    if (!parts) return;

    // Restore clean base transform every frame before applying offsets
    mesh.visible = true;
    mesh.rotation.x = 0;
    mesh.rotation.z = 0;
    const poseBaseY = mesh.userData.poseBaseY ?? 0;
    mesh.position.y = poseBaseY;

    parts.leftLeg.rotation.set(0, 0, 0);
    parts.rightLeg.rotation.set(0, 0, 0);
    parts.leftArm.rotation.set(-0.82, 0, 0.18);
    parts.rightArm.rotation.set(-0.72, 0, -0.2);
    parts.weapon.rotation.set(-0.16, 0, 0.08);
    const weaponRest = parts.weapon.userData.restPosition;
    const weaponRestX = weaponRest?.[0] ?? -0.18;
    parts.weapon.position.set(
      weaponRestX,
      weaponRest?.[1] ?? 1.46,
      weaponRest?.[2] ?? 0.06
    );
    parts.head.position.y = parts.head.userData.restY ?? 1.82;
    for (const item of parts.headgear ?? [parts.helmet]) {
      item.position.y = item.userData.restY ?? item.position.y;
    }

    const isFM2429 = /FM 24\/29/.test(soldier.weapon);
    const isMG34 = /MG34/.test(soldier.weapon);
    const isLMG = isFM2429 || isMG34;
    const isSMG = /MAS-38|MP40/.test(soldier.weapon);

    // 1. Movement Gait / Walk cycle
    const speed = scratchVelocity.fromArray(soldier.velocity).length();
    const stride = Math.sin(soldier.stridePhase);
    const gait = Math.min(0.72, speed * 0.18);

    parts.leftLeg.rotation.x = stride * gait;
    parts.rightLeg.rotation.x = -stride * gait;
    parts.leftArm.rotation.x = -0.82 - stride * gait * 0.45;
    parts.rightArm.rotation.x = -0.72 + stride * gait * 0.45;
    parts.weapon.rotation.x = -0.16 + Math.abs(stride) * gait * 0.08;

    if (soldier.state === 'VAULTING') {
      parts.leftLeg.rotation.x = -0.72;
      parts.rightLeg.rotation.x = 0.58;
      parts.leftArm.rotation.x = -1.08;
      parts.rightArm.rotation.x = -0.96;
      parts.weapon.rotation.x = 0.08;
      parts.weapon.position.set(weaponRestX - 0.02, 1.38, 0.04);
    }

    // 2. State-driven Aiming Poses
    if (soldier.state === 'AIMING' || soldier.state === 'OBSERVING') {
      if (isLMG) {
        parts.leftArm.rotation.x = -1.15;
        parts.rightArm.rotation.x = -1.02;
        parts.weapon.rotation.x = -0.02;
        parts.weapon.position.set(weaponRestX - 0.04, 1.47, 0.08);
      } else if (isSMG) {
        parts.leftArm.rotation.x = -0.92;
        parts.rightArm.rotation.x = -0.82;
        parts.weapon.rotation.x = -0.08;
        parts.weapon.position.set(weaponRestX - 0.01, 1.45, 0.08);
      } else {
        parts.leftArm.rotation.x = -1.02;
        parts.rightArm.rotation.x = -0.90;
        parts.weapon.rotation.x = -0.04;
      }
    }

    // 3. Weapon-specific Reload Poses
    if (soldier.state === 'RELOADING') {
      const reloadProgress = Math.sin((soldier.reloadTimer ?? 0) * 4.5);
      if (isFM2429) {
        // FM 24/29 top-fed magazine swap
        parts.leftArm.rotation.x = -1.35 + reloadProgress * 0.22;
        parts.rightArm.rotation.x = -0.65;
        parts.weapon.rotation.x = 0.15;
        parts.weapon.rotation.z = -0.35;
        parts.weapon.position.set(weaponRestX - 0.02, 1.35, 0.08);
      } else if (isMG34) {
        // MG34 belt/feed-cover manipulation
        parts.leftArm.rotation.x = -1.18 + reloadProgress * 0.14;
        parts.rightArm.rotation.x = -0.78;
        parts.weapon.rotation.x = 0.08;
        parts.weapon.rotation.z = 0.18;
        parts.weapon.position.set(weaponRestX - 0.04, 1.38, 0.08);
      } else if (isSMG) {
        // Bottom-fed SMG magazine change
        parts.leftArm.rotation.x = -0.55 + reloadProgress * 0.16;
        parts.rightArm.rotation.x = -0.42 - reloadProgress * 0.12;
        parts.weapon.rotation.x = 0.30;
        parts.weapon.rotation.z = -0.24;
        parts.weapon.position.set(weaponRestX - 0.02, 1.34, 0.08);
      } else {
        // Rifle bolt/stripper-clip manipulation
        parts.leftArm.rotation.x = -0.88;
        parts.rightArm.rotation.x = -1.16 + reloadProgress * 0.18;
        parts.weapon.rotation.x = 0.12;
        parts.weapon.rotation.z = -0.08;
        parts.weapon.position.set(weaponRestX + 0.02, 1.4, 0.08);
      }
    } else if ((soldier.recoilTime ?? 0) > 0) {
      // 4. Weapon-specific Recoil Profiles
      const recoilNorm = THREE.MathUtils.clamp(soldier.recoilTime / 0.12, 0, 1);
      if (isLMG) {
        // Heavy LMG recoil: backward displacement and muzzle climb
        parts.weapon.position.z -= recoilNorm * 0.025;
        parts.weapon.rotation.x += recoilNorm * 0.12;
        parts.rightArm.rotation.x += recoilNorm * 0.10;
      } else if (isSMG) {
        // SMG chatter recoil: rapid small vibration
        parts.weapon.position.z -= recoilNorm * 0.012;
        parts.weapon.rotation.x += recoilNorm * 0.04;
      } else {
        // Rifle single sharp kickback
        parts.weapon.position.z -= recoilNorm * 0.018;
        parts.rightArm.rotation.x += recoilNorm * 0.08;
      }
    }

    // 5. Stance & Suppression Posture Transitions
    if (soldier.stance === 'PRONE') {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y += 0.2;
      parts.leftLeg.rotation.x = 0.12;
      parts.rightLeg.rotation.x = -0.12;
      if (soldier.suppression > 45) {
        // Pinned/suppressed prone: head down low
        parts.head.position.y -= 0.1;
        for (const item of parts.headgear ?? [parts.helmet]) item.position.y -= 0.1;
        parts.weapon.position.y = 1.28;
      }
    } else if (soldier.stance === 'KNEELING') {
      mesh.position.y -= 0.34;
      parts.leftLeg.rotation.x = -1.15;
      parts.rightLeg.rotation.x = -0.30;
      parts.leftArm.rotation.x = -0.96;
      parts.rightArm.rotation.x = -0.84;
    }

    if (soldier.status === 'WOUNDED') {
      const lean = hash01(`${this.unit.id}:${soldier.id}:wounded`) < 0.5 ? -0.12 : 0.12;
      mesh.rotation.z = lean;
      mesh.position.y -= 0.06;
      parts.leftArm.rotation.x += 0.18;
      parts.rightArm.rotation.x += 0.12;
    }

    // 6. Casualty (KIA) Posture - Cannot be mistaken for active pose
    if (soldier.status === 'KIA') {
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = (hash01(`${this.unit.id}:${soldier.id}:casualty`) - 0.5) * 0.85;
      mesh.position.y = poseBaseY + 0.08;
      parts.leftArm.rotation.set(0.2, 0, 0.4);
      parts.rightArm.rotation.set(0.3, 0, -0.5);
      parts.weapon.position.set(0.35, 0.08, 0.2);
      parts.weapon.rotation.set(0, 0, Math.PI / 2);
    }
    if (soldier.status === 'SURRENDERED' || soldier.state === 'SURRENDERED') {
      parts.leftArm.rotation.set(2.6, 0, -0.2);
      parts.rightArm.rotation.set(2.6, 0, 0.2);
      parts.weapon.position.set(0.35, 0.05, 0.2);
      parts.weapon.rotation.set(0, 0, Math.PI / 2);
      applyInfantrySecondaryPose(
        mesh,
        soldier,
        mesh.userData.mortarOperatorPose ?? null
      );
      return;
    }
    const mortarOperatorPose = mesh.userData.mortarOperatorPose ?? null;
    applyInfantrySecondaryPose(mesh, soldier, mortarOperatorPose);
    if (!mortarOperatorPose?.operating) {
      bindInfantryHandsToWeapon(mesh, soldier);
    }
  }

  applySquadStance() {
    for (const agent of this.agents) {
      if (
        (this.unit.isHiding || this.unit.isDeployed)
        && agent.isAlive
        && agent.suppression < 58
      ) {
        agent.stance = this.unit.stance;
        agent.syncRecord();
      }
    }
    this.syncMeshes();
  }

  clearBuddyBoundDiagnostics() {
    for (const agent of this.agents) {
      const decision = agent.record.tacticalDecision;
      if (!decision) continue;
      decision.buddyId = null;
      decision.boundPairId = null;
      decision.boundRole = null;
      decision.boundSequence = null;
    }
  }

  getLivingSoldiers() {
    return this.getLivingAgents().map(agent => agent.record);
  }

  getLivingAgents() {
    return this.agents.filter(agent => agent.isAlive);
  }

  getReadyShooters() {
    return this.getLivingAgents().filter(agent =>
      !['INCAPACITATED', 'DEAD', 'SURRENDERED'].includes(agent.status)
      && agent.state !== 'SURRENDERED'
      && agent.fireCooldown <= 0
      && agent.suppression < 58
      && agent.state !== 'MOVING'
      && !isInfantryOrderMovingFireProhibited(agent.state)
      && agent.state !== 'REACTING'
      && agent.state !== 'BOUNDING'
    );
  }

  getWorldPosition(soldierId) {
    return this.agents.find(agent => agent.id === soldierId)?.position.clone() ?? this.unit.position.clone();
  }

  chooseTarget(random) {
    const living = this.getLivingAgents();
    if (living.length === 0) return null;
    return living[Math.min(living.length - 1, Math.floor(random() * living.length))].record;
  }

  applyHit(soldierId, lethality, random) {
    const living = this.getLivingAgents();
    const agent = living.find(candidate => candidate.id === soldierId) ?? living[0];
    if (!agent) return null;
    const damage = random() < lethality ? 120 : 45;
    agent.applyDamage(damage, 42);
    this.recordCasualtyTransitions();
    this.syncMeshes();
    return agent.record;
  }

  applyDamage(soldierId, damage, suppression = 35) {
    const living = this.getLivingAgents();
    const agent = living.find(candidate => candidate.id === soldierId) ?? living[0];
    if (!agent) return null;
    agent.applyDamage(damage, suppression);
    this.recordCasualtyTransitions();
    this.syncMeshes();
    return agent.record;
  }

  captureRoster() {
    return this.agents.map(agent => copySoldier(agent.capture()));
  }

  restoreRoster(roster) {
    const savedById = new Map(roster.map(state => [state.id, state]));
    const identitiesMatch = roster.length === this.agents.length
      && savedById.size === roster.length
      && this.agents.every(agent => savedById.has(agent.id));
    if (!identitiesMatch) {
      this.unit.roster = roster.map(copySoldier);
      this.initialize();
      return;
    }
    for (const agent of this.agents) {
      agent.restore(copySoldier(savedById.get(agent.id)));
    }
    this.unit.roster = this.agents.map(agent => agent.record);
    this.syncMeshes();
  }

  captureState() {
    return {
      roster: this.captureRoster(),
      dangerMap: this.dangerMap.captureState()
    };
  }

  restoreState(state) {
    if (!state) return;
    if (state.dangerMap) {
      this.dangerMap.restoreState(state.dangerMap);
    }
    if (state.roster) {
      this.restoreRoster(state.roster);
    }
  }
}
