const SNEAK_INDIVIDUAL = Object.freeze({
  state: 'SNEAKING',
  stance: 'CROUCHED',
  speedMetersPerSecond: 1.15,
  movingFireAllowed: false
});

const SNEAK_FORMATION = Object.freeze({
  type: 'STAGGERED_FILE',
  lateralOffsetMeters: 0.45,
  longitudinalSpacingMeters: 1.05
});

/**
 * First-order gameplay approximation. These speeds and spacing describe a
 * cautious individual movement behavior, not a historical march-rate table or
 * a biomechanical model.
 */
export const SNEAK_INFANTRY_MOVEMENT_PROFILE = Object.freeze({
  id: 'SNEAK',
  modelVersion: 1,
  dataQuality: 'gameplay-approximation',
  description:
    'Slow crouched individual movement in a narrow staggered file; firing requires stopping.',
  anchorSpeedMetersPerSecond: 0.9,
  individual: SNEAK_INDIVIDUAL,
  formation: SNEAK_FORMATION
});

const CRAWL_INDIVIDUAL = Object.freeze({
  state: 'CRAWLING',
  stance: 'PRONE',
  speedMetersPerSecond: 0.72,
  movingFireAllowed: false
});

const CRAWL_FORMATION = Object.freeze({
  type: 'STAGGERED_FILE',
  lateralOffsetMeters: 0.38,
  longitudinalSpacingMeters: 1.15
});

/**
 * First-order gameplay approximation. CRAWL is deliberately slower than
 * SNEAK, keeps each soldier prone, and requires a complete stop before firing.
 */
export const CRAWL_INFANTRY_MOVEMENT_PROFILE = Object.freeze({
  id: 'CRAWL',
  modelVersion: 1,
  dataQuality: 'gameplay-approximation',
  description:
    'Very slow prone individual movement in a narrow staggered file; firing requires stopping.',
  anchorSpeedMetersPerSecond: 0.52,
  individual: CRAWL_INDIVIDUAL,
  formation: CRAWL_FORMATION
});

const ASSAULT_INDIVIDUAL = Object.freeze({
  state: 'ASSAULTING',
  stance: 'CROUCHED',
  speedMetersPerSecond: 2.2,
  movingFireAllowed: false
});

const ASSAULT_FORMATION = Object.freeze({
  type: 'STAGGERED_FILE',
  lateralOffsetMeters: 0.72,
  longitudinalSpacingMeters: 1.35
});

/**
 * First-order gameplay approximation. The squad anchor advances cautiously
 * while the buddy-bound coordinator alternates movers and stationary coverers.
 */
export const ASSAULT_INFANTRY_MOVEMENT_PROFILE = Object.freeze({
  id: 'ASSAULT',
  modelVersion: 1,
  dataQuality: 'gameplay-approximation',
  description:
    'Paired fire-and-movement with crouched movers and kneeling stationary coverers.',
  anchorSpeedMetersPerSecond: 1.45,
  individual: ASSAULT_INDIVIDUAL,
  formation: ASSAULT_FORMATION
});

const INFANTRY_MOVEMENT_ORDER_PROFILES = Object.freeze({
  SNEAK: SNEAK_INFANTRY_MOVEMENT_PROFILE,
  CRAWL: CRAWL_INFANTRY_MOVEMENT_PROFILE,
  ASSAULT: ASSAULT_INFANTRY_MOVEMENT_PROFILE
});

const INFANTRY_MOVEMENT_PROFILE_BY_STATE = Object.freeze({
  [SNEAK_INFANTRY_MOVEMENT_PROFILE.individual.state]:
    SNEAK_INFANTRY_MOVEMENT_PROFILE,
  [CRAWL_INFANTRY_MOVEMENT_PROFILE.individual.state]:
    CRAWL_INFANTRY_MOVEMENT_PROFILE,
  [ASSAULT_INFANTRY_MOVEMENT_PROFILE.individual.state]:
    ASSAULT_INFANTRY_MOVEMENT_PROFILE
});

export const INFANTRY_FENCE_VAULT_POLICY = Object.freeze({
  modelVersion: 1,
  dataQuality: 'gameplay-approximation',
  eligibleOrderTypes: Object.freeze(['QUICK', 'FAST']),
  durationSeconds: 0.62,
  presentationHeightMeters: 0.68,
  description:
    'Living infantry may vault fence colliders during QUICK or FAST movement; slower orders and vehicles remain blocked.'
});

export function canInfantryVaultFence(orderType) {
  return INFANTRY_FENCE_VAULT_POLICY.eligibleOrderTypes.includes(orderType);
}

export function getInfantryMovementOrderProfile(orderType) {
  return INFANTRY_MOVEMENT_ORDER_PROFILES[orderType] ?? null;
}

export function isInfantryOrderMovingFireProhibited(state) {
  const profile = INFANTRY_MOVEMENT_PROFILE_BY_STATE[state] ?? null;
  return profile ? !profile.individual.movingFireAllowed : false;
}

export function getInfantryMovementFormationOffset(orderType, index) {
  const profile = getInfantryMovementOrderProfile(orderType);
  if (!profile || !Number.isInteger(index) || index < 0) return null;
  const formation = profile.formation;
  if (formation.type !== 'STAGGERED_FILE') return null;
  return Object.freeze({
    x: index % 2 === 0
      ? -formation.lateralOffsetMeters
      : formation.lateralOffsetMeters,
    y: 0,
    z: index === 0 ? 0 : -index * formation.longitudinalSpacingMeters
  });
}
