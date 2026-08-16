export const INFANTRY_TARGET_ELIGIBILITY_MODEL_VERSION =
  'infantry-target-eligibility-v1';

function positiveArmorThicknesses(target) {
  return Object.values(target?.vehicleSpec?.armorMm ?? {})
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0);
}

function hasExposedCrew(target) {
  return Boolean(target?.getUnbuttonedCommander?.());
}

/**
 * Renderer-neutral fire-discipline gate. This deliberately asks only whether
 * the individual weapon has a plausible damaging or suppressive target; exact
 * impact location, angle, velocity, armor, and damage remain ballistic-owned.
 */
export function canInfantryWeaponEngageTarget(weapon, target) {
  if (!weapon || !target) return false;
  if (!target.vehicleSpec) return true;
  if (hasExposedCrew(target)) return true;

  const protectionClass = target.vehicleSpec.explosiveProtection?.class;
  const armor = positiveArmorThicknesses(target);
  const isArmored = protectionClass === 'armored_enclosed'
    || armor.length > 0;
  if (!isArmored) return true;

  const penetrationMm = Math.max(
    0,
    Number(weapon.penetrationMmAt100m) || 0
  );
  if (penetrationMm <= 0) return false;
  const weakestArmorMm = armor.length > 0 ? Math.min(...armor) : Infinity;
  return penetrationMm >= weakestArmorMm;
}
