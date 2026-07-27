const EPSILON = 1e-9;

export const VEHICLE_EXPLOSIVE_EFFECT_MODEL = Object.freeze({
  version: 'vehicle-explosive-direct-v1',
  internalRadiusFromExplosiveRadius: 0.35,
  openCoupling: 1,
  unarmoredEnclosedCoupling: 0.75,
  penetratedArmoredCoupling: 1,
  crewDamageFromWoundDamage: 1,
  componentDamageFromWoundDamage: 0.35,
  externalDamageFromWoundDamage: 0.12,
  maximumExternalDamage: 35,
  dataQuality: [
    'bounded unoccluded radial gameplay approximation using catalog wound-damage and explosive-radius values',
    'crew and module positions come from immutable vehicle internal-layout volumes',
    'explosive filler, fuze action, fragment cones, pressure, shielding, and compartment partitions are not yet resolved'
  ].join('; ')
});

const VALID_PROTECTION_CLASSES = new Set([
  'armored_enclosed',
  'unarmored_enclosed',
  'open'
]);

function finite(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function bounded(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointArray(value) {
  if (Array.isArray(value)) {
    return [finite(value[0]), finite(value[1]), finite(value[2])];
  }
  return [finite(value?.x), finite(value?.y), finite(value?.z)];
}

function compareText(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

function protectionClass(protection, nominalArmorMm) {
  if (VALID_PROTECTION_CLASSES.has(protection?.class)) return protection.class;
  return finite(nominalArmorMm) > 0
    ? 'armored_enclosed'
    : 'unarmored_enclosed';
}

function externalComponentForPart(armorPart) {
  if (armorPart === 'track') return 'tracks';
  if (armorPart === 'mantlet') return 'main_gun';
  return 'hull';
}

export function isVehicleExplosiveProjectile(weapon) {
  return weapon?.kind === 'cannon_he'
    || finite(weapon?.explosiveRadius) > 0;
}

export function vehicleInternalBlastRadiusMeters(weapon) {
  const caliberRadius = Math.max(0, finite(weapon?.caliberMm)) / 1000;
  const explosiveRadius = Math.max(0, finite(weapon?.explosiveRadius))
    * VEHICLE_EXPLOSIVE_EFFECT_MODEL.internalRadiusFromExplosiveRadius;
  return Math.max(caliberRadius, explosiveRadius);
}

function resolveInternalCoupling({
  className,
  penetrated,
  armorPart
}) {
  if (armorPart === 'track' || armorPart === 'mantlet') {
    return { allowed: false, mode: 'external_component', coupling: 0 };
  }
  if (className === 'open') {
    return {
      allowed: true,
      mode: 'open_compartment',
      coupling: VEHICLE_EXPLOSIVE_EFFECT_MODEL.openCoupling
    };
  }
  if (className === 'unarmored_enclosed') {
    return {
      allowed: true,
      mode: 'unarmored_compartment',
      coupling: VEHICLE_EXPLOSIVE_EFFECT_MODEL.unarmoredEnclosedCoupling
    };
  }
  if (penetrated) {
    return {
      allowed: true,
      mode: 'penetrated_armored_compartment',
      coupling: VEHICLE_EXPLOSIVE_EFFECT_MODEL.penetratedArmoredCoupling
    };
  }
  return { allowed: false, mode: 'external_armor', coupling: 0 };
}

function aggregateCrewIntents(candidates, radiusMeters, baseDamage) {
  const byRole = new Map();
  for (const candidate of candidates) {
    if (candidate.kind !== 'crew') continue;
    const falloff = bounded(1 - candidate.distanceMeters / radiusMeters, 0, 1);
    if (falloff <= EPSILON) continue;
    const damageAmount = bounded(baseDamage * falloff, 0, 100);
    for (const role of candidate.crewRoles ?? []) {
      const existing = byRole.get(role);
      if (!existing) {
        byRole.set(role, {
          crewRoles: [role],
          damageAmount,
          distanceMeters: candidate.distanceMeters,
          falloff,
          volumeIds: [candidate.id],
          layoutVersion: candidate.layoutVersion,
          dataQuality: candidate.dataQuality,
          referenceUrl: candidate.referenceUrl ?? null
        });
        continue;
      }
      existing.volumeIds.push(candidate.id);
      if (damageAmount > existing.damageAmount + EPSILON
          || (Math.abs(damageAmount - existing.damageAmount) <= EPSILON
            && candidate.distanceMeters < existing.distanceMeters)) {
        existing.damageAmount = damageAmount;
        existing.distanceMeters = candidate.distanceMeters;
        existing.falloff = falloff;
        existing.layoutVersion = candidate.layoutVersion;
        existing.dataQuality = candidate.dataQuality;
        existing.referenceUrl = candidate.referenceUrl ?? null;
      }
    }
  }
  return [...byRole.values()]
    .map(intent => ({
      ...intent,
      volumeIds: [...new Set(intent.volumeIds)].sort(compareText)
    }))
    .sort((a, b) =>
      a.distanceMeters - b.distanceMeters
        || compareText(a.crewRoles[0], b.crewRoles[0]));
}

function aggregateComponentIntents(candidates, radiusMeters, baseDamage) {
  const byComponent = new Map();
  for (const candidate of candidates) {
    if (candidate.kind !== 'component' || !candidate.componentId) continue;
    const falloff = bounded(1 - candidate.distanceMeters / radiusMeters, 0, 1);
    if (falloff <= EPSILON) continue;
    const damageAmount = bounded(baseDamage * falloff, 0, 100);
    const existing = byComponent.get(candidate.componentId);
    if (!existing) {
      byComponent.set(candidate.componentId, {
        componentId: candidate.componentId,
        damageAmount,
        distanceMeters: candidate.distanceMeters,
        falloff,
        volumeIds: [candidate.id],
        layoutVersion: candidate.layoutVersion,
        dataQuality: candidate.dataQuality,
        referenceUrl: candidate.referenceUrl ?? null
      });
      continue;
    }
    existing.volumeIds.push(candidate.id);
    if (damageAmount > existing.damageAmount + EPSILON
        || (Math.abs(damageAmount - existing.damageAmount) <= EPSILON
          && candidate.distanceMeters < existing.distanceMeters)) {
      existing.damageAmount = damageAmount;
      existing.distanceMeters = candidate.distanceMeters;
      existing.falloff = falloff;
      existing.layoutVersion = candidate.layoutVersion;
      existing.dataQuality = candidate.dataQuality;
      existing.referenceUrl = candidate.referenceUrl ?? null;
    }
  }
  return [...byComponent.values()]
    .map(intent => ({
      ...intent,
      volumeIds: [...new Set(intent.volumeIds)].sort(compareText)
    }))
    .sort((a, b) =>
      a.distanceMeters - b.distanceMeters
        || compareText(a.componentId, b.componentId));
}

/**
 * Produces immutable damage intents for one direct vehicle HE detonation.
 * Mutation, crew ownership, installed-component checks, and secondary-effect
 * RNG remain in the authoritative vehicle/unit layer.
 */
export function resolveVehicleExplosiveEffect({
  weapon,
  protection,
  penetrated,
  nominalArmorMm,
  effectiveArmorMm,
  armorPart,
  detonationPoint,
  internalCandidates = []
}) {
  if (!isVehicleExplosiveProjectile(weapon)) return null;

  const className = protectionClass(protection, nominalArmorMm);
  const internal = resolveInternalCoupling({
    className,
    penetrated: Boolean(penetrated),
    armorPart
  });
  const radiusMeters = vehicleInternalBlastRadiusMeters(weapon);
  const woundDamage = Math.max(0, finite(weapon?.woundDamage));
  const crewBaseDamage = woundDamage
    * internal.coupling
    * VEHICLE_EXPLOSIVE_EFFECT_MODEL.crewDamageFromWoundDamage;
  const componentBaseDamage = woundDamage
    * internal.coupling
    * VEHICLE_EXPLOSIVE_EFFECT_MODEL.componentDamageFromWoundDamage;
  const candidates = internal.allowed ? internalCandidates : [];

  return {
    kind: 'vehicle_explosive_direct',
    cause: VEHICLE_EXPLOSIVE_EFFECT_MODEL.version.replaceAll('-', '_'),
    modelVersion: VEHICLE_EXPLOSIVE_EFFECT_MODEL.version,
    dataQuality: VEHICLE_EXPLOSIVE_EFFECT_MODEL.dataQuality,
    detonationPoint: pointArray(detonationPoint),
    protection: {
      class: className,
      dataQuality: protection?.dataQuality
        ?? 'derived from nominal catalog armor; vehicle-specific classification pending',
      referenceUrl: protection?.referenceUrl ?? null
    },
    protectionResult: internal.mode,
    interiorExposed: internal.allowed,
    coupling: internal.coupling,
    internalRadiusMeters: radiusMeters,
    impactArmorMm: Math.max(0, finite(nominalArmorMm)),
    effectiveArmorMm: Math.max(0, finite(effectiveArmorMm)),
    externalIntent: {
      componentId: externalComponentForPart(armorPart),
      damageAmount: bounded(
        woundDamage * VEHICLE_EXPLOSIVE_EFFECT_MODEL.externalDamageFromWoundDamage,
        0,
        VEHICLE_EXPLOSIVE_EFFECT_MODEL.maximumExternalDamage
      ),
      armorPart: armorPart ?? null,
      dataQuality: 'bounded surface-damage gameplay approximation'
    },
    crewIntents: internal.allowed && radiusMeters > EPSILON
      ? aggregateCrewIntents(candidates, radiusMeters, crewBaseDamage)
      : [],
    componentIntents: internal.allowed && radiusMeters > EPSILON
      ? aggregateComponentIntents(candidates, radiusMeters, componentBaseDamage)
      : []
  };
}
