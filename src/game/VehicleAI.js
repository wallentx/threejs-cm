function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function round4(val) {
  return typeof val === 'number' && Number.isFinite(val)
    ? Math.round(val * 10000) / 10000
    : 0;
}

export class VehicleAI {
  constructor(unit = null, savedState = null) {
    this.unit = unit;
    this.targetThreatPosition = null;
    this.targetThreatId = null;
    this.threatFacingActive = false;
    this.turretTargetAngle = null;
    this.hullTargetAngle = null;
    this.isReversing = false;
    this.isPillbox = false;
    this.hullDownActive = false;
    this.exposureModifier = 1.0;

    this.tacticalDecision = {
      reason: 'idle',
      threatFacingActive: false,
      threatPosition: null,
      turretAngle: 0,
      hullAngle: 0,
      frontArmorAligned: false,
      isReversing: false,
      reverseVector: null,
      trackTravelSigned: [0, 0],
      isPillbox: false,
      mobilityDisabled: false,
      opticsDamaged: false,
      spottingModifier: 1.0,
      gunnerAvailable: true,
      driverAvailable: true,
      isWithdrawing: false,
      burningAbandoned: false,
      hullDownActive: false,
      exposureModifier: 1.0
    };

    if (savedState) {
      this.restoreState(savedState);
    }
  }

  update(delta = 1 / 30, terrain = null, context = {}) {
    const dt = Math.max(0, Number.isFinite(delta) ? delta : 0);
    const unit = this.unit;

    let threatPos = null;
    if (context.threatPosition) {
      const tp = context.threatPosition;
      threatPos = tp.isVector3 || typeof tp.x === 'number'
        ? { x: tp.x, y: tp.y ?? 0, z: tp.z }
        : { x: tp[0], y: tp[1] ?? 0, z: tp[2] };
    } else if (unit?.targetUnit?.position) {
      const up = unit.targetUnit.position;
      threatPos = { x: up.x, y: up.y ?? 0, z: up.z };
    } else if (unit?.targetPos) {
      const tp = unit.targetPos;
      threatPos = tp.isVector3 || typeof tp.x === 'number'
        ? { x: tp.x, y: tp.y ?? 0, z: tp.z }
        : { x: tp[0], y: tp[1] ?? 0, z: tp[2] };
    } else if (this.targetThreatPosition) {
      threatPos = {
        x: this.targetThreatPosition[0],
        y: this.targetThreatPosition[1],
        z: this.targetThreatPosition[2]
      };
    }

    if (threatPos) {
      this.targetThreatPosition = [
        round4(threatPos.x),
        round4(threatPos.y),
        round4(threatPos.z)
      ];
      this.threatFacingActive = true;
    } else {
      this.targetThreatPosition = null;
      this.threatFacingActive = false;
    }

    // Component & crew status inspection
    const components = unit?.vehicleComponents ?? unit?.components ?? {};
    const engineOk = components.engine?.operational !== false && (components.engine?.health ?? 100) > 25;
    const transmissionOk = components.transmission?.operational !== false && (components.transmission?.health ?? 100) > 25;
    const tracksOk = components.tracks?.operational !== false && (components.tracks?.health ?? 100) > 25;
    const mobilityDisabled = Boolean(!engineOk || !transmissionOk || !tracksOk || unit?.damageState?.immobilized || context.mobilityDisabled);

    const mainGunComponent = components.main_gun ?? null;
    const mainGunDisabled = Boolean(mainGunComponent && (mainGunComponent.health <= 25 || mainGunComponent.operational === false));

    const opticsComponent = components.optics ?? null;
    const opticsHealth = opticsComponent?.health ?? 100;
    const opticsDamaged = Boolean(opticsComponent && opticsHealth < 70);
    const opticsDestroyed = Boolean(opticsComponent && opticsHealth <= 0);
    const spottingModifier = opticsDestroyed ? 0.3 : (opticsDamaged ? 0.6 : 1.0);

    const gunnerAvailable = context.gunnerAvailable !== undefined
      ? Boolean(context.gunnerAvailable)
      : (components.gunner?.operational !== false && (typeof unit?.hasEffectiveMainGunner === 'function' ? unit.hasEffectiveMainGunner() : true));
    const driverAvailable = context.driverAvailable !== undefined
      ? Boolean(context.driverAvailable)
      : (components.driver?.operational !== false && (typeof unit?.hasEffectiveDriver === 'function' ? unit.hasEffectiveDriver() : true));

    // Burning vehicle state
    const isBurning = Boolean(unit?.damageState?.burning || context.burning);

    // Pillbox mode
    const isPillbox = mobilityDisabled || !driverAvailable;
    this.isPillbox = isPillbox;

    if (isPillbox && unit) {
      unit.isMoving = false;
      if (unit.velocity && typeof unit.velocity.set === 'function') {
        unit.velocity.set(0, 0, 0);
      }
    }

    // Gun disabled withdrawal
    const isWithdrawing = Boolean((!gunnerAvailable || mainGunDisabled) && !isPillbox && threatPos);

    // Movement & Reverse Evaluation
    const orderType = context.orderType ?? unit?.orderType ?? 'MOVE';
    const isHeavyThreatRetreat = Boolean(context.heavyThreat || (unit?.damageState?.heavyFire && threatPos));

    let preferReverse = false;
    if (unit && threatPos) {
      const dx = threatPos.x - unit.position.x;
      const dz = threatPos.z - unit.position.z;
      const targetAngle = Math.atan2(dx, dz);
      const angleDiff = Math.abs(normalizeAngle(targetAngle - unit.rotation));
      if (orderType === 'REVERSE' || isHeavyThreatRetreat || (isWithdrawing && angleDiff < Math.PI * 0.75)) {
        preferReverse = true;
      }
    }

    const shouldReverse = !isPillbox && !isBurning && preferReverse;
    this.isReversing = shouldReverse;

    // Hull-Down Evaluation
    let hullDownActive = Boolean(context.hullDown || orderType === 'HULL_DOWN');
    if (!hullDownActive && unit && threatPos && terrain && typeof terrain.getHeightAt === 'function') {
      const vPos = unit.position;
      const dx = threatPos.x - vPos.x;
      const dz = threatPos.z - vPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 5) {
        const vehicleHeight = unit.height ?? 2.2;
        const opticOffset = unit.opticHeight ?? 1.8;
        const groundH = terrain.getHeightAt(vPos.x, vPos.z);
        const eyeH = groundH + opticOffset;

        const nx = dx / dist;
        const nz = dz / dist;
        for (const sampleDist of [2.0, 4.0, 6.0]) {
          if (sampleDist >= dist) break;
          const crestH = terrain.getHeightAt(vPos.x + nx * sampleDist, vPos.z + nz * sampleDist);
          if (crestH >= groundH + 0.3 && crestH <= eyeH + 0.2) {
            hullDownActive = true;
            break;
          }
        }
      }
    }

    this.hullDownActive = hullDownActive;
    const exposureModifier = hullDownActive ? 0.45 : 1.0;
    this.exposureModifier = exposureModifier;

    let frontArmorAligned = false;
    let reverseVector = null;
    let trackTravelSigned = [0, 0];

    if (unit && threatPos) {
      const dx = threatPos.x - unit.position.x;
      const dz = threatPos.z - unit.position.z;
      const targetAngle = Math.atan2(dx, dz);
      this.turretTargetAngle = targetAngle;
      this.hullTargetAngle = targetAngle;

      const traverseSpeed = unit.turretTraverseRate ?? 0.35;
      const hullTurnSpeed = unit.hullTurnRate ?? 0.20;

      if (typeof unit.turretRotation === 'number' && !isBurning) {
        const currentAbsoluteTurret = normalizeAngle(unit.rotation + unit.turretRotation);
        const turretDiff = normalizeAngle(targetAngle - currentAbsoluteTurret);
        const turretStep = Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), traverseSpeed * dt);
        const newAbsoluteTurret = normalizeAngle(currentAbsoluteTurret + turretStep);
        unit.turretRotation = normalizeAngle(newAbsoluteTurret - unit.rotation);
      }

      const isMoving = Boolean(!isPillbox && (unit.isMoving || (unit.waypoints && unit.waypoints.length > 0) || shouldReverse));
      if (shouldReverse) {
        const hullDiff = normalizeAngle(targetAngle - unit.rotation);
        const hullStep = Math.sign(hullDiff) * Math.min(Math.abs(hullDiff), hullTurnSpeed * dt);
        unit.rotation = normalizeAngle(unit.rotation + hullStep);
        frontArmorAligned = Math.abs(normalizeAngle(targetAngle - unit.rotation)) < 0.18;

        const revDirX = -Math.sin(unit.rotation);
        const revDirZ = -Math.cos(unit.rotation);
        reverseVector = [round4(revDirX), round4(revDirZ)];
        const revSpeed = (unit.maxSpeed ?? 3.5) * 0.5;
        const distStep = -revSpeed * dt;
        trackTravelSigned = [round4(distStep), round4(distStep)];

        if (unit.velocity && typeof unit.velocity.set === 'function') {
          unit.velocity.set(revDirX * revSpeed, 0, revDirZ * revSpeed);
        }
      } else if (!isMoving) {
        if (!isPillbox && !isBurning) {
          const hullDiff = normalizeAngle(targetAngle - unit.rotation);
          const hullStep = Math.sign(hullDiff) * Math.min(Math.abs(hullDiff), hullTurnSpeed * dt);
          unit.rotation = normalizeAngle(unit.rotation + hullStep);
        }
        frontArmorAligned = Math.abs(normalizeAngle(targetAngle - unit.rotation)) < 0.15;
      } else {
        frontArmorAligned = Math.abs(normalizeAngle(targetAngle - unit.rotation)) < 0.25;
      }
    }

    const isMoving = Boolean(!isPillbox && !isBurning && (unit?.isMoving || (unit?.waypoints && unit.waypoints.length > 0) || shouldReverse));
    
    let reason = 'idle';
    if (isBurning) {
      reason = 'vehicle-burning-abandoned';
    } else if (isPillbox) {
      reason = 'pillbox-mode';
    } else if (isWithdrawing) {
      reason = 'gun-disabled-withdrawal';
    } else if (hullDownActive) {
      reason = 'hull-down-defense';
    } else if (shouldReverse) {
      reason = 'tactical-reverse';
    } else if (threatPos) {
      reason = isMoving ? 'threat-turret-traverse' : 'threat-hull-align';
    }

    this.tacticalDecision = {
      reason,
      threatFacingActive: this.threatFacingActive,
      threatPosition: this.targetThreatPosition ? [...this.targetThreatPosition] : null,
      turretAngle: round4(unit?.turretRotation ?? 0),
      hullAngle: round4(unit?.rotation ?? 0),
      frontArmorAligned,
      isReversing: this.isReversing,
      reverseVector,
      trackTravelSigned,
      isPillbox: this.isPillbox,
      mobilityDisabled,
      opticsDamaged,
      spottingModifier,
      gunnerAvailable,
      driverAvailable,
      isWithdrawing,
      burningAbandoned: isBurning,
      hullDownActive: this.hullDownActive,
      exposureModifier: this.exposureModifier
    };

    if (unit) {
      unit.tacticalDecision = this.tacticalDecision;
      unit.vehicleAI = this;
      unit.exposureModifier = this.exposureModifier;
    }

    return this.tacticalDecision;
  }

  captureState() {
    return {
      targetThreatPosition: this.targetThreatPosition ? [...this.targetThreatPosition] : null,
      targetThreatId: this.targetThreatId,
      threatFacingActive: this.threatFacingActive,
      turretTargetAngle: this.turretTargetAngle,
      hullTargetAngle: this.hullTargetAngle,
      isReversing: this.isReversing,
      isPillbox: this.isPillbox,
      hullDownActive: this.hullDownActive,
      exposureModifier: this.exposureModifier,
      tacticalDecision: this.tacticalDecision ? {
        reason: this.tacticalDecision.reason,
        threatFacingActive: this.tacticalDecision.threatFacingActive,
        threatPosition: this.tacticalDecision.threatPosition ? [...this.tacticalDecision.threatPosition] : null,
        turretAngle: this.tacticalDecision.turretAngle,
        hullAngle: this.tacticalDecision.hullAngle,
        frontArmorAligned: this.tacticalDecision.frontArmorAligned,
        isReversing: this.tacticalDecision.isReversing,
        reverseVector: this.tacticalDecision.reverseVector ? [...this.tacticalDecision.reverseVector] : null,
        trackTravelSigned: this.tacticalDecision.trackTravelSigned ? [...this.tacticalDecision.trackTravelSigned] : [0, 0],
        isPillbox: this.tacticalDecision.isPillbox,
        mobilityDisabled: this.tacticalDecision.mobilityDisabled,
        opticsDamaged: this.tacticalDecision.opticsDamaged,
        spottingModifier: this.tacticalDecision.spottingModifier,
        gunnerAvailable: this.tacticalDecision.gunnerAvailable,
        driverAvailable: this.tacticalDecision.driverAvailable,
        isWithdrawing: this.tacticalDecision.isWithdrawing,
        burningAbandoned: this.tacticalDecision.burningAbandoned,
        hullDownActive: this.tacticalDecision.hullDownActive,
        exposureModifier: this.tacticalDecision.exposureModifier
      } : null
    };
  }

  restoreState(savedState) {
    if (!savedState || typeof savedState !== 'object') {
      return this;
    }
    this.targetThreatPosition = savedState.targetThreatPosition ? [...savedState.targetThreatPosition] : null;
    this.targetThreatId = savedState.targetThreatId ?? null;
    this.threatFacingActive = savedState.threatFacingActive ?? false;
    this.turretTargetAngle = savedState.turretTargetAngle ?? null;
    this.hullTargetAngle = savedState.hullTargetAngle ?? null;
    this.isReversing = savedState.isReversing ?? false;
    this.isPillbox = savedState.isPillbox ?? false;
    this.hullDownActive = savedState.hullDownActive ?? false;
    this.exposureModifier = savedState.exposureModifier ?? 1.0;

    if (savedState.tacticalDecision) {
      const td = savedState.tacticalDecision;
      this.tacticalDecision = {
        reason: td.reason ?? 'idle',
        threatFacingActive: td.threatFacingActive ?? false,
        threatPosition: td.threatPosition ? [...td.threatPosition] : null,
        turretAngle: td.turretAngle ?? 0,
        hullAngle: td.hullAngle ?? 0,
        frontArmorAligned: td.frontArmorAligned ?? false,
        isReversing: td.isReversing ?? false,
        reverseVector: td.reverseVector ? [...td.reverseVector] : null,
        trackTravelSigned: td.trackTravelSigned ? [...td.trackTravelSigned] : [0, 0],
        isPillbox: td.isPillbox ?? false,
        mobilityDisabled: td.mobilityDisabled ?? false,
        opticsDamaged: td.opticsDamaged ?? false,
        spottingModifier: td.spottingModifier ?? 1.0,
        gunnerAvailable: td.gunnerAvailable ?? true,
        driverAvailable: td.driverAvailable ?? true,
        isWithdrawing: td.isWithdrawing ?? false,
        burningAbandoned: td.burningAbandoned ?? false,
        hullDownActive: td.hullDownActive ?? false,
        exposureModifier: td.exposureModifier ?? 1.0
      };
    }

    if (this.unit) {
      this.unit.tacticalDecision = this.tacticalDecision;
      this.unit.vehicleAI = this;
      this.unit.exposureModifier = this.exposureModifier;
    }
    return this;
  }
}
