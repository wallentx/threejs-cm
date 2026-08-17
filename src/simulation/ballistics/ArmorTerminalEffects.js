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


export const BEHIND_ARMOR_SPALL_MODEL = Object.freeze({
  version: 'behind-armor-spall-v1',
  rayCount: 24,
  representedFragmentsPerRay: 4,
  coneHalfAngleDegrees: 45,
  spallEnergyFraction: 0.12,
  minimumArmorEnergySpentJ: 500,
  dataQuality: [
    'bounded deterministic weighted-ray gameplay approximation',
    'spall energy is a conserved subset of energy deposited in the defeated plate',
    'fixed ray count represents a larger fragment population without persistent fragment entities',
    'projectile breakup, plate metallurgy, fragment mass distribution, and internal ricochet remain separate models'
  ].join('; ')
});

export const PROJECTILE_BREAKUP_MODEL = Object.freeze({
  version: 'projectile-breakup-v1',
  rayCount: 12,
  representedFragmentsPerRay: 3,
  coneHalfAngleDegrees: 18,
  maximumPenetrationRatio: 1.25,
  minimumCaliberMm: 20,
  minimumResidualEnergyJ: 250,
  fragmentEnergyFraction: 0.8,
  dataQuality: [
    'bounded deterministic gameplay approximation for marginal AP perforations',
    'the current weapon catalog does not yet describe projectile metallurgy or failure thresholds',
    'fragment energy is conserved from the post-plate residual-energy budget',
    'fixed representative rays terminate at the first modeled internal volume',
    'projectile-and-plate-specific breakup, fragment mass distribution, and internal ricochet remain future data work'
  ].join('; ')
});

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function scaledSum(axis, tangent, bitangent, axialScale, tangentScale, bitangentScale) {
  return [
    axis[0] * axialScale + tangent[0] * tangentScale + bitangent[0] * bitangentScale,
    axis[1] * axialScale + tangent[1] * tangentScale + bitangent[1] * bitangentScale,
    axis[2] * axialScale + tangent[2] * tangentScale + bitangent[2] * bitangentScale
  ];
}

function createDeterministicConeRays({
  axis,
  rayCount,
  coneHalfAngleDegrees,
  totalEnergyJ,
  representedFragmentsPerRay
}) {
  const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalized(cross(axis, helper));
  const bitangent = normalized(cross(axis, tangent));
  if (!tangent || !bitangent) return null;

  const equalRayEnergyJ = totalEnergyJ / rayCount;
  const radialMaximum = Math.sin(coneHalfAngleDegrees * Math.PI / 180);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const rays = [];
  for (let index = 0; index < rayCount; index++) {
    const radialScale = radialMaximum * Math.sqrt((index + 0.5) / rayCount);
    const axialScale = Math.sqrt(Math.max(0, 1 - radialScale * radialScale));
    const azimuth = index * goldenAngle;
    const rayDirection = normalized(scaledSum(
      axis,
      tangent,
      bitangent,
      axialScale,
      radialScale * Math.cos(azimuth),
      radialScale * Math.sin(azimuth)
    ));
    const energyJ = index === rayCount - 1
      ? Math.max(0, totalEnergyJ - equalRayEnergyJ * (rayCount - 1))
      : equalRayEnergyJ;
    rays.push({
      index,
      direction: rayDirection,
      energyJ,
      representedFragments: representedFragmentsPerRay
    });
  }
  return rays;
}

export function createBehindArmorSpallEvent({
  weapon,
  direction,
  armorEnergySpentJ,
  nominalArmorMm
}) {
  const axis = normalized(direction);
  const plateEnergyJ = Math.max(0, finite(armorEnergySpentJ));
  if (
    !axis
    || Math.max(0, finite(nominalArmorMm)) <= EPSILON
    || plateEnergyJ < BEHIND_ARMOR_SPALL_MODEL.minimumArmorEnergySpentJ
    || weapon?.kind === 'cannon_he'
    || finite(weapon?.explosiveRadius) > 0
  ) {
    return null;
  }

  const rayCount = BEHIND_ARMOR_SPALL_MODEL.rayCount;
  const totalSpallEnergyJ = Math.min(
    plateEnergyJ,
    plateEnergyJ * BEHIND_ARMOR_SPALL_MODEL.spallEnergyFraction
  );
  const rays = createDeterministicConeRays({
    axis,
    rayCount,
    coneHalfAngleDegrees: BEHIND_ARMOR_SPALL_MODEL.coneHalfAngleDegrees,
    totalEnergyJ: totalSpallEnergyJ,
    representedFragmentsPerRay:
      BEHIND_ARMOR_SPALL_MODEL.representedFragmentsPerRay
  });
  if (!rays) return null;

  return {
    kind: 'behind_armor_spall',
    modelVersion: BEHIND_ARMOR_SPALL_MODEL.version,
    dataQuality: BEHIND_ARMOR_SPALL_MODEL.dataQuality,
    rayCount,
    representedFragmentCount:
      rayCount * BEHIND_ARMOR_SPALL_MODEL.representedFragmentsPerRay,
    coneHalfAngleDegrees: BEHIND_ARMOR_SPALL_MODEL.coneHalfAngleDegrees,
    plateEnergyJ,
    energyFraction: BEHIND_ARMOR_SPALL_MODEL.spallEnergyFraction,
    totalSpallEnergyJ,
    rays
  };
}

/**
 * Breaks a marginally perforating non-explosive AP projectile into a bounded
 * forward cone. This is deliberately deterministic and data-labeled until
 * projectile construction and plate metallurgy are available in the catalog.
 */
export function createProjectileBreakupEvent({
  weapon,
  direction,
  penetrated,
  penetrationRatio,
  impactEnergyJ,
  plateResidualEnergyJ
}) {
  const axis = normalized(direction);
  const impactEnergy = Math.max(0, finite(impactEnergyJ));
  const residualEnergy = Math.min(
    impactEnergy,
    Math.max(0, finite(plateResidualEnergyJ))
  );
  const ratio = Math.max(0, finite(penetrationRatio));
  const explosiveProjectile = weapon?.kind === 'cannon_he'
    || finite(weapon?.explosiveRadius) > 0;
  if (
    !penetrated
    || !axis
    || explosiveProjectile
    || weapon?.kind !== 'cannon_ap'
    || finite(weapon?.caliberMm) < PROJECTILE_BREAKUP_MODEL.minimumCaliberMm
    || ratio < 1
    || ratio > PROJECTILE_BREAKUP_MODEL.maximumPenetrationRatio
    || residualEnergy < PROJECTILE_BREAKUP_MODEL.minimumResidualEnergyJ
  ) {
    return null;
  }

  const totalFragmentEnergyJ = Math.min(
    residualEnergy,
    residualEnergy * PROJECTILE_BREAKUP_MODEL.fragmentEnergyFraction
  );
  const deformationEnergyJ = Math.max(0, residualEnergy - totalFragmentEnergyJ);
  const rayCount = PROJECTILE_BREAKUP_MODEL.rayCount;
  const rays = createDeterministicConeRays({
    axis,
    rayCount,
    coneHalfAngleDegrees: PROJECTILE_BREAKUP_MODEL.coneHalfAngleDegrees,
    totalEnergyJ: totalFragmentEnergyJ,
    representedFragmentsPerRay:
      PROJECTILE_BREAKUP_MODEL.representedFragmentsPerRay
  });
  if (!rays) return null;

  return {
    kind: 'projectile_breakup',
    modelVersion: PROJECTILE_BREAKUP_MODEL.version,
    dataQuality: PROJECTILE_BREAKUP_MODEL.dataQuality,
    continuationKind: 'none',
    continuationReason: 'projectile_breakup',
    rayCount,
    representedFragmentCount:
      rayCount * PROJECTILE_BREAKUP_MODEL.representedFragmentsPerRay,
    coneHalfAngleDegrees: PROJECTILE_BREAKUP_MODEL.coneHalfAngleDegrees,
    penetrationRatio: ratio,
    residualEnergyJ: residualEnergy,
    energyFraction: PROJECTILE_BREAKUP_MODEL.fragmentEnergyFraction,
    totalFragmentEnergyJ,
    deformationEnergyJ,
    rays
  };
}

function resolveFragmentHits({
  event,
  intersections,
  energyBudgetJ,
  terminalEffectKind,
  modelField,
  dataQualityField
}) {
  if (!event?.rays?.length) {
    return {
      hits: [],
      hitRayCount: 0,
      hitVolumeIds: [],
      energyDepositedJ: 0
    };
  }
  const raysByIndex = new Map(event.rays.map(ray => [ray.index, ray]));
  const ordered = [...intersections].sort((left, right) =>
    finite(left.fragmentIndex) - finite(right.fragmentIndex)
      || finite(left.entryDistanceMeters) - finite(right.entryDistanceMeters)
      || String(left.id).localeCompare(String(right.id))
  );
  const grouped = new Map();
  for (const intersection of ordered) {
    const ray = raysByIndex.get(intersection.fragmentIndex);
    if (!ray || !(ray.energyJ > EPSILON) || !intersection.id) continue;
    const existing = grouped.get(intersection.id);
    if (existing) {
      existing.energyDepositedJ += ray.energyJ;
      existing.fragmentRayCount++;
      existing.representedFragmentCount += ray.representedFragments;
      existing.fragmentIndices.push(ray.index);
      if (finite(intersection.entryDistanceMeters) < existing.entryDistanceMeters) {
        existing.nearest = intersection;
        existing.entryDistanceMeters = finite(intersection.entryDistanceMeters);
      }
      continue;
    }
    grouped.set(intersection.id, {
      nearest: intersection,
      entryDistanceMeters: finite(intersection.entryDistanceMeters),
      energyDepositedJ: ray.energyJ,
      fragmentRayCount: 1,
      representedFragmentCount: ray.representedFragments,
      fragmentIndices: [ray.index]
    });
  }

  const hits = [...grouped.values()]
    .sort((left, right) =>
      left.entryDistanceMeters - right.entryDistanceMeters
        || String(left.nearest.id).localeCompare(String(right.nearest.id)))
    .map(aggregate => {
      const hit = aggregate.nearest;
      const profile = energyProfileForHit(hit);
      const energyDepositedJ = Math.min(energyBudgetJ, aggregate.energyDepositedJ);
      return {
        ...hit,
        crewRoles: [...(hit.crewRoles ?? [])],
        entryPoint: [...(hit.entryPoint ?? [0, 0, 0])],
        exitPoint: [...(hit.entryPoint ?? [0, 0, 0])],
        exitDistanceMeters: finite(hit.entryDistanceMeters),
        pathLengthMeters: 0,
        terminalEffectKind,
        [modelField]: event.modelVersion,
        [dataQualityField]: event.dataQuality,
        fragmentIndices: [...aggregate.fragmentIndices].sort((a, b) => a - b),
        fragmentRayCount: aggregate.fragmentRayCount,
        representedFragmentCount: aggregate.representedFragmentCount,
        entryEnergyJ: energyDepositedJ,
        resistanceEnergyDepositedJ: energyDepositedJ,
        terminalEnergyDepositedJ: 0,
        energyDepositedJ,
        exitEnergyJ: 0,
        damageSeverity: 1 - Math.exp(
          -energyDepositedJ / Math.max(1, profile.damageScaleJ)
        ),
        projectileStopped: true,
        energyModelDataQuality: profile.dataQuality
      };
    });

  return {
    hits,
    hitRayCount: hits.reduce((sum, hit) => sum + hit.fragmentRayCount, 0),
    hitVolumeIds: hits.map(hit => hit.id),
    energyDepositedJ: hits.reduce((sum, hit) => sum + hit.energyDepositedJ, 0)
  };
}

export function resolveBehindArmorSpallHits({ event, intersections = [] }) {
  return resolveFragmentHits({
    event,
    intersections,
    energyBudgetJ: event?.totalSpallEnergyJ ?? 0,
    terminalEffectKind: 'behind_armor_spall',
    modelField: 'spallModelVersion',
    dataQualityField: 'spallDataQuality'
  });
}

export function resolveProjectileBreakupHits({ event, intersections = [] }) {
  return resolveFragmentHits({
    event,
    intersections,
    energyBudgetJ: event?.totalFragmentEnergyJ ?? 0,
    terminalEffectKind: 'projectile_breakup',
    modelField: 'breakupModelVersion',
    dataQualityField: 'breakupDataQuality'
  });
}
