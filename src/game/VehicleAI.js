import { evaluateVehicleThreatFacing } from '../simulation/vehicles/VehicleThreatFacing.js';
import { shouldVehicleReverse } from '../simulation/vehicles/VehicleReverseManeuver.js';
import { evaluateVehicleDamageBehavior } from '../simulation/vehicles/VehicleDamageBehavior.js';
import {
  advanceVehicleThreatResponse,
  captureVehicleThreatResponseState,
  completeVehicleThreatResponseMovement,
  createVehicleThreatResponseState,
  recordVehicleIncomingFire,
  vehicleThreatResponseMovementIntent
} from '../simulation/vehicles/VehicleThreatResponse.js';

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clonePlain(child)])
    );
  }
  return value;
}

function roundsInWeaponState(state) {
  if (!state) return 0;
  const reserve = state.ammunition
    ? Object.values(state.ammunition).reduce(
        (total, rounds) => total + Math.max(0, Number(rounds) || 0),
        0
      )
    : Math.max(0, Number(state.reserveAmmo) || 0);
  return reserve + Math.max(0, Number(state.feedAmmo) || 0);
}

function selectDecisionCrew(unit) {
  const mounted = unit.getMountedCrew?.() ?? [];
  const commander = mounted.find(crewman => /COMMANDER/.test(crewman.role));
  const decisionCrew = commander ?? mounted[0] ?? null;
  return {
    id: decisionCrew?.id ?? null,
    role: decisionCrew?.role ?? null
  };
}

function findSourceContact(contacts, sourceUnitId) {
  if (sourceUnitId == null) return null;
  return contacts.find(contact => String(contact?.id) === String(sourceUnitId)) ?? null;
}

function threatIsArmored(contact) {
  if (!contact) return true;
  const protectionClass = contact.protectionClass
    ?? contact.vehicleSpec?.explosiveProtection?.class;
  if (protectionClass) {
    return protectionClass === 'armored_enclosed';
  }
  return contact.threatClass === 'armor' || contact.type === 'tank';
}

function coaxCanAddress(unit, contact) {
  if (threatIsArmored(contact)) return false;
  const coax = (unit.vehicleSpec?.weaponMounts ?? [])
    .find(mount => mount.id === 'coax');
  if (!coax || !unit.isVehicleMountOperational?.(coax.id)) return false;
  return roundsInWeaponState(unit.vehicleMounts?.[coax.id]) > 0;
}

export class VehicleAI {
  constructor(unit = null, savedState = null) {
    this.unit = unit;
    this.targetThreatPosition = null;
    this.targetThreatId = null;
    this.threatFacingActive = false;
    this.isReversing = false;
    this.tacticalDecision = null;
    this.threatResponse = createVehicleThreatResponseState(
      savedState?.threatResponse
    );
    this.movementIntent = vehicleThreatResponseMovementIntent(
      this.threatResponse
    );
    this.responsePosition = [0, 0, 0];

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

    const sourceContact = findSourceContact(
      contacts,
      this.threatResponse.sourceUnitId
    );
    const mainGunRounds = roundsInWeaponState(this.unit.vehicleWeapon);
    const mainGunEffective = Boolean(
      this.unit.vehicleWeapon
      && !damageDecision?.mainGunDisabled
      && damageDecision?.gunnerAvailable
      && mainGunRounds > 0
    );
    const mainGunFailureReason = mainGunRounds <= 0
      ? 'main-ammunition-exhausted'
      : 'main-gun-disabled';
    const decisionCrew = selectDecisionCrew(this.unit);
    this.responsePosition[0] = this.unit.position.x;
    this.responsePosition[1] = this.unit.position.y;
    this.responsePosition[2] = this.unit.position.z;
    this.threatResponse = advanceVehicleThreatResponse(
      this.threatResponse,
      {
        deltaSeconds: Math.max(0, delta),
        position: this.responsePosition,
        hullYaw: this.unit.rotation,
        sourceIdentified: Boolean(sourceContact),
        mobilityDisabled: Boolean(damageDecision?.mobilityDisabled),
        mainGunEffective,
        mainGunFailureReason,
        coaxCanAddressThreat: coaxCanAddress(this.unit, sourceContact),
        suppression: this.unit.suppression,
        hasCommandedMovement: Boolean(context.targetPosition),
        decisionCrewId: decisionCrew.id,
        decisionCrewRole: decisionCrew.role
      }
    );
    if (
      this.threatResponse.phase === 'BAILOUT'
      && !this.unit.vehicleCrewBailout?.triggered
    ) {
      this.unit.triggerVehicleCrewBailout(
        'TACTICAL_IMMOBILIZATION',
        terrain
      );
    }
    const threatMovementIntent = vehicleThreatResponseMovementIntent(
      this.threatResponse
    );
    this.movementIntent = threatMovementIntent;

    const isReversing = shouldVehicleReverse({
      unit: this.unit,
      orderType: context.orderType,
      targetPosition: context.targetPosition,
      threatPosition,
      heavyThreat: context.heavyThreat
    });

    this.isReversing = Boolean(threatMovementIntent) || isReversing;
    let reason = 'idle';
    if (damageDecision?.isBurning || damageDecision?.isDestroyed) {
      reason = damageDecision.reason;
    } else if (this.threatResponse.phase !== 'ENGAGE') {
      reason = this.threatResponse.reason;
    } else if (damageDecision?.reason && damageDecision.reason !== 'operational') {
      reason = damageDecision.reason;
    } else if (isReversing) {
      reason = 'tactical-reverse';
    } else if (facingDecision?.reason) {
      reason = facingDecision.reason;
    }

    const decision = {
      ...(facingDecision ?? {}),
      ...(damageDecision ?? {}),
      isReversing: this.isReversing,
      reason,
      responsePhase: this.threatResponse.phase,
      responseReason: this.threatResponse.reason,
      incomingFireImpactCount: this.threatResponse.impactCount,
      incomingFireRemainingSeconds: this.threatResponse.pressureRemainingSeconds,
      incomingFireSourceIdentified: Boolean(sourceContact),
      decisionCrewId: this.threatResponse.decisionCrewId,
      decisionCrewRole: this.threatResponse.decisionCrewRole,
      movementIntent: threatMovementIntent ? clonePlain(threatMovementIntent) : null
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
      tacticalDecision: this.tacticalDecision ? clonePlain(this.tacticalDecision) : null,
      threatResponse: captureVehicleThreatResponseState(this.threatResponse)
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
    this.threatResponse = createVehicleThreatResponseState(
      savedState.threatResponse
    );
    this.movementIntent = vehicleThreatResponseMovementIntent(
      this.threatResponse
    );

    if (this.unit) {
      if (this.tacticalDecision) this.unit.tacticalDecision = this.tacticalDecision;
    }
    return this;
  }

  recordIncomingFire(report) {
    this.threatResponse = recordVehicleIncomingFire(
      this.threatResponse,
      report
    );
    return captureVehicleThreatResponseState(this.threatResponse);
  }

  getMovementIntent() {
    return this.movementIntent;
  }

  completeMovementIntent() {
    this.threatResponse = completeVehicleThreatResponseMovement(
      this.threatResponse
    );
    this.movementIntent = null;
  }
}
