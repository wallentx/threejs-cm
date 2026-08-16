import { evaluateVehicleThreatFacing } from '../simulation/vehicles/VehicleThreatFacing.js';
import { shouldVehicleReverse } from '../simulation/vehicles/VehicleReverseManeuver.js';
import { evaluateVehicleDamageBehavior } from '../simulation/vehicles/VehicleDamageBehavior.js';

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clonePlain(child)])
    );
  }
  return value;
}

export class VehicleAI {
  constructor(unit = null, savedState = null) {
    this.unit = unit;
    this.targetThreatPosition = null;
    this.targetThreatId = null;
    this.threatFacingActive = false;
    this.isReversing = false;
    this.tacticalDecision = null;

    if (savedState) {
      this.restoreState(savedState);
    }
  }

  update(delta = 1 / 30, terrain = null, context = {}) {
    if (!this.unit) return null;

    const contacts = context.contacts
      ?? (this.unit.targetUnit ? [this.unit.targetUnit] : []);
    // A retained target object may keep moving while no observer can see it.
    // Consume only the contact snapshot supplied by GameApp, an explicit
    // command point, or the unit's frozen point target here.
    const threatPosition = context.threatPosition ?? this.unit.targetPos ?? null;

    const facingDecision = evaluateVehicleThreatFacing({
      unit: this.unit,
      contacts,
      threatPosition,
      deltaSeconds: delta
    });

    const damageDecision = evaluateVehicleDamageBehavior(this.unit);

    const isReversing = shouldVehicleReverse({
      unit: this.unit,
      orderType: context.orderType,
      targetPosition: context.targetPosition,
      threatPosition,
      heavyThreat: context.heavyThreat
    });

    this.isReversing = isReversing;
    let reason = 'idle';
    if (damageDecision?.reason && damageDecision.reason !== 'operational') {
      reason = damageDecision.reason;
    } else if (isReversing) {
      reason = 'tactical-reverse';
    } else if (facingDecision?.reason) {
      reason = facingDecision.reason;
    }

    const decision = {
      ...(facingDecision ?? {}),
      ...(damageDecision ?? {}),
      isReversing,
      reason
    };

    const mayApplyFacing = !damageDecision?.isBurning
      && !damageDecision?.isDestroyed;
    const fireControlOwnsTurret = Boolean(
      this.unit.targetUnit
      || this.unit.targetPos
      || this.unit.vehicleWeapon?.targetUnitId
      || this.unit.vehicleWeapon?.targetPos
    );
    if (mayApplyFacing && Number.isFinite(facingDecision?.nextHullYaw)) {
      this.unit.rotation = facingDecision.nextHullYaw;
    }
    if (
      mayApplyFacing
      && !fireControlOwnsTurret
      && Number.isFinite(facingDecision?.nextTurretYaw)
    ) {
      if (this.unit.vehicleWeapon) {
        this.unit.vehicleWeapon.turretYaw = facingDecision.nextTurretYaw;
      }
      this.unit.turretRotation = facingDecision.nextTurretYaw;
    }

    decision.turretFacingOwner = fireControlOwnsTurret
      ? 'fire-control'
      : 'threat-facing';

    this.threatFacingActive = decision.threatFacingActive ?? false;
    this.targetThreatPosition = decision.threatPosition ? [...decision.threatPosition] : null;
    this.targetThreatId = decision.targetThreatId ?? null;
    this.tacticalDecision = decision;
    this.unit.tacticalDecision = decision;

    return this.tacticalDecision;
  }

  captureState() {
    return {
      targetThreatPosition: this.targetThreatPosition ? [...this.targetThreatPosition] : null,
      targetThreatId: this.targetThreatId,
      threatFacingActive: this.threatFacingActive,
      isReversing: this.isReversing,
      tacticalDecision: this.tacticalDecision ? clonePlain(this.tacticalDecision) : null
    };
  }

  restoreState(savedState) {
    if (!savedState || typeof savedState !== 'object') {
      return this;
    }
    this.targetThreatPosition = savedState.targetThreatPosition ? [...savedState.targetThreatPosition] : null;
    this.targetThreatId = savedState.targetThreatId ?? null;
    this.threatFacingActive = savedState.threatFacingActive ?? false;
    this.isReversing = savedState.isReversing ?? false;
    this.tacticalDecision = savedState.tacticalDecision
      ? clonePlain(savedState.tacticalDecision)
      : null;

    if (this.unit) {
      if (this.tacticalDecision) this.unit.tacticalDecision = this.tacticalDecision;
    }
    return this;
  }
}
