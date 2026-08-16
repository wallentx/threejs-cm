import * as THREE from 'three';
import {
  advanceFireControlState,
  captureFireControlState,
  createFireControlState,
  createFireControlTargetKey,
  recordFireControlShot,
  resetFireControlState
} from '../simulation/combat/FireControl.js';
import {
  captureInfantryAmmunitionTransferState,
  restoreInfantryAmmunitionTransferState
} from '../simulation/infantry/InfantryAmmunitionTransfer.js';
import {
  restoreThreatMemory
} from '../simulation/infantry/ThreatMemory.js';
import {
  INFANTRY_COLLISION_RADIUS
} from '../simulation/infantry/InfantrySeparationSystem.js';
import {
  canInfantryVaultFence,
  getInfantryMovementOrderProfile,
  INFANTRY_FENCE_VAULT_POLICY,
  isInfantryOrderMovingFireProhibited
} from '../simulation/infantry/InfantryMovementOrders.js';
import {
  isBuildingOccupantExposed
} from '../simulation/buildings/BuildingExposure.js';
import {
  classifyIndividualMorale
} from '../simulation/infantry/InfantrySuppression.js';
import {
  canInfantryWeaponEngageTarget
} from '../simulation/combat/InfantryTargetEligibility.js';

const UP = new THREE.Vector3(0, 1, 0);
const MAX_INFANTRY_ROUNDS_PER_STEP = 64;
const INFANTRY_CADENCE_EPSILON = 1e-9;
const INFANTRY_STATIONARY_SPEED_METERS_PER_SECOND = 0.12;
const INFANTRY_TARGET_SCAN_INTERVAL_SECONDS = 0.2;

function exceedsHorizontalRange(origin, target, rangeMeters) {
  const deltaX = origin.x - target.x;
  const deltaZ = origin.z - target.z;
  return deltaX * deltaX + deltaZ * deltaZ > rangeMeters * rangeMeters;
}

function hash01(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function restoreFenceVault(value) {
  if (!value || typeof value !== 'object' || typeof value.colliderId !== 'string') {
    return null;
  }
  return {
    colliderId: value.colliderId,
    elapsedSeconds: Math.max(0, Number(value.elapsedSeconds) || 0),
    durationSeconds: Math.max(
      0.001,
      Number(value.durationSeconds)
        || INFANTRY_FENCE_VAULT_POLICY.durationSeconds
    ),
    presentationHeightMeters: Math.max(
      0,
      Number(value.presentationHeightMeters)
        || INFANTRY_FENCE_VAULT_POLICY.presentationHeightMeters
    ),
    modelVersion: INFANTRY_FENCE_VAULT_POLICY.modelVersion
  };
}

export class SoldierAgent {
  constructor(unit, record, mesh, index) {
    this.unit = unit;
    this.weaponLookup = unit.catalogPorts.weapons.get;
    this.weaponIdFromName = unit.catalogPorts.weapons.idFromName;
    this.record = record;
    this.mesh = mesh;
    this.index = index;
    const variation = hash01(`${unit.id}:${record.id}`);
    const initial = new THREE.Vector3()
      .fromArray(record.worldPosition ?? mesh?.userData.slotOffset ?? [0, 0, 0]);
    if (!record.worldPosition) initial.applyAxisAngle(UP, unit.rotation).add(unit.position);

    this.position = initial;
    this.velocity = new THREE.Vector3().fromArray(record.velocity ?? [0, 0, 0]);
    this.slotOffset = new THREE.Vector3().fromArray(record.slotOffset ?? mesh?.userData.slotOffset ?? [0, 0, 0]);
    this.facing = record.facing ?? unit.rotation;
    this.pace = record.pace ?? 0.9 + variation * 0.2;
    this.reactionDelay = record.reactionDelay ?? variation * 0.65;
    this.stridePhase = record.stridePhase ?? variation * Math.PI * 2;
    this.fireCooldown = record.fireCooldown ?? variation * 1.4;
    this.weaponId = record.weaponId ?? this.weaponIdFromName(record.weapon);
    const weapon = this.weaponLookup(this.weaponId);
    this.magazineAmmo = record.magazineAmmo ?? weapon?.magazineSize ?? 0;
    this.reserveAmmo = record.reserveAmmo
      ?? Math.max(0, (weapon?.carriedAmmo ?? 0) - this.magazineAmmo);
    this.supportAmmunitionTransfer =
      restoreInfantryAmmunitionTransferState(
        record.supportAmmunitionTransfer
      );
    this.threatMemory = restoreThreatMemory(record.threatMemory);
    this.reloadTimer = record.reloadTimer ?? 0;
    this.burstRemaining = record.burstRemaining ?? 0;
    this.roundsFired = record.roundsFired ?? 0;
    this.recoilTime = record.recoilTime ?? 0;
    this.health = record.health ?? 100;
    this.suppression = record.suppression ?? 0;
    this.state = record.state ?? 'READY';
    this.stance = record.stance ?? 'STANDING';
    this.status = record.status ?? 'OK';
    this.casualtyFallStartStance = record.casualtyFallStartStance ?? null;
    this.moraleTier = record.moraleTier ?? 'READY';
    this.targetUnitId = record.targetUnitId ?? null;
    this.targetSoldierId = record.targetSoldierId ?? null;
    this.targetScanCooldown = record.targetScanCooldown
      ?? variation * INFANTRY_TARGET_SCAN_INTERVAL_SECONDS;
    this.fireControl = createFireControlState(record.fireControl);
    this.buildingLocation = record.buildingLocation
      ? JSON.parse(JSON.stringify(record.buildingLocation))
      : null;
    this.vehicleLocation = record.vehicleLocation
      ? { ...record.vehicleLocation }
      : null;
    this.commandWaypoint = record.commandWaypoint ?? -1;
    this.fenceVault = restoreFenceVault(record.fenceVault);
    this.syncRecord();
  }

  get id() { return this.record.id; }
  get weapon() { return this.record.weapon; }
  get role() { return this.record.role; }
  get isAlive() { return this.health > 0 && this.status !== 'KIA'; }
  get isWounded() { return this.health < 70 && this.isAlive; }

  applyDamage(damage, suppression = 0) {
    if (this.health <= 0
        || (this.status !== 'OK' && this.status !== 'WOUNDED')) return;
    this.health = Math.max(0, this.health - Math.max(0, damage));
    this.suppression = Math.min(100, this.suppression + Math.max(0, suppression));
    if (this.health === 0) {
      this.casualtyFallStartStance = this.stance;
      this.record.poseTime = 0;
      this.status = 'KIA';
      this.state = 'CASUALTY';
      this.stance = 'PRONE';
      this.velocity.set(0, 0, 0);
    } else if (this.health < 70) {
      this.status = 'WOUNDED';
      this.state = 'PINNED';
      this.stance = 'PRONE';
    }
    this.syncRecord();
  }

  capture() {
    this.syncRecord();
    const snapshot = {
      ...this.record,
      worldPosition: [...this.record.worldPosition],
      velocity: [...this.record.velocity],
      slotOffset: [...this.record.slotOffset],
      fireControl: captureFireControlState(this.fireControl),
      supportAmmunitionTransfer:
        captureInfantryAmmunitionTransferState(
          this.supportAmmunitionTransfer
        ),
      threatMemory: this.threatMemory.captureState(),
      buildingLocation: this.record.buildingLocation
        ? JSON.parse(JSON.stringify(this.record.buildingLocation))
        : null,
      vehicleLocation: this.record.vehicleLocation
        ? { ...this.record.vehicleLocation }
        : null,
      fenceVault: this.record.fenceVault
        ? { ...this.record.fenceVault }
        : null
    };
    if (!snapshot.supportAmmunitionTransfer) {
      delete snapshot.supportAmmunitionTransfer;
    }
    if (!snapshot.fenceVault) delete snapshot.fenceVault;
    return snapshot;
  }

  restore(record) {
    this.record = record;
    this.health = record.health ?? 100;
    this.suppression = record.suppression ?? 0;
    this.state = record.state ?? 'READY';
    this.stance = record.stance ?? 'STANDING';
    this.status = record.status ?? 'OK';
    this.casualtyFallStartStance = record.casualtyFallStartStance ?? null;
    this.moraleTier = record.moraleTier ?? 'READY';
    if (record.worldPosition) this.position.fromArray(record.worldPosition);
    if (record.velocity) this.velocity.fromArray(record.velocity);
    if (record.slotOffset) this.slotOffset.fromArray(record.slotOffset);
    this.facing = record.facing ?? this.facing;
    this.pace = record.pace ?? this.pace;
    this.reactionDelay = record.reactionDelay ?? this.reactionDelay;
    this.stridePhase = record.stridePhase ?? this.stridePhase;
    this.fireCooldown = record.fireCooldown ?? this.fireCooldown;
    this.weaponId = record.weaponId
      ?? this.weaponIdFromName(record.weapon)
      ?? this.weaponId;
    const weapon = this.weaponLookup(this.weaponId);
    this.magazineAmmo = record.magazineAmmo ?? weapon?.magazineSize ?? 0;
    this.reserveAmmo = record.reserveAmmo
      ?? Math.max(0, (weapon?.carriedAmmo ?? 0) - this.magazineAmmo);
    this.supportAmmunitionTransfer =
      restoreInfantryAmmunitionTransferState(
        record.supportAmmunitionTransfer
      );
    this.threatMemory = restoreThreatMemory(record.threatMemory);
    this.reloadTimer = record.reloadTimer ?? 0;
    this.burstRemaining = record.burstRemaining ?? 0;
    this.roundsFired = record.roundsFired ?? 0;
    this.recoilTime = record.recoilTime ?? 0;
    this.targetUnitId = record.targetUnitId ?? null;
    this.targetSoldierId = record.targetSoldierId ?? null;
    this.targetScanCooldown = Math.max(
      0,
      Number(record.targetScanCooldown) || 0
    );
    this.fireControl = createFireControlState(record.fireControl);
    this.buildingLocation = record.buildingLocation ? JSON.parse(JSON.stringify(record.buildingLocation)) : null;
    this.vehicleLocation = record.vehicleLocation
      ? { ...record.vehicleLocation }
      : null;
    this.commandWaypoint = record.commandWaypoint ?? -1;
    this.fenceVault = restoreFenceVault(record.fenceVault);
    this.syncRecord();
  }

  syncRecord() {
    Object.assign(this.record, {
      health: this.health,
      suppression: this.suppression,
      state: this.state,
      stance: this.stance,
      status: this.status,
      moraleTier: this.moraleTier,
      worldPosition: this.position.toArray(),
      velocity: this.velocity.toArray(),
      slotOffset: this.slotOffset.toArray(),
      facing: this.facing,
      pace: this.pace,
      reactionDelay: this.reactionDelay,
      stridePhase: this.stridePhase,
      fireCooldown: this.fireCooldown,
      weaponId: this.weaponId,
      magazineAmmo: this.magazineAmmo,
      reserveAmmo: this.reserveAmmo,
      reloadTimer: this.reloadTimer,
      burstRemaining: this.burstRemaining,
      roundsFired: this.roundsFired,
      recoilTime: this.recoilTime,
      targetUnitId: this.targetUnitId,
      targetSoldierId: this.targetSoldierId,
      targetScanCooldown: this.targetScanCooldown,
      fireControl: captureFireControlState(this.fireControl),
      threatMemory: this.threatMemory.captureState(),
      buildingLocation: this.buildingLocation
        ? JSON.parse(JSON.stringify(this.buildingLocation))
        : null,
      vehicleLocation: this.vehicleLocation
        ? { ...this.vehicleLocation }
        : null,
      commandWaypoint: this.commandWaypoint,
      fenceVault: this.fenceVault ? { ...this.fenceVault } : null
    });
    if (this.status === 'KIA' && this.casualtyFallStartStance != null) {
      this.record.casualtyFallStartStance = this.casualtyFallStartStance;
    } else {
      this.casualtyFallStartStance = null;
      delete this.record.casualtyFallStartStance;
    }
    if (this.supportAmmunitionTransfer) {
      this.record.supportAmmunitionTransfer =
        captureInfantryAmmunitionTransferState(
          this.supportAmmunitionTransfer
        );
    } else {
      delete this.record.supportAmmunitionTransfer;
    }
    if (!this.fenceVault) delete this.record.fenceVault;
  }

  updateMovement(delta, terrain, context = {}) {
    const elapsed = Math.max(delta, 0);
    const dt = Math.min(elapsed, 0.1);
    const movementProfile =
      getInfantryMovementOrderProfile(context.orderType);

    if (this.status === 'SURRENDERED' || this.state === 'SURRENDERED') {
      this.fenceVault = null;
      this.state = 'SURRENDERED';
      this.status = 'SURRENDERED';
      this.stance = 'KNEELING';
      this.moraleTier = 'SURRENDERED';
      this.reloadTimer = 0;
      this.burstRemaining = 0;
      this.targetUnitId = null;
      this.targetSoldierId = null;
      this.velocity.set(0, 0, 0);
      resetFireControlState(this.fireControl, 'SURRENDERED');
      this.syncRecord();
      return;
    }

    this.recoilTime = Math.max(0, this.recoilTime - elapsed);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - elapsed);
      this.state = 'RELOADING';
      if (this.reloadTimer === 0) this.completeReload();
    }
    if (!this.isAlive || ['INCAPACITATED', 'DEAD'].includes(this.status)) {
      this.fenceVault = null;
      this.state = 'CASUALTY';
      this.stance = 'PRONE';
      this.moraleTier = 'CASUALTY';
      this.velocity.set(0, 0, 0);
      this.syncRecord();
      return;
    }

    if (this.buildingLocation
        && ['transit', 'exiting', 'exit-waiting', 'occupied']
          .includes(this.buildingLocation.phase)) {
      this.fenceVault = null;
      this.velocity.set(0, 0, 0);
      this.syncRecord();
      return;
    }

    // Dynamic Morale Recovery Loop
    const underDirectFire = (this.record.incomingFireTimer ?? 0) > 0;
    const isShielded = context.isShielded || Boolean(this.buildingLocation) || Boolean(context.cover?.shielded);
    const hasLeaderNearby = context.hasLeaderNearby ?? false;

    let recoveryRate = underDirectFire ? 4 : 18;
    if (isShielded) recoveryRate += 8;
    if (hasLeaderNearby) recoveryRate += 6;

    this.suppression = Math.max(0, this.suppression - dt * recoveryRate);

    // 5-Tier Morale Classification
    let moraleTier = classifyIndividualMorale(this.suppression);
    if (context.squadPinned && moraleTier !== 'ROUTED') moraleTier = 'PINNED';
    this.moraleTier = moraleTier;

    if (this.commandWaypoint !== context.waypointIndex) {
      this.commandWaypoint = context.waypointIndex;
      this.reactionDelay = hash01(`${this.unit.id}:${this.id}:${this.commandWaypoint}`) * 0.7;
    }

    const navigationGoal = terrain.collisionWorld?.getNavigationTarget(
      this.position,
      context.goal,
      INFANTRY_COLLISION_RADIUS,
      'infantry'
    ) ?? context.goal;
    const direction = new THREE.Vector3(
      navigationGoal.x - this.position.x,
      0,
      navigationGoal.z - this.position.z
    );
    direction.y = 0;
    const distance = direction.length();

    // Behavior Execution across Morale Tiers
    if (moraleTier === 'ROUTED') {
      this.state = 'FLEEING';
      this.stance = 'CROUCHED';
      const fleeDir = (context.threatDirection && context.threatDirection.lengthSq() > 0.01)
        ? context.threatDirection.clone().negate().normalize()
        : (distance > 0.1 ? direction.clone().negate().normalize() : new THREE.Vector3(0, 0, -1));
      const fleeSpeed = 5.2 * this.pace * (this.isWounded ? 0.6 : 1);
      this.velocity.lerp(fleeDir.multiplyScalar(fleeSpeed), 1 - Math.exp(-8 * dt));
      this.facing = Math.atan2(this.velocity.x, this.velocity.z);
    } else if (moraleTier === 'PINNED') {
      this.state = isShielded ? 'COWERING' : 'PINNED';
      this.stance = 'PRONE';
      this.velocity.multiplyScalar(Math.exp(-9 * dt));
    } else if (moraleTier === 'TAKING_COVER') {
      this.state = 'TAKING_COVER';
      this.stance = 'PRONE';
      const coverSpeed = 2.4 * this.pace * (this.isWounded ? 0.55 : 1);
      if (distance > 0.18) {
        direction.normalize();
        this.velocity.lerp(direction.multiplyScalar(coverSpeed), 1 - Math.exp(-7 * dt));
        this.facing = Math.atan2(this.velocity.x, this.velocity.z);
      } else {
        this.velocity.multiplyScalar(Math.exp(-8 * dt));
      }
    } else if (context.coveringHold) {
      this.state = 'COVERING';
      this.stance = context.coveringStance
        ?? (moraleTier === 'DUCKING'
          ? 'PRONE'
          : moraleTier === 'CAUTIOUS'
            ? 'KNEELING'
            : this.unit.stance);
      this.velocity.set(0, 0, 0);
    } else if (moraleTier === 'DUCKING') {
      this.state = context.anchorMoving ? 'MOVING' : 'DUCKING';
      this.stance = 'PRONE';
      const duckSpeed = 1.3 * this.pace * (this.isWounded ? 0.55 : 1);
      if (context.anchorMoving && distance > 0.18) {
        direction.normalize();
        this.velocity.lerp(direction.multiplyScalar(duckSpeed), 1 - Math.exp(-7 * dt));
        this.facing = Math.atan2(this.velocity.x, this.velocity.z);
      } else {
        this.velocity.multiplyScalar(Math.exp(-7 * dt));
      }
    } else if (moraleTier === 'CAUTIOUS') {
      this.state = context.anchorMoving ? 'ADVANCING' : 'OBSERVING';
      this.stance = 'KNEELING';
      const cautiousSpeed = (context.orderType === 'FAST' ? 3.8 : 2.1) * this.pace * (this.isWounded ? 0.55 : 1);
      if (context.anchorMoving && distance > 0.18) {
        direction.normalize();
        this.velocity.lerp(direction.multiplyScalar(cautiousSpeed), 1 - Math.exp(-7 * dt));
        this.facing = Math.atan2(this.velocity.x, this.velocity.z);
      } else {
        this.velocity.multiplyScalar(Math.exp(-7 * dt));
      }
    } else {
      // READY
      if (context.anchorMoving && distance > 0.18) {
        if (this.reactionDelay > 0) {
          this.reactionDelay = Math.max(0, this.reactionDelay - dt);
          this.state = 'REACTING';
          this.stance = movementProfile?.individual.stance
            ?? (context.orderType === 'HUNT' ? 'KNEELING' : 'STANDING');
          this.velocity.multiplyScalar(Math.exp(-8 * dt));
        } else {
          const separation = new THREE.Vector3();
          for (const other of context.neighbors) {
            if (other === this || !other.isAlive) continue;
            const offset = new THREE.Vector3().subVectors(this.position, other.position);
            offset.y = 0;
            const separationDistance = offset.length();
            if (separationDistance > 0.001 && separationDistance < 0.9) {
              separation.addScaledVector(offset.normalize(), (0.9 - separationDistance) / 0.9);
            }
          }

          this.state = movementProfile?.individual.state
            ?? (context.orderType === 'HUNT' ? 'ADVANCING' : 'MOVING');
          this.stance = movementProfile?.individual.stance
            ?? (context.orderType === 'HUNT' ? 'KNEELING' : 'STANDING');
          const baseSpeed = movementProfile?.individual.speedMetersPerSecond
            ?? (context.orderType === 'FAST'
              ? 5.1
              : context.orderType === 'HUNT'
                ? 1.75
                : 2.75);
          direction.normalize().addScaledVector(separation, 0.72).normalize();
          const desiredSpeed = Math.min(
            baseSpeed * this.pace * (this.isWounded ? 0.55 : 1),
            distance / Math.max(dt, 0.001)
          );
          this.velocity.lerp(direction.multiplyScalar(desiredSpeed), 1 - Math.exp(-7 * dt));
          this.facing = Math.atan2(this.velocity.x, this.velocity.z);
        }
      } else if (context.buddyBoundMover) {
        this.state = 'BOUNDING';
        this.velocity.multiplyScalar(Math.exp(-8 * dt));
      } else {
        this.velocity.multiplyScalar(Math.exp(-7 * dt));
        this.stance = movementProfile?.individual.stance ?? this.unit.stance;
        const stillCompletingProfiledMovement = Boolean(
          movementProfile
          && this.velocity.lengthSq()
            >= INFANTRY_STATIONARY_SPEED_METERS_PER_SECOND ** 2
        );
        this.state = stillCompletingProfiledMovement
          ? movementProfile.individual.state
          : (this.targetUnitId ? 'AIMING' : 'OBSERVING');
      }
    }

    const intendedMovement = {
      x: this.velocity.x * dt,
      z: this.velocity.z * dt
    };
    const resolvedMovement = terrain.collisionWorld?.resolveCircleMotion(
      this.position,
      intendedMovement,
      INFANTRY_COLLISION_RADIUS,
      {
        moverType: 'infantry',
        traverseColliderTypes: (
          canInfantryVaultFence(context.orderType) || this.fenceVault
        ) ? ['fence'] : []
      }
    );
    if (resolvedMovement) {
      this.position.x = resolvedMovement.x;
      this.position.z = resolvedMovement.z;
      for (const contact of resolvedMovement.contacts) {
        const inward = this.velocity.x * contact.normalX + this.velocity.z * contact.normalZ;
        if (inward < 0) {
          this.velocity.x -= contact.normalX * inward;
          this.velocity.z -= contact.normalZ * inward;
        }
      }
      const crossedFenceId = resolvedMovement.traversedColliderIds?.[0] ?? null;
      if (crossedFenceId && !this.fenceVault) {
        this.fenceVault = {
          colliderId: crossedFenceId,
          elapsedSeconds: 0,
          durationSeconds: INFANTRY_FENCE_VAULT_POLICY.durationSeconds,
          presentationHeightMeters:
            INFANTRY_FENCE_VAULT_POLICY.presentationHeightMeters,
          modelVersion: INFANTRY_FENCE_VAULT_POLICY.modelVersion
        };
      }
    } else {
      this.position.x += intendedMovement.x;
      this.position.z += intendedMovement.z;
    }
    if (!this.buildingLocation && !this.vehicleLocation) {
      const groundY = terrain.getMovementHeightAt
        ? terrain.getMovementHeightAt(this.position.x, this.position.z)
        : terrain.getHeightAt(this.position.x, this.position.z);
      let vaultOffsetY = 0;
      if (this.fenceVault) {
        this.fenceVault.elapsedSeconds = Math.min(
          this.fenceVault.durationSeconds,
          this.fenceVault.elapsedSeconds + dt
        );
        const progress =
          this.fenceVault.elapsedSeconds / this.fenceVault.durationSeconds;
        vaultOffsetY = Math.sin(progress * Math.PI)
          * this.fenceVault.presentationHeightMeters;
        if (progress < 1) {
          this.state = 'VAULTING';
          this.stance = 'CROUCHED';
        } else {
          this.fenceVault = null;
        }
      }
      this.position.y = groundY + vaultOffsetY;
    }
    this.stridePhase += Math.hypot(
      resolvedMovement?.movedX ?? intendedMovement.x,
      resolvedMovement?.movedZ ?? intendedMovement.z
    ) * 5.4;
    this.syncRecord();
  }

  getMuzzleWorldPosition() {
    const muzzle = this.mesh?.userData.parts?.muzzle;
    if (muzzle) {
      this.unit.mesh?.updateWorldMatrix(true, true);
      return muzzle.getWorldPosition(new THREE.Vector3());
    }
    return this.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  }

  startReload() {
    const weapon = this.weaponLookup(this.weaponId);
    if (!weapon
        || this.status === 'SURRENDERED'
        || this.state === 'SURRENDERED'
        || this.reloadTimer > 0
        || this.reserveAmmo <= 0) return false;
    this.reloadTimer = weapon.reloadSeconds;
    this.burstRemaining = 0;
    this.state = 'RELOADING';
    this.syncRecord();
    return true;
  }

  completeReload() {
    const weapon = this.weaponLookup(this.weaponId);
    if (!weapon
        || this.status === 'SURRENDERED'
        || this.state === 'SURRENDERED'
        || this.magazineAmmo >= weapon.magazineSize
        || this.reserveAmmo <= 0) return false;
    const rounds = Math.min(weapon.magazineSize - this.magazineAmmo, this.reserveAmmo);
    this.magazineAmmo += rounds;
    this.reserveAmmo -= rounds;
    this.state = 'READY';
    this.syncRecord();
    return true;
  }

  updateCombat(delta, context) {
    const elapsed = Math.max(delta, 0);
    this.targetScanCooldown = Math.max(
      0,
      this.targetScanCooldown - elapsed
    );
    const weapon = this.weaponLookup(this.weaponId);
    if (!weapon || !this.isAlive
        || ['INCAPACITATED', 'DEAD', 'SURRENDERED'].includes(this.status)
        || this.state === 'SURRENDERED') {
      const surrendered = this.status === 'SURRENDERED'
        || this.state === 'SURRENDERED';
      resetFireControlState(
        this.fireControl,
        surrendered ? 'SURRENDERED' : null
      );
      if (surrendered) {
        this.reloadTimer = 0;
        this.burstRemaining = 0;
        this.targetUnitId = null;
        this.targetSoldierId = null;
        this.syncRecord();
      }
      return false;
    }

    this.fireCooldown = Math.max(-elapsed, this.fireCooldown - elapsed);
    if (this.unit.isHiding) {
      resetFireControlState(this.fireControl, 'HIDDEN_HOLD_FIRE');
      this.targetUnitId = null;
      this.targetSoldierId = null;
      this.syncRecord();
      return false;
    }
    if (this.unit.holdFire) {
      resetFireControlState(this.fireControl, 'HOLD_FIRE');
      this.targetUnitId = null;
      this.targetSoldierId = null;
      this.syncRecord();
      return false;
    }
    if (context.holdFireSoldierIds?.has(String(this.id))) {
      resetFireControlState(this.fireControl, 'CREW_SERVED_WEAPON');
      this.targetUnitId = null;
      this.targetSoldierId = null;
      this.syncRecord();
      return false;
    }
    if (this.state === 'MOVING'
        || isInfantryOrderMovingFireProhibited(this.state)
        || this.state === 'REACTING' || this.state === 'ADVANCING'
        || this.state === 'BOUNDING'
        || this.state === 'VAULTING'
        || this.state === 'TAKING_COVER' || this.state === 'FLEEING') {
      resetFireControlState(this.fireControl, 'MOVING');
      this.targetUnitId = null;
      this.targetSoldierId = null;
      this.syncRecord();
      return false;
    }

    if (this.magazineAmmo <= 0) {
      this.startReload();
      return false;
    }

    // Degrade fire cadence/accuracy under higher suppression tiers
    const suppressionAccuracyFactor = this.moraleTier === 'CAUTIOUS' ? 0.85
      : this.moraleTier === 'DUCKING' ? 0.65
      : this.moraleTier === 'TAKING_COVER' ? 0.45
      : (['PINNED', 'COWERING', 'ROUTED', 'FLEEING'].includes(this.state) || ['PINNED', 'ROUTED'].includes(this.moraleTier)) ? 0 : 1;

    if (suppressionAccuracyFactor <= 0) {
      resetFireControlState(this.fireControl, 'SUPPRESSED');
      this.syncRecord();
      return false;
    }

    const checkLOS = context.spotting?.checkLOS;
    if (typeof checkLOS !== 'function') {
      resetFireControlState(this.fireControl);
      return false;
    }

    let best = null;
    const orderedUnit = this.unit.targetUnit?.isCombatEffective()
      ? this.unit.targetUnit
      : null;
    const retainedUnit = !orderedUnit && this.targetUnitId != null
      ? context.opposingUnitsById?.get(String(this.targetUnitId))
        ?? context.opposingUnits.find(
          unit => String(unit.id) === String(this.targetUnitId)
        )
        ?? null
      : null;
    const canScanForUnitTarget = Boolean(
      orderedUnit
      || retainedUnit
      || this.targetScanCooldown <= 0
    );
    const candidateUnits = !canScanForUnitTarget
      ? []
      : orderedUnit
      ? [orderedUnit]
      : retainedUnit
        ? [
            retainedUnit,
            ...context.opposingUnits.filter(unit => unit !== retainedUnit)
          ]
        : context.opposingUnits;
    for (const enemyUnit of candidateUnits) {
      const precisionGate = context.spotting?.canPrecisionTarget;
      if (!enemyUnit.isCombatEffective()
          || !canInfantryWeaponEngageTarget(weapon, enemyUnit)
          || (context.precisionCandidatesPrevalidated !== true
            && typeof precisionGate === 'function'
            && !precisionGate.call(context.spotting, this.unit, enemyUnit))) continue;
      const livingEnemyAgents = context.livingTargetAgents?.get(enemyUnit)
        ?? enemyUnit.soldierAI?.getLivingAgents()
        ?? [];
      const retainedAgent = enemyUnit === retainedUnit && this.targetSoldierId != null
        ? livingEnemyAgents.find(
            agent => String(agent.id) === String(this.targetSoldierId)
          ) ?? null
        : null;
      const enemyAgents = retainedAgent
        ? [
            retainedAgent,
            ...livingEnemyAgents.filter(agent => agent !== retainedAgent)
          ]
        : livingEnemyAgents;
      if (enemyAgents.length === 0) {
        const exposedCommander =
          enemyUnit.getExposedCommanderTargetPosition?.() ?? null;
        const targetPosition = exposedCommander ?? enemyUnit.position;
        if (exceedsHorizontalRange(this.position, targetPosition, weapon.maxRange)) {
          continue;
        }
        const los = checkLOS.call(
          context.spotting,
          this.position,
          targetPosition,
          { cacheStableRay: true }
        );
        if (los.clear && los.dist <= weapon.maxRange
            && context.buildingInteraction?.canFireAt?.(
              this,
              targetPosition
            ) !== false
            && (!best || los.dist < best.distance)) {
          best = {
            unit: enemyUnit,
            agent: null,
            position: targetPosition,
            distance: los.dist
          };
          if (enemyUnit === retainedUnit) break;
        }
        continue;
      }
      for (const enemy of enemyAgents) {
        if (!isBuildingOccupantExposed(enemy, enemyUnit)) continue;
        if (exceedsHorizontalRange(this.position, enemy.position, weapon.maxRange)) {
          continue;
        }
        const los = checkLOS.call(
          context.spotting,
          this.position,
          enemy.position,
          { cacheStableRay: true }
        );
        if (los.clear && los.dist <= weapon.maxRange
            && context.buildingInteraction?.canFireAt?.(this, enemy.position) !== false
            && (!best || los.dist < best.distance)) {
          best = { unit: enemyUnit, agent: enemy, position: enemy.position, distance: los.dist };
          if (enemy === retainedAgent) break;
        }
      }
      if (best && enemyUnit === retainedUnit) break;
    }
    if (!best && this.unit.targetPos) {
      if (exceedsHorizontalRange(this.position, this.unit.targetPos, weapon.maxRange)) {
        this.targetUnitId = null;
        this.targetSoldierId = null;
        resetFireControlState(this.fireControl);
        this.syncRecord();
        return false;
      }
      const los = checkLOS.call(
        context.spotting,
        this.position,
        this.unit.targetPos,
        { cacheStableRay: true }
      );
      if (los.clear && los.dist <= weapon.maxRange
          && context.buildingInteraction?.canFireAt?.(this, this.unit.targetPos) !== false) {
        best = { unit: null, agent: null, position: this.unit.targetPos, distance: los.dist };
      }
    }
    if (!best) {
      this.targetUnitId = null;
      this.targetSoldierId = null;
      if (canScanForUnitTarget) {
        this.targetScanCooldown = INFANTRY_TARGET_SCAN_INTERVAL_SECONDS;
      }
      resetFireControlState(this.fireControl);
      this.syncRecord();
      return false;
    }

    this.targetUnitId = best.unit?.id ?? null;
    this.targetSoldierId = best.agent?.id ?? null;
    if (best.unit) this.targetScanCooldown = 0;
    this.facing = Math.atan2(best.position.x - this.position.x, best.position.z - this.position.z);
    this.state = 'AIMING';
    const targetKey = createFireControlTargetKey({
      targetUnitId: this.targetUnitId,
      targetSoldierId: this.targetSoldierId,
      targetPosition: best.position
    });
    const targetMoving = best.agent
      ? best.agent.velocity.lengthSq() > 0.04
      : Math.abs(best.unit?.moveSpeed ?? 0) > 0.2;
    const aim = advanceFireControlState(this.fireControl, {
      deltaSeconds: elapsed,
      shooterKey: `${this.unit.id}:${this.id}`,
      targetKey,
      weapon,
      trueRangeMeters: best.distance,
      platform: 'infantry',
      experience: this.unit.experience,
      stance: this.stance,
      suppression: this.suppression,
      wounded: this.isWounded,
      targetMoving
    });
    if (aim.becameReady) {
      this.fireCooldown = Math.max(this.fireCooldown, -aim.overshootSeconds);
    }
    if (!aim.ready || this.reloadTimer > 0
        || this.fireCooldown > INFANTRY_CADENCE_EPSILON) {
      this.syncRecord();
      return false;
    }

    const experienceDispersion = { Green: 1.5, Regular: 1.15, Veteran: 0.92, Crack: 0.78 };
    const dispersionScale = (experienceDispersion[this.unit.experience] ?? 1.15)
      * (best.agent?.stance === 'PRONE' || best.unit?.isHiding ? 1.55 : 1)
      * (this.isWounded ? 1.45 : 1)
      * (1 + this.suppression / 85)
      * (this.unit.targetMode === 'TARGET_LIGHT' ? 1.25 : 1)
      / suppressionAccuracyFactor
      * aim.dispersionScale;
    // Project only the actual shooter immediately before emission. The rest
    // of the squad is projected once after the frame's fixed-step batch.
    this.unit.soldierAI?.syncAgentMesh?.(this);
    const muzzlePosition = this.getMuzzleWorldPosition();
    const cyclicRPM = weapon.cyclicRPM ?? weapon.rateOfFireRpm ?? weapon.practicalRPM ?? 600;
    const practicalRPM = weapon.practicalRPM ?? cyclicRPM;
    const burstSize = Math.max(1, weapon.burstSize ?? 1);
    const cyclicInterval = 60 / cyclicRPM;
    let firedAny = false;
    let emitted = 0;
    while (this.fireCooldown <= INFANTRY_CADENCE_EPSILON
        && this.magazineAmmo > 0
        && emitted < MAX_INFANTRY_ROUNDS_PER_STEP) {
      if (this.burstRemaining <= 0) this.burstRemaining = burstSize;
      const fired = context.combat.fireWeapon(this.unit, best.unit, best.position, {
        shooter: this,
        targetSoldier: best.agent,
        weapon,
        muzzlePosition,
        dispersionScale,
        estimatedRangeMeters: this.fireControl.estimatedRangeMeters,
        fireControlModelVersion: this.fireControl.modelVersion,
        aimRequiredSeconds: this.fireControl.aimRequiredSeconds,
        rangeErrorMeters: this.fireControl.rangeErrorMeters
      });
      if (!fired) {
        this.fireCooldown = Math.max(0, this.fireCooldown);
        break;
      }

      this.magazineAmmo--;
      this.roundsFired++;
      this.recoilTime = 0.12;
      this.burstRemaining--;
      if (this.burstRemaining > 0 && this.magazineAmmo > 0) {
        this.fireCooldown += cyclicInterval;
      } else {
        const burstCycle = burstSize * 60 / practicalRPM;
        this.fireCooldown += Math.max(
          cyclicInterval,
          burstCycle - cyclicInterval * Math.max(0, burstSize - 1)
        );
        this.burstRemaining = 0;
        if (this.magazineAmmo <= 0) this.startReload();
      }
      firedAny = true;
      emitted++;
    }
    if (emitted === MAX_INFANTRY_ROUNDS_PER_STEP
        && this.fireCooldown <= INFANTRY_CADENCE_EPSILON) {
      this.fireCooldown = cyclicInterval;
    }
    if (firedAny) {
      recordFireControlShot(this.fireControl, weapon, {
        platform: 'infantry',
        burstComplete: this.burstRemaining <= 0
      });
    }
    this.syncRecord();
    return firedAny;
  }
}
