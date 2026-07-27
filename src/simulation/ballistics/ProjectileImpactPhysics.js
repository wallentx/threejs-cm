const EPSILON = 1e-9;

export const ARMOR_RICOCHET_MODEL = Object.freeze({
  version: 'cannon-ap-obliquity-v1',
  maximumRicochets: 2,
  minimumImpactAngleDegrees: 65,
  minimumSpeedRatio: 0.25,
  minimumRetainedEnergyRatio: 0.18,
  maximumRetainedEnergyRatio: 0.50,
  dataQuality: 'gameplay approximation pending projectile-and-plate-specific slope testing'
});

function components(value) {
  if (Array.isArray(value)) return value.map(component => Number(component) || 0);
  return [
    Number(value?.x) || 0,
    Number(value?.y) || 0,
    Number(value?.z) || 0
  ];
}

function normalize(value) {
  const vector = components(value);
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= EPSILON) return null;
  return vector.map(component => component / length);
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function stoppedResult(reason, common) {
  return {
    ...common,
    ricocheted: false,
    ricochetReason: reason,
    postImpactVelocity: null,
    postImpactSpeed: 0,
    outgoingEnergyJ: 0,
    retainedEnergyRatio: 0,
    separationNormal: null
  };
}

/**
 * Renderer-neutral first-order ricochet model.
 *
 * Angle and energy-retention thresholds are deliberately labeled gameplay
 * approximations until ammunition- and plate-specific test data is cataloged.
 * Results remain deterministic and expressed in scene metres/seconds.
 */
export function resolveArmorRicochet({
  weapon,
  velocity,
  impactNormal,
  impactAngleDegrees,
  penetrated,
  ricochetCount = 0
}) {
  const incomingVelocity = components(velocity);
  const impactSpeed = Math.hypot(...incomingVelocity);
  const projectileMassKg = Number(weapon?.projectileMassKg);
  const impactEnergyJ = Number.isFinite(projectileMassKg)
    ? 0.5 * projectileMassKg * impactSpeed * impactSpeed
    : null;
  const count = Math.max(0, Math.floor(ricochetCount));
  const common = {
    ricochetModelVersion: ARMOR_RICOCHET_MODEL.version,
    ricochetDataQuality: ARMOR_RICOCHET_MODEL.dataQuality,
    ricochetCount: count,
    impactVelocity: incomingVelocity,
    impactSpeed,
    impactEnergyJ
  };

  if (penetrated) {
    return {
      ...stoppedResult('penetrated', common),
      outgoingEnergyJ: null,
      retainedEnergyRatio: null
    };
  }
  if (weapon?.kind !== 'cannon_ap') {
    return stoppedResult('unsupported_ammunition', common);
  }
  if (count >= ARMOR_RICOCHET_MODEL.maximumRicochets) {
    return stoppedResult('ricochet_limit', common);
  }
  if (impactSpeed < (weapon.muzzleVelocity ?? impactSpeed) * ARMOR_RICOCHET_MODEL.minimumSpeedRatio) {
    return stoppedResult('speed_too_low', common);
  }
  if (impactAngleDegrees < ARMOR_RICOCHET_MODEL.minimumImpactAngleDegrees) {
    return stoppedResult('impact_too_square', common);
  }

  const incomingDirection = normalize(incomingVelocity);
  const surfaceNormal = normalize(impactNormal);
  if (!incomingDirection || !surfaceNormal) {
    return stoppedResult('invalid_vector', common);
  }
  if (dot(incomingDirection, surfaceNormal) > 0) {
    surfaceNormal[0] *= -1;
    surfaceNormal[1] *= -1;
    surfaceNormal[2] *= -1;
  }

  const grazingFraction = Math.min(
    1,
    Math.max(
      0,
      (impactAngleDegrees - ARMOR_RICOCHET_MODEL.minimumImpactAngleDegrees)
        / (90 - ARMOR_RICOCHET_MODEL.minimumImpactAngleDegrees)
    )
  );
  const retainedEnergyRatio = ARMOR_RICOCHET_MODEL.minimumRetainedEnergyRatio
    + grazingFraction
      * (ARMOR_RICOCHET_MODEL.maximumRetainedEnergyRatio
        - ARMOR_RICOCHET_MODEL.minimumRetainedEnergyRatio);
  const speedRetention = Math.sqrt(retainedEnergyRatio);
  const normalProjection = dot(incomingDirection, surfaceNormal);
  const reflectedDirection = incomingDirection.map(
    (component, axis) => component - 2 * normalProjection * surfaceNormal[axis]
  );
  const postImpactSpeed = impactSpeed * speedRetention;
  const postImpactVelocity = reflectedDirection.map(component => component * postImpactSpeed);

  return {
    ...common,
    ricocheted: true,
    ricochetReason: 'deflected',
    ricochetCount: count + 1,
    postImpactVelocity,
    postImpactSpeed,
    outgoingEnergyJ: impactEnergyJ == null ? null : impactEnergyJ * retainedEnergyRatio,
    retainedEnergyRatio,
    separationNormal: surfaceNormal,
    clearanceMeters: Math.max(0.012, (weapon.caliberMm ?? 0) / 1000 * 0.75)
  };
}
