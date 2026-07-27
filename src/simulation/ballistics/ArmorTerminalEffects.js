const EPSILON = 1e-9;
const REFERENCE_CALIBER_MM = 37;

export const ARMOR_PENETRATION_ENERGY_MODEL = Object.freeze({
  version: 'ballistic-limit-energy-v1',
  formula: 'v_residual = sqrt(v_impact^2 - v_ballistic_limit^2)',
  dataQuality: [
    'ballistic-limit energy relation is source-backed for an intact rigid projectile without plug-mass correction',
    'the current penetration curve supplies the inferred ballistic-limit speed',
    'projectile deformation, plug mass, breakup, and behind-armor debris require separate terminal-effect models'
  ].join('; '),
  references: Object.freeze([
    'https://ntrs.nasa.gov/api/citations/19870019149/downloads/19870019149.pdf?attachment=true',
    'https://www.eugeneleeslover.com/USNAVY/CHAPTER-4.php'
  ])
});

export const INTERNAL_ENERGY_PROFILES = Object.freeze({
  crew: Object.freeze({
    fixedJ: 850,
    perMeterJ: 1800,
    damageScaleJ: 1500,
    dataQuality: 'bounded gameplay approximation for a crewman and carried equipment'
  }),
  optics: Object.freeze({
    fixedJ: 1000,
    perMeterJ: 2500,
    damageScaleJ: 1800,
    dataQuality: 'bounded gameplay approximation for optical equipment'
  }),
  radio: Object.freeze({
    fixedJ: 1000,
    perMeterJ: 2800,
    damageScaleJ: 2000,
    dataQuality: 'bounded gameplay approximation for radio equipment'
  }),
  fuel: Object.freeze({
    fixedJ: 700,
    perMeterJ: 1600,
    damageScaleJ: 1800,
    dataQuality: 'bounded gameplay approximation for tankage and fuel'
  }),
  ammunition: Object.freeze({
    fixedJ: 2200,
    perMeterJ: 5200,
    damageScaleJ: 2500,
    dataQuality: 'bounded gameplay approximation for ammunition stowage'
  }),
  coax: Object.freeze({
    fixedJ: 1400,
    perMeterJ: 3600,
    damageScaleJ: 2500,
    dataQuality: 'bounded gameplay approximation for a mounted machine gun'
  }),
  hull_mg: Object.freeze({
    fixedJ: 1400,
    perMeterJ: 3600,
    damageScaleJ: 2500,
    dataQuality: 'bounded gameplay approximation for a mounted machine gun'
  }),
  breech: Object.freeze({
    fixedJ: 4500,
    perMeterJ: 9000,
    damageScaleJ: 6000,
    dataQuality: 'bounded gameplay approximation for a gun breech and recoil assembly'
  }),
  turret_traverse: Object.freeze({
    fixedJ: 4200,
    perMeterJ: 8500,
    damageScaleJ: 6000,
    dataQuality: 'bounded gameplay approximation for turret-ring machinery'
  }),
  engine: Object.freeze({
    fixedJ: 6000,
    perMeterJ: 12000,
    damageScaleJ: 8000,
    dataQuality: 'bounded gameplay approximation for a vehicle powerplant'
  }),
  transmission: Object.freeze({
    fixedJ: 6500,
    perMeterJ: 12500,
    damageScaleJ: 9000,
    dataQuality: 'bounded gameplay approximation for transmission and final-drive machinery'
  }),
  generic: Object.freeze({
    fixedJ: 3000,
    perMeterJ: 7000,
    damageScaleJ: 5000,
    dataQuality: 'bounded generic internal-equipment gameplay approximation'
  })
});

function finite(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function components(value) {
  if (Array.isArray(value)) return value.map(component => finite(component));
  return [
    finite(value?.x),
    finite(value?.y),
    finite(value?.z)
  ];
}

function normalized(value) {
  const result = components(value);
  const length = Math.hypot(...result);
  if (length <= EPSILON) return null;
  return result.map(component => component / length);
}

function kineticEnergy(massKg, speedMps) {
  return 0.5 * Math.max(0, massKg) * Math.max(0, speedMps) ** 2;
}

export function minimumPenetratorContinuationEnergyJ(weapon) {
  const explicit = finite(weapon?.terminalBallistics?.minimumContinuationEnergyJ, -1);
  if (explicit >= 0) return explicit;
  const caliberMm = Math.max(0, finite(weapon?.caliberMm));
  return Math.max(80, caliberMm * caliberMm * 0.12);
}

/**
 * First-order residual-energy solution after complete armor perforation.
 *
 * The existing penetration curve is inverted to obtain the ballistic-limit
 * velocity for this exact effective thickness. The square-speed difference
 * then supplies the intact projectile's residual energy. No plug mass,
 * projectile breakup, or armor debris is hidden inside this result.
 */
export function resolveArmorPerforationEnergy({
  weapon,
  velocity,
  penetrationMm,
  effectiveArmorMm,
  penetrated
}) {
  const impactVelocity = components(velocity);
  const impactSpeed = Math.hypot(...impactVelocity);
  const direction = normalized(impactVelocity);
  const projectileMassKg = Math.max(0, finite(weapon?.projectileMassKg));
  const impactEnergyJ = kineticEnergy(projectileMassKg, impactSpeed);
  const penetrationExponent = Math.max(
    0.1,
    finite(weapon?.penetrationVelocityExponent, 1.35)
  );
  const armorDemandMm = Math.max(0, finite(effectiveArmorMm));
  const availablePenetrationMm = Math.max(0, finite(penetrationMm));
  const demandRatio = armorDemandMm <= EPSILON
    ? 0
    : (availablePenetrationMm > EPSILON
        ? armorDemandMm / availablePenetrationMm
        : Infinity);
  const ballisticLimitSpeed = impactSpeed > EPSILON && Number.isFinite(demandRatio)
    ? impactSpeed * Math.max(0, demandRatio) ** (1 / penetrationExponent)
    : Infinity;
  const residualSpeedSquared = penetrated
    ? Math.max(0, impactSpeed * impactSpeed - ballisticLimitSpeed * ballisticLimitSpeed)
    : 0;
  const residualSpeed = Math.sqrt(residualSpeedSquared);
  const residualEnergyJ = kineticEnergy(projectileMassKg, residualSpeed);
  const armorEnergySpentJ = Math.max(0, impactEnergyJ - residualEnergyJ);
  const minimumEnergyJ = minimumPenetratorContinuationEnergyJ(weapon);
  const continues = Boolean(
    penetrated
    && direction
    && projectileMassKg > EPSILON
    && residualEnergyJ > minimumEnergyJ
  );

  return {
    penetrationModelVersion: ARMOR_PENETRATION_ENERGY_MODEL.version,
    penetrationDataQuality: ARMOR_PENETRATION_ENERGY_MODEL.dataQuality,
    penetrationReferenceUrls: [...ARMOR_PENETRATION_ENERGY_MODEL.references],
    impactVelocity,
    impactSpeed,
    impactEnergyJ,
    ballisticLimitSpeed: Number.isFinite(ballisticLimitSpeed)
      ? ballisticLimitSpeed
      : null,
    penetrationDemandRatio: Number.isFinite(demandRatio) ? demandRatio : null,
    armorEnergySpentJ,
    plateResidualEnergyJ: residualEnergyJ,
    plateResidualEnergyRatio: impactEnergyJ > EPSILON
      ? residualEnergyJ / impactEnergyJ
      : 0,
    plateResidualSpeed: residualSpeed,
    plateResidualVelocity: continues
      ? direction.map(component => component * residualSpeed)
      : null,
    minimumContinuationEnergyJ: minimumEnergyJ,
    continuationKind: continues ? 'penetrator' : 'none',
    continuationReason: penetrated
      ? (continues ? 'residual_energy' : 'ballistic_limit_exhausted')
      : 'armor_stopped',
    terminalEffect: penetrated
      ? (continues ? 'perforated_intact' : 'perforated_stopped')
      : 'stopped'
  };
}

function energyProfileForHit(hit) {
  if (hit?.energyAbsorption) {
    return {
      fixedJ: Math.max(0, finite(hit.energyAbsorption.fixedJ)),
      perMeterJ: Math.max(0, finite(hit.energyAbsorption.perMeterJ)),
      damageScaleJ: Math.max(1, finite(hit.energyAbsorption.damageScaleJ, 5000)),
      dataQuality: hit.energyAbsorption.dataQuality
        ?? 'vehicle-local energy absorption data'
    };
  }
  if (hit?.kind === 'crew') return INTERNAL_ENERGY_PROFILES.crew;
  return INTERNAL_ENERGY_PROFILES[hit?.componentId]
    ?? INTERNAL_ENERGY_PROFILES.generic;
}

/**
 * Deposits an intact penetrator's finite energy through ordered internal
 * volumes. A downstream volume cannot be hit after the projectile exhausts.
 */
export function resolveInternalPenetrationEnergy({
  weapon,
  pathHits,
  initialEnergyJ,
  impactEnergyJ
}) {
  const caliberScale = Math.max(
    0.15,
    (Math.max(1, finite(weapon?.caliberMm)) / REFERENCE_CALIBER_MM) ** 2
  );
  const minimumEnergyJ = minimumPenetratorContinuationEnergyJ(weapon);
  const internalInitialEnergyJ = Math.max(0, finite(initialEnergyJ));
  let remainingEnergyJ = internalInitialEnergyJ;
  let terminalEnergyDepositedJ = 0;
  let terminalDistanceMeters = 0;
  const resolvedHits = [];

  if (remainingEnergyJ <= minimumEnergyJ + EPSILON) {
    terminalEnergyDepositedJ = remainingEnergyJ;
    remainingEnergyJ = 0;
  }

  for (const hit of pathHits ?? []) {
    if (remainingEnergyJ <= EPSILON) break;
    const profile = energyProfileForHit(hit);
    const pathLengthMeters = Math.max(0, finite(hit.pathLengthMeters));
    const requestedDepositJ = (
      profile.fixedJ + profile.perMeterJ * pathLengthMeters
    ) * caliberScale;
    const entryEnergyJ = remainingEnergyJ;
    const energyToThresholdJ = Math.max(0, entryEnergyJ - minimumEnergyJ);
    const resistanceEnergyDepositedJ = Math.min(
      entryEnergyJ,
      requestedDepositJ,
      energyToThresholdJ
    );
    const candidateResidualEnergyJ = Math.max(
      0,
      entryEnergyJ - requestedDepositJ
    );
    const stopped = candidateResidualEnergyJ <= minimumEnergyJ + EPSILON;
    const hitTerminalEnergyDepositedJ = stopped
      ? Math.max(0, entryEnergyJ - resistanceEnergyDepositedJ)
      : 0;
    const energyDepositedJ = resistanceEnergyDepositedJ
      + hitTerminalEnergyDepositedJ;
    const damageScaleJ = Math.max(1, profile.damageScaleJ * caliberScale);
    const damageSeverity = 1 - Math.exp(-energyDepositedJ / damageScaleJ);
    remainingEnergyJ = stopped
      ? 0
      : Math.max(0, entryEnergyJ - resistanceEnergyDepositedJ);
    terminalEnergyDepositedJ += hitTerminalEnergyDepositedJ;
    const traversedFraction = requestedDepositJ > EPSILON
      ? Math.min(1, energyToThresholdJ / requestedDepositJ)
      : 1;
    terminalDistanceMeters = stopped
      ? finite(hit.entryDistanceMeters)
        + pathLengthMeters * traversedFraction
      : finite(hit.exitDistanceMeters, finite(hit.entryDistanceMeters));
    resolvedHits.push({
      ...hit,
      entryEnergyJ,
      resistanceEnergyDepositedJ,
      terminalEnergyDepositedJ: hitTerminalEnergyDepositedJ,
      energyDepositedJ,
      exitEnergyJ: remainingEnergyJ,
      entryEnergyRatio: impactEnergyJ > EPSILON
        ? entryEnergyJ / impactEnergyJ
        : 0,
      exitEnergyRatio: impactEnergyJ > EPSILON
        ? remainingEnergyJ / impactEnergyJ
        : 0,
      damageSeverity,
      projectileStopped: stopped,
      energyModelDataQuality: profile.dataQuality
    });
    if (stopped) break;
  }

  const projectileMassKg = Math.max(0, finite(weapon?.projectileMassKg));
  const residualSpeed = projectileMassKg > EPSILON
    ? Math.sqrt(2 * remainingEnergyJ / projectileMassKg)
    : 0;
  return {
    hits: resolvedHits,
    internalInitialEnergyJ,
    internalEnergySpentJ: Math.max(0, internalInitialEnergyJ - remainingEnergyJ),
    terminalEnergyDepositedJ,
    residualEnergyJ: remainingEnergyJ,
    residualSpeed,
    terminalDistanceMeters,
    stoppedInside: remainingEnergyJ <= EPSILON
  };
}
