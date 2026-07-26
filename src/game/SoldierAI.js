import * as THREE from 'three';
import { SoldierAgent } from './SoldierAgent.js';
import {
  advanceInfantryAnimation,
  applyInfantrySecondaryPose,
  bindInfantryHandsToWeapon
} from '../world/infantry/index.js';

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
  return {
    ...soldier,
    worldPosition: [...soldier.worldPosition],
    velocity: [...soldier.velocity],
    slotOffset: [...soldier.slotOffset],
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
          goal: soldier.tacticalDecision.goal ? [...soldier.tacticalDecision.goal] : null
        }
      : null
  };
}

function readPosition(value, target) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value) && value.length >= 3) return target.fromArray(value);
  return null;
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

export function selectNearbyCover(agent, terrain, threatPosition, neighbors = [], maximumDistance = 9) {
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
      const score = protection * (shielded ? 5 : 1.7) - travelDistance * 0.32 - crowdPenalty;
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
    this.initialize();
  }

  initialize() {
    const meshes = this.unit.mesh?.userData.soldiers ?? [];
    const livingCount = this.unit.roster.filter(soldier =>
      (soldier.health ?? 100) > 0 && soldier.status !== 'KIA'
    ).length;
    this.unit.roster.forEach((soldier, index) => {
      const mesh = meshes[index];
      const slotOffset = mesh?.userData.slotOffset ?? this.getFormationOffset(index, 'QUICK').toArray();
      scratchPosition
        .fromArray(slotOffset)
        .applyAxisAngle(UP, this.unit.rotation)
        .add(this.unit.position);

      const variation = hash01(`${this.unit.id}:${soldier.id}`);
      Object.assign(soldier, {
        role: soldier.role ?? this.getRole(soldier.weapon),
        health: soldier.health ?? 100,
        suppression: soldier.suppression ?? 0,
        stance: soldier.stance ?? 'STANDING',
        state: soldier.state ?? 'READY',
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
        knownLivingCount: soldier.knownLivingCount ?? livingCount,
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
    this.syncMeshes();
  }

  getRole(weapon) {
    if (/FM 24\/29|MG34/.test(weapon)) return 'GUNNER';
    if (/MAS-38|MP40/.test(weapon)) return 'LEADER';
    return 'RIFLEMAN';
  }

  getFormationOffset(index, orderType = 'QUICK') {
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

  update(delta, terrain, context = {}) {
    const { anchorMoving = false, orderType = 'QUICK' } = context;
    const dt = Math.max(0, Number.isFinite(delta) ? delta : 0);
    const livingCount = this.getLivingAgents().length;
    const fallbackThreatPosition = context.threatPosition
      ?? this.unit.targetUnit?.position
      ?? this.unit.targetPos
      ?? null;
    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const soldier = agent.record;
      advanceInfantryAnimation(soldier, dt);

      soldier.incomingFireTimer = Math.max(0, (soldier.incomingFireTimer ?? 0) - dt);
      if (soldier.incomingFireTimer === 0) soldier.incomingFireIntensity = 0;
      soldier.casualtyResponseTimer = Math.max(0, (soldier.casualtyResponseTimer ?? 0) - dt);
      const suppressionIncrease = agent.suppression - (soldier.lastSuppression ?? agent.suppression);
      if (suppressionIncrease >= 4) soldier.incomingFireTimer = Math.max(soldier.incomingFireTimer, 2.4);
      if (livingCount < (soldier.knownLivingCount ?? livingCount)) {
        soldier.casualtyResponseTimer = Math.max(soldier.casualtyResponseTimer, 3.2);
      }

      const formationOffset = this.getFormationOffset(index, orderType);
      agent.slotOffset.copy(formationOffset);
      const goal = scratchGoal
        .copy(formationOffset)
        .applyAxisAngle(UP, this.unit.rotation)
        .add(this.unit.position);
      goal.y = terrain.getHeightAt(goal.x, goal.z);

      const spacing = spacingCorrection(agent, this.agents);
      if (Number.isFinite(spacing.nearest) && spacing.nearest < 1.05) {
        goal.x += spacing.x * 0.55;
        goal.z += spacing.z * 0.55;
        goal.y = terrain.getHeightAt(goal.x, goal.z);
      }

      const reactionReason = soldier.incomingFireTimer > 0
        ? 'incoming-fire'
        : soldier.casualtyResponseTimer > 0
          ? 'casualty-response'
          : (agent.suppression >= 35 ? 'suppression-reaction' : null);
      const threatPosition = (soldier.incomingFireTimer > 0 || agent.suppression >= 35)
        ? (
            readPosition(soldier.incomingThreatPosition, scratchThreat)
            ?? fallbackThreatPosition
          )
        : fallbackThreatPosition;
      const cover = reactionReason && agent.isAlive
        ? selectNearbyCover(agent, terrain, threatPosition, this.agents)
        : null;
      if (cover) goal.copy(cover.position);
      const spacingReaction = spacing.nearest < 1.05;
      const reactingToEnvironment = Boolean(
        (cover || spacingReaction) && agent.position.distanceToSquared(goal) > 0.18 * 0.18
      );
      const decision = soldier.tacticalDecision ?? {};
      decision.reason = cover
        ? `${reactionReason}-cover`
        : spacingReaction
          ? 'spacing-clearance'
          : reactionReason
            ? `${reactionReason}-hold`
            : 'formation';
      decision.coverId = cover?.obstacleId ?? null;
      decision.coverType = cover?.obstacleType ?? null;
      decision.coverSide = cover?.side ?? null;
      decision.coverScore = cover ? Number(cover.score.toFixed(4)) : null;
      decision.shielded = cover?.shielded ?? false;
      decision.nearestNeighborMeters = Number.isFinite(spacing.nearest)
        ? Number(spacing.nearest.toFixed(4))
        : null;
      decision.incomingFireIntensity = Number(
        (soldier.incomingFireIntensity ?? 0).toFixed(4)
      );
      decision.incomingFireEventVersion = soldier.incomingFireEventVersion ?? 0;
      if (threatPosition?.isVector3) {
        const threatArray = decision.threatPosition ?? [0, 0, 0];
        threatArray[0] = threatPosition.x;
        threatArray[1] = threatPosition.y;
        threatArray[2] = threatPosition.z;
        decision.threatPosition = threatArray;
      } else {
        decision.threatPosition = null;
      }
      if (soldier.incomingImpactPosition) {
        const impactArray = decision.impactPosition ?? [0, 0, 0];
        impactArray[0] = soldier.incomingImpactPosition[0];
        impactArray[1] = soldier.incomingImpactPosition[1];
        impactArray[2] = soldier.incomingImpactPosition[2];
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
        anchorMoving: anchorMoving || reactingToEnvironment,
        orderType,
        goal,
        neighbors: this.agents,
        squadPinned: this.unit.morale === 'Pinned' || this.unit.morale === 'Broken',
        waypointIndex: this.unit.currentWaypointIndex,
        threatDirection: threatDir,
        cover,
        isShielded: cover?.shielded ?? false,
        hasLeaderNearby
      });
      soldier.lastSuppression = agent.suppression;
      soldier.knownLivingCount = livingCount;
    }

    this.syncMeshes();
  }

  registerIncomingFire(threatPosition, impactPosition, options = {}) {
    const threat = readPosition(threatPosition, scratchThreat);
    const impact = readPosition(impactPosition, scratchImpact);
    if (!impact) return 0;
    const radius = Math.max(0.5, Number.isFinite(options.radius) ? options.radius : 10);
    const intensity = THREE.MathUtils.clamp(
      Number.isFinite(options.intensity) ? options.intensity : 1,
      0,
      2
    );
    let reacting = 0;
    for (const agent of this.agents) {
      if (!agent.isAlive) continue;
      const distance = agent.position.distanceTo(impact);
      if (distance > radius) continue;
      const exposure = 1 - distance / radius;
      const variation = hash01(
        `${this.unit.id}:${agent.id}:incoming:${agent.record.incomingFireEventVersion ?? 0}`
      );
      const timer = 1.35 + exposure * 1.85 + variation * 0.3;
      const suppression = intensity * exposure * 9;
      agent.suppression = Math.min(100, agent.suppression + suppression);
      Object.assign(agent.record, {
        incomingFireTimer: Math.max(agent.record.incomingFireTimer ?? 0, timer),
        incomingFireIntensity: Math.max(agent.record.incomingFireIntensity ?? 0, intensity * exposure),
        incomingFireEventVersion: (agent.record.incomingFireEventVersion ?? 0) + 1,
        incomingThreatPosition: threat ? threat.toArray() : null,
        incomingImpactPosition: impact.toArray()
      });
      agent.syncRecord();
      reacting++;
    }
    return reacting;
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
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = soldier.facing - this.unit.rotation;
      this.applyPose(mesh, soldier);
    });
    for (let index = this.unit.roster.length; index < meshes.length; index++) {
      meshes[index].visible = false;
    }
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
    mesh.position.y = 0;

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
      mesh.position.y = 0.08;
      parts.leftArm.rotation.set(0.2, 0, 0.4);
      parts.rightArm.rotation.set(0.3, 0, -0.5);
      parts.weapon.position.set(0.35, 0.08, 0.2);
      parts.weapon.rotation.set(0, 0, Math.PI / 2);
    }
    applyInfantrySecondaryPose(mesh, soldier);
    bindInfantryHandsToWeapon(mesh, soldier);
  }

  applySquadStance() {
    for (const agent of this.agents) {
      if (agent.isAlive && agent.suppression < 58) {
        agent.stance = this.unit.stance;
        agent.syncRecord();
      }
    }
    this.syncMeshes();
  }

  getLivingSoldiers() {
    return this.getLivingAgents().map(agent => agent.record);
  }

  getLivingAgents() {
    return this.agents.filter(agent => agent.isAlive);
  }

  getReadyShooters() {
    return this.getLivingAgents().filter(agent =>
      agent.fireCooldown <= 0
      && agent.suppression < 58
      && agent.state !== 'MOVING'
      && agent.state !== 'REACTING'
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
    const casualtyRatio = 1 - this.getLivingAgents().length / Math.max(1, this.unit.roster.length);
    this.unit.applySuppression(10 + casualtyRatio * 28);
    this.syncMeshes();
    return agent.record;
  }

  applyDamage(soldierId, damage, suppression = 35) {
    const living = this.getLivingAgents();
    const agent = living.find(candidate => candidate.id === soldierId) ?? living[0];
    if (!agent) return null;
    agent.applyDamage(damage, suppression);
    const casualtyRatio = 1 - this.getLivingAgents().length / Math.max(1, this.agents.length);
    this.unit.applySuppression(8 + casualtyRatio * 24);
    this.syncMeshes();
    return agent.record;
  }

  captureRoster() {
    return this.agents.map(agent => copySoldier(agent.capture()));
  }

  restoreRoster(roster) {
    if (roster.length !== this.agents.length) {
      this.unit.roster = roster.map(copySoldier);
      this.initialize();
      return;
    }
    roster.forEach((state, index) => this.agents[index].restore(copySoldier(state)));
    this.unit.roster = this.agents.map(agent => agent.record);
    this.syncMeshes();
  }
}
