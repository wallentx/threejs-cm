import { penetrationAtVelocity } from '../ballistics/ArmorMath.js';

export const VEHICLE_ENGAGEMENT_LEARNING_MODEL_VERSION =
  'vehicle-engagement-learning-v1';

const HITS_PER_ADAPTATION = 2;
const AMMO_TRIAL_HITS = 4;
const RETARGET_HITS = 4;
const MIN_RETARGET_SCORE_ADVANTAGE = 10;

function freshState(targetUnitId = null) {
  return {
    modelVersion: VEHICLE_ENGAGEMENT_LEARNING_MODEL_VERSION,
    targetUnitId,
    ineffectiveHits: 0,
    effectiveHits: 0,
    aimStep: 0,
    ammoTrialRequested: false,
    retargetRequested: false,
    lastOutcome: null,
    adaptiveRetargetCount: 0,
    lastRetargetFromUnitId: null,
    lastRetargetToUnitId: null
  };
}

export function createVehicleEngagementLearningState(saved = null) {
  if (!saved) return freshState();
  return {
    modelVersion: VEHICLE_ENGAGEMENT_LEARNING_MODEL_VERSION,
    targetUnitId: saved.targetUnitId ?? null,
    ineffectiveHits: Math.max(0, Math.floor(saved.ineffectiveHits ?? 0)),
    effectiveHits: Math.max(0, Math.floor(saved.effectiveHits ?? 0)),
    aimStep: Math.max(0, Math.floor(saved.aimStep ?? 0)),
    ammoTrialRequested: Boolean(saved.ammoTrialRequested),
    retargetRequested: Boolean(saved.retargetRequested),
    lastOutcome: saved.lastOutcome ?? null,
    adaptiveRetargetCount: Math.max(
      0,
      Math.floor(saved.adaptiveRetargetCount ?? 0)
    ),
    lastRetargetFromUnitId: saved.lastRetargetFromUnitId ?? null,
    lastRetargetToUnitId: saved.lastRetargetToUnitId ?? null
  };
}

export function captureVehicleEngagementLearningState(state) {
  if (!state) return null;
  return createVehicleEngagementLearningState(state);
}

export function setVehicleEngagementTarget(state, targetUnitId) {
  const normalizedId = targetUnitId ?? null;
  if (state.targetUnitId === normalizedId) return state;
  const history = {
    adaptiveRetargetCount: state.adaptiveRetargetCount,
    lastRetargetFromUnitId: state.lastRetargetFromUnitId,
    lastRetargetToUnitId: state.lastRetargetToUnitId
  };
  Object.assign(state, freshState(normalizedId));
  Object.assign(state, history);
  return state;
}

function causedDecisiveObservableEffect(result) {
  const crew = result?.crewResult;
  return Boolean(
    crew?.destroyed
    || crew?.burning
    || crew?.secondaryExplosion
  );
}

function causedResolvedDamage(result) {
  const crew = result?.crewResult;
  return Boolean(
    crew?.casualty
    || crew?.casualties?.length
    || crew?.components?.length
  );
}

/**
 * Records only resolved cannon impacts. A penetration is not automatically
 * decisive: hidden internal damage is not omniscient feedback to the firing
 * crew. If the target remains visibly combat-effective, continued stops,
 * ricochets, penetrations, and partial damage all advance adaptation.
 */
export function recordVehicleEngagementImpact(state, {
  targetUnitId,
  weapon,
  result
} = {}) {
  if (!state || !targetUnitId || !weapon?.kind?.startsWith('cannon')) {
    return state;
  }
  // An older projectile can arrive after this gun has selected a new target.
  // Its outcome remains valid ballistics but must not replace the active
  // target's learning record.
  if (state.targetUnitId !== targetUnitId) return state;
  if (causedDecisiveObservableEffect(result)) {
    state.effectiveHits++;
    state.ineffectiveHits = 0;
    state.aimStep = 0;
    state.ammoTrialRequested = false;
    state.retargetRequested = false;
    state.lastOutcome = 'EFFECTIVE';
    return state;
  }

  if (causedResolvedDamage(result)) state.effectiveHits++;
  state.ineffectiveHits++;
  state.aimStep = Math.floor(state.ineffectiveHits / HITS_PER_ADAPTATION);
  state.ammoTrialRequested = state.ineffectiveHits >= AMMO_TRIAL_HITS;
  state.retargetRequested = state.ineffectiveHits >= RETARGET_HITS;
  state.lastOutcome = causedResolvedDamage(result)
    ? 'DAMAGE_TARGET_STILL_EFFECTIVE'
    : (result?.penetrated
      ? 'PENETRATED_NO_OBSERVABLE_EFFECT'
      : (result?.ricocheted ? 'RICOCHET' : 'STOPPED'));
  return state;
}

export function recordAdaptiveVehicleRetarget(state, {
  fromTargetUnitId,
  toTargetUnitId
} = {}) {
  if (!state || !fromTargetUnitId || !toTargetUnitId
      || fromTargetUnitId === toTargetUnitId) return state;
  state.adaptiveRetargetCount++;
  state.lastRetargetFromUnitId = fromTargetUnitId;
  state.lastRetargetToUnitId = toTargetUnitId;
  return state;
}

export function selectVehicleEngagementAim(aimPoints, state) {
  if (!Array.isArray(aimPoints) || aimPoints.length === 0) return null;
  const step = Math.max(0, state?.aimStep ?? 0);
  return aimPoints[step % aimPoints.length];
}

export function selectAdaptiveVehicleAmmoType({
  state,
  mode,
  defaultAmmoType,
  vehicleSpec,
  weaponLookup,
  ammunitionState
} = {}) {
  if ((mode != null && mode !== 'TARGET') || !state?.ammoTrialRequested) {
    return defaultAmmoType;
  }
  const alternate = defaultAmmoType === 'ap' ? 'he' : 'ap';
  const weaponId = vehicleSpec?.mainGun?.[alternate];
  const available = (ammunitionState?.ammunition?.[alternate] ?? 0) > 0
    || (ammunitionState?.loadedType === alternate
      && (ammunitionState?.feedAmmo ?? 0) > 0);
  const weapon = weaponId ? weaponLookup?.(weaponId) : null;
  if (!available || !weapon) return defaultAmmoType;
  if (alternate === 'he' && !(weapon.explosiveRadius > 0)) {
    return defaultAmmoType;
  }
  return alternate;
}

function armorAspect(target, attackerPosition) {
  const dx = attackerPosition.x - target.position.x;
  const dz = attackerPosition.z - target.position.z;
  const cosine = Math.cos(target.rotation ?? 0);
  const sine = Math.sin(target.rotation ?? 0);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  if (Math.abs(localZ) >= Math.abs(localX)) {
    return localZ >= 0 ? 'front' : 'rear';
  }
  return 'side';
}

function aspectArmorMm(target, aspect) {
  const armor = target?.vehicleSpec?.armorMm ?? {};
  const values = [`hull_${aspect}`, `turret_${aspect}`]
    .map(key => Number(armor[key]))
    .filter(value => Number.isFinite(value) && value > 0);
  return values.length > 0 ? Math.min(...values) : 0;
}

export function scoreVehicleThreatTarget({ attacker, target, weapon } = {}) {
  if (!attacker?.position || !target?.position || !target.vehicleSpec) {
    return Number.NEGATIVE_INFINITY;
  }
  const distance = attacker.position.distanceTo(target.position);
  const aspect = armorAspect(target, attacker.position);
  const armorMm = aspectArmorMm(target, aspect);
  const penetrationMm = penetrationAtVelocity(
    weapon,
    weapon?.muzzleVelocity ?? 0
  );
  const penetrationRatio = armorMm > 0 ? penetrationMm / armorMm : 2;
  const targetingAttacker = target.targetUnit?.id === attacker.id
    || target.vehicleWeapon?.targetUnitId === attacker.id;
  const armedThreat = Boolean(target.vehicleSpec.mainGun)
    || (target.vehicleSpec.weaponMounts ?? []).some(mount => mount.kind === 'cannon');
  const penetrationOpportunity = penetrationRatio >= 1
    ? 70 + Math.min(2, penetrationRatio - 1) * 25
    : -60 + Math.max(0, penetrationRatio) * 40;
  return (
    (targetingAttacker ? 28 : 0)
    + (armedThreat ? 20 : 0)
    + (target.recentFireActivitySeconds > 0 ? 10 : 0)
    + penetrationOpportunity
    + (aspect === 'rear' ? 12 : (aspect === 'side' ? 8 : 0))
    - distance * 0.08
  );
}

export function isArmoredCannonThreat(target) {
  const armed = Boolean(target?.vehicleSpec?.mainGun)
    || (target?.vehicleSpec?.weaponMounts ?? [])
      .some(mount => mount.kind === 'cannon');
  const armored = Object.values(target?.vehicleSpec?.armorMm ?? {})
    .some(value => Number(value) > 0);
  return armed && armored;
}

function weaponStateHasAmmunition(state) {
  if (!state) return false;
  if ((state.feedAmmo ?? 0) > 0) return true;
  return Object.values(state.ammunition ?? {})
    .some(rounds => Number(rounds) > 0);
}

/**
 * Current combat capability, not nominal catalog armament. Mobility damage
 * alone does not neutralize a tank: an immobilized cannon remains a threat.
 */
export function isOperationalArmoredCannonThreat(target) {
  if (!isArmoredCannonThreat(target)) return false;
  if (target.isCombatEffective?.() === false) return false;
  if (target.vehicleDamageState?.burning
      || target.vehicleDamageState?.secondaryExplosion) return false;

  const hasRuntimeWeaponState = Boolean(
    target.vehicleComponents
    || target.vehicleWeapon
    || target.vehicleMounts
  );
  if (!hasRuntimeWeaponState) return true;

  const mainOperational = Boolean(
    target.vehicleSpec?.mainGun
    && target.hasOperationalGunner?.()
    && weaponStateHasAmmunition(target.vehicleWeapon)
  );
  const mountedCannonOperational = (target.vehicleSpec?.weaponMounts ?? [])
    .filter(mount => mount.kind === 'cannon')
    .some(mount => target.isVehicleMountOperational?.(mount.id)
      && weaponStateHasAmmunition(target.vehicleMounts?.[mount.id]));
  return mainOperational || mountedCannonOperational;
}

export function selectAdaptiveVehicleTarget({
  attacker,
  candidates,
  currentTarget,
  weapon
} = {}) {
  const stableCandidates = [...(candidates ?? [])]
    .filter(isOperationalArmoredCannonThreat)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (stableCandidates.length === 0) return currentTarget ?? null;
  const scored = stableCandidates
    .map(target => ({
      target,
      score: scoreVehicleThreatTarget({ attacker, target, weapon })
    }))
    .sort((left, right) => right.score - left.score
      || String(left.target.id).localeCompare(String(right.target.id)));
  if (!currentTarget) return scored[0]?.target ?? null;
  const currentScore = scoreVehicleThreatTarget({
    attacker,
    target: currentTarget,
    weapon
  });
  const alternative = scored.find(entry => entry.target.id !== currentTarget.id);
  if (!alternative
      || alternative.score < currentScore + MIN_RETARGET_SCORE_ADVANTAGE) {
    return currentTarget;
  }
  return alternative.target;
}
