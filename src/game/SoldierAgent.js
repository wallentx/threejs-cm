import * as THREE from 'three';
import { getWeapon, weaponIdFromName } from './WeaponCatalog.js';

const UP = new THREE.Vector3(0, 1, 0);
const MAX_INFANTRY_ROUNDS_PER_STEP = 64;
const INFANTRY_CADENCE_EPSILON = 1e-9;
const INFANTRY_COLLISION_RADIUS = 0.32;

function hash01(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

export class SoldierAgent {
  constructor(unit, record, mesh, index) {
    this.unit = unit;
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
    this.weaponId = record.weaponId ?? weaponIdFromName(record.weapon);
    const weapon = getWeapon(this.weaponId);
    this.magazineAmmo = record.magazineAmmo ?? weapon?.magazineSize ?? 0;
    this.reserveAmmo = record.reserveAmmo
      ?? Math.max(0, (weapon?.carriedAmmo ?? 0) - this.magazineAmmo);
    this.reloadTimer = record.reloadTimer ?? 0;
    this.burstRemaining = record.burstRemaining ?? 0;
    this.roundsFired = record.roundsFired ?? 0;
    this.recoilTime = record.recoilTime ?? 0;
    this.health = record.health ?? 100;
    this.suppression = record.suppression ?? 0;
    this.state = record.state ?? 'READY';
    this.stance = record.stance ?? 'STANDING';
    this.status = record.status ?? 'OK';
    this.moraleTier = record.moraleTier ?? 'READY';
    this.targetUnitId = record.targetUnitId ?? null;
    this.targetSoldierId = record.targetSoldierId ?? null;
    this.buildingLocation = record.buildingLocation
      ? JSON.parse(JSON.stringify(record.buildingLocation))
      : null;
    this.commandWaypoint = record.commandWaypoint ?? -1;
    this.syncRecord();
  }

  get id() { return this.record.id; }
  get weapon() { return this.record.weapon; }
  get role() { return this.record.role; }
  get isAlive() { return this.health > 0 && this.status !== 'KIA'; }
  get isWounded() { return this.health < 70 && this.isAlive; }

  applyDamage(damage, suppression = 0) {
    if (!this.isAlive) return;
    this.health = Math.max(0, this.health - Math.max(0, damage));
    this.suppression = Math.min(100, this.suppression + Math.max(0, suppression));
    if (this.health === 0) {
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
    return {
      ...this.record,
      worldPosition: [...this.record.worldPosition],
      velocity: [...this.record.velocity],
      slotOffset: [...this.record.slotOffset],
      buildingLocation: this.record.buildingLocation
        ? JSON.parse(JSON.stringify(this.record.buildingLocation))
        : null
    };
  }

  restore(record) {
    this.record = record;
    this.health = record.health ?? 100;
    this.suppression = record.suppression ?? 0;
    this.state = record.state ?? 'READY';
    this.stance = record.stance ?? 'STANDING';
    this.status = record.status ?? 'OK';
    this.moraleTier = record.moraleTier ?? 'READY';
    if (record.worldPosition) this.position.fromArray(record.worldPosition);
    if (record.velocity) this.velocity.fromArray(record.velocity);
    if (record.slotOffset) this.slotOffset.fromArray(record.slotOffset);
    this.facing = record.facing ?? this.facing;
    this.pace = record.pace ?? this.pace;
    this.reactionDelay = record.reactionDelay ?? this.reactionDelay;
    this.stridePhase = record.stridePhase ?? this.stridePhase;
    this.fireCooldown = record.fireCooldown ?? this.fireCooldown;
    this.weaponId = record.weaponId ?? weaponIdFromName(record.weapon) ?? this.weaponId;
    const weapon = getWeapon(this.weaponId);
    this.magazineAmmo = record.magazineAmmo ?? weapon?.magazineSize ?? 0;
    this.reserveAmmo = record.reserveAmmo
      ?? Math.max(0, (weapon?.carriedAmmo ?? 0) - this.magazineAmmo);
    this.reloadTimer = record.reloadTimer ?? 0;
    this.burstRemaining = record.burstRemaining ?? 0;
    this.roundsFired = record.roundsFired ?? 0;
    this.recoilTime = record.recoilTime ?? 0;
    this.targetUnitId = record.targetUnitId ?? null;
    this.targetSoldierId = record.targetSoldierId ?? null;
    this.buildingLocation = record.buildingLocation ? JSON.parse(JSON.stringify(record.buildingLocation)) : null;
    this.commandWaypoint = record.commandWaypoint ?? -1;
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
      buildingLocation: this.buildingLocation
        ? JSON.parse(JSON.stringify(this.buildingLocation))
        : null,
      commandWaypoint: this.commandWaypoint
    });
  }

  updateMovement(delta, terrain, context = {}) {
    const elapsed = Math.max(delta, 0);
    const dt = Math.min(elapsed, 0.1);

    this.recoilTime = Math.max(0, this.recoilTime - elapsed);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - elapsed);
      this.state = 'RELOADING';
      if (this.reloadTimer === 0) this.completeReload();
    }
    if (!this.isAlive) {
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
    let moraleTier = 'READY';
    if (this.suppression > 90) {
      moraleTier = 'ROUTED';
    } else if (this.suppression >= 75) {
      moraleTier = 'PINNED';
    } else if (this.suppression >= 55) {
      moraleTier = 'TAKING_COVER';
    } else if (this.suppression >= 35) {
      moraleTier = 'DUCKING';
    } else if (this.suppression >= 15) {
      moraleTier = 'CAUTIOUS';
    }
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
          this.stance = context.orderType === 'HUNT' ? 'KNEELING' : 'STANDING';
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

          this.state = context.orderType === 'HUNT' ? 'ADVANCING' : 'MOVING';
          this.stance = context.orderType === 'HUNT' ? 'KNEELING' : 'STANDING';
          const baseSpeed = context.orderType === 'FAST' ? 5.1 : context.orderType === 'HUNT' ? 1.75 : 2.75;
          direction.normalize().addScaledVector(separation, 0.72).normalize();
          const desiredSpeed = Math.min(
            baseSpeed * this.pace * (this.isWounded ? 0.55 : 1),
            distance / Math.max(dt, 0.001)
          );
          this.velocity.lerp(direction.multiplyScalar(desiredSpeed), 1 - Math.exp(-7 * dt));
          this.facing = Math.atan2(this.velocity.x, this.velocity.z);
        }
      } else {
        this.velocity.multiplyScalar(Math.exp(-7 * dt));
        this.state = this.targetUnitId ? 'AIMING' : 'OBSERVING';
        this.stance = this.unit.stance;
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
      { moverType: 'infantry' }
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
    } else {
      this.position.x += intendedMovement.x;
      this.position.z += intendedMovement.z;
    }
    if (!this.buildingLocation && !this.vehicleLocation) {
      this.position.y = terrain.getMovementHeightAt
        ? terrain.getMovementHeightAt(this.position.x, this.position.z)
        : terrain.getHeightAt(this.position.x, this.position.z);
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
    const weapon = getWeapon(this.weaponId);
    if (!weapon || this.reloadTimer > 0 || this.reserveAmmo <= 0) return false;
    this.reloadTimer = weapon.reloadSeconds;
    this.burstRemaining = 0;
    this.state = 'RELOADING';
    this.syncRecord();
    return true;
  }

  completeReload() {
    const weapon = getWeapon(this.weaponId);
    if (!weapon || this.magazineAmmo >= weapon.magazineSize || this.reserveAmmo <= 0) return false;
    const rounds = Math.min(weapon.magazineSize - this.magazineAmmo, this.reserveAmmo);
    this.magazineAmmo += rounds;
    this.reserveAmmo -= rounds;
    this.state = 'READY';
    this.syncRecord();
    return true;
  }

  updateCombat(delta, context) {
    const elapsed = Math.max(delta, 0);
    const weapon = getWeapon(this.weaponId);
    if (!weapon || !this.isAlive) return false;

    this.fireCooldown = Math.max(-elapsed, this.fireCooldown - elapsed);
    if (this.reloadTimer > 0 || this.fireCooldown > INFANTRY_CADENCE_EPSILON) return false;
    if (this.state === 'MOVING' || this.state === 'REACTING' || this.state === 'ADVANCING'
        || this.state === 'TAKING_COVER' || this.state === 'FLEEING') return false;

    if (this.magazineAmmo <= 0) {
      this.startReload();
      return false;
    }

    // Degrade fire cadence/accuracy under higher suppression tiers
    const suppressionAccuracyFactor = this.moraleTier === 'CAUTIOUS' ? 0.85
      : this.moraleTier === 'DUCKING' ? 0.65
      : this.moraleTier === 'TAKING_COVER' ? 0.45
      : (['PINNED', 'COWERING', 'ROUTED', 'FLEEING'].includes(this.state) || ['PINNED', 'ROUTED'].includes(this.moraleTier)) ? 0 : 1;

    if (suppressionAccuracyFactor <= 0) return false;

    const checkLOS = context.spotting?.checkLOS;
    if (typeof checkLOS !== 'function') return false;

    let best = null;
    const candidateUnits = this.unit.targetUnit?.isCombatEffective()
      ? [this.unit.targetUnit]
      : context.opposingUnits;
    for (const enemyUnit of candidateUnits) {
      const precisionGate = context.spotting?.canPrecisionTarget;
      if (!enemyUnit.isCombatEffective()
          || (typeof precisionGate === 'function'
            && !precisionGate.call(context.spotting, this.unit, enemyUnit))) continue;
      const enemyAgents = enemyUnit.soldierAI?.getLivingAgents() ?? [];
      if (enemyAgents.length === 0) {
        const los = checkLOS.call(context.spotting, this.position, enemyUnit.position);
        if (los.clear && los.dist <= weapon.maxRange
            && context.buildingInteraction?.canFireAt?.(this, enemyUnit.position) !== false
            && (!best || los.dist < best.distance)) {
          best = { unit: enemyUnit, agent: null, position: enemyUnit.position, distance: los.dist };
        }
        continue;
      }
      for (const enemy of enemyAgents) {
        const los = checkLOS.call(context.spotting, this.position, enemy.position);
        if (los.clear && los.dist <= weapon.maxRange
            && context.buildingInteraction?.canFireAt?.(this, enemy.position) !== false
            && (!best || los.dist < best.distance)) {
          best = { unit: enemyUnit, agent: enemy, position: enemy.position, distance: los.dist };
        }
      }
    }
    if (!best && this.unit.targetPos) {
      const los = checkLOS.call(context.spotting, this.position, this.unit.targetPos);
      if (los.clear && los.dist <= weapon.maxRange
          && context.buildingInteraction?.canFireAt?.(this, this.unit.targetPos) !== false) {
        best = { unit: null, agent: null, position: this.unit.targetPos, distance: los.dist };
      }
    }
    if (!best) {
      this.targetUnitId = null;
      this.targetSoldierId = null;
      this.syncRecord();
      return false;
    }

    this.targetUnitId = best.unit?.id ?? null;
    this.targetSoldierId = best.agent?.id ?? null;
    this.facing = Math.atan2(best.position.x - this.position.x, best.position.z - this.position.z);
    this.state = 'AIMING';

    const experienceDispersion = { Green: 1.5, Regular: 1.15, Veteran: 0.92, Crack: 0.78 };
    const dispersionScale = (experienceDispersion[this.unit.experience] ?? 1.15)
      * (best.agent?.stance === 'PRONE' || best.unit?.isHiding ? 1.55 : 1)
      * (this.isWounded ? 1.45 : 1)
      * (1 + this.suppression / 85)
      * (this.unit.targetMode === 'TARGET_LIGHT' ? 1.25 : 1)
      / suppressionAccuracyFactor;
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
        dispersionScale
      });
      if (!fired) break;

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
    this.syncRecord();
    return firedAny;
  }
}
