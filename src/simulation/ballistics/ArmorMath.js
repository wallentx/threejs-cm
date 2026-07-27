/**
 * Convert nominal plate thickness into line-of-fire resistance.
 *
 * The 0.25 cosine floor preserves the current bounded approximation for
 * grazing impacts while projectile/plate-specific overmatch and breakup data
 * remain future work.
 */
export function effectiveArmorMm(nominalArmorMm, impactCosine) {
  return nominalArmorMm / Math.max(0.25, Math.abs(impactCosine));
}

/**
 * Scale the catalog's reference penetration by current projectile velocity.
 */
export function penetrationAtVelocity(weapon, velocity) {
  if (!weapon?.penetrationMmAt100m) return 0;
  const ratio = Math.max(0, velocity) / weapon.muzzleVelocity;
  return weapon.penetrationMmAt100m
    * Math.pow(ratio, weapon.penetrationVelocityExponent ?? 1.35);
}
